import { describe, expect, test, vi } from "vitest";

import {
  MAX_SPRITE_PIXELS,
  buildSpriteSheet,
  createBrowserFactory,
  readImageDimensions,
  resizeImage,
  toWebP,
  type CanvasFactory,
  type CanvasLike,
  type DecodedImage,
  type ImageContext2D,
} from "@/lib/image/process";

vi.mock("@/lib/image/animated", async () => {
  const actual = await vi.importActual("@/lib/image/animated");
  return {
    ...actual,
    isAnimatedImage: vi.fn(),
  };
});

// ─────────────────────────────────────────────────────────────────────────
// Mock canvas : jsdom n'implémente PAS le rendu 2D (getContext → null).
// Le module est testé à travers l'abstraction CanvasFactory injectée.
// ─────────────────────────────────────────────────────────────────────────

interface DrawCall {
  image: DecodedImage;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

interface ToBlobCall {
  type: string | undefined;
  quality: number | undefined;
}

class MockContext implements ImageContext2D {
  constructor(private readonly draws: DrawCall[]) {}

  drawImage(
    image: DecodedImage,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    this.draws.push({ image, dx, dy, dw, dh });
  }
}

class MockCanvas implements CanvasLike {
  readonly draws: DrawCall[] = [];
  readonly toBlobCalls: ToBlobCall[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext2D(): ImageContext2D | null {
    return new MockContext(this.draws);
  }

  toBlob(
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ): void {
    this.toBlobCalls.push({ type, quality });
    callback(new Blob([new Uint8Array([0x01, 0x02, 0x03])], { type }));
  }
}

interface MockImage extends DecodedImage {
  id: string;
}

function img(id: string, width: number, height: number): MockImage {
  return { id, width, height };
}

interface MockFactoryHandle extends CanvasFactory {
  canvases: MockCanvas[];
  decodeCalls: string[];
  /** Crée un Blob lié par identité à l'image mockée `id` (résolu par decodeImage). */
  file(id: string, type?: string): Blob;
}

/** Factory mockée : decodeImage résout par identité de Blob (jsdom n'expose pas Blob.text/arrayBuffer). */
function mockFactory(images: MockImage[]): MockFactoryHandle {
  const byBlob = new Map<Blob, MockImage>();
  const canvases: MockCanvas[] = [];
  const decodeCalls: string[] = [];

  return {
    canvases,
    decodeCalls,
    file(id: string, type = "image/png"): Blob {
      const image =
        images.find((i) => i.id === id) ?? img(id, 100, 100);
      const blob = new Blob([id], { type });
      byBlob.set(blob, image);
      return blob;
    },
    createCanvas: vi.fn((width: number, height: number) => {
      const canvas = new MockCanvas(width, height);
      canvases.push(canvas);
      return canvas;
    }),
    decodeImage: vi.fn(async (blob: Blob): Promise<DecodedImage> => {
      const found = byBlob.get(blob);
      if (!found) throw new Error("mock: Blob non enregistré par factory.file()");
      decodeCalls.push(found.id);
      return found;
    }),
  };
}

describe("readImageDimensions(file)", () => {
  test("lit les dimensions réelles via le décodeur", async () => {
    const factory = mockFactory([img("a", 1200, 800)]);
    const dims = await readImageDimensions(factory.file("a"), factory);
    expect(dims).toEqual({ width: 1200, height: 800 });
  });

  test("rejette un fichier non-image avant décodage", async () => {
    const factory = mockFactory([]);
    await expect(
      readImageDimensions(factory.file("a", "text/plain"), factory),
    ).rejects.toMatchObject({ name: "ImageProcessingError", code: "NOT_IMAGE" });
  });

  test("rejette un type d'image non supporté", async () => {
    const factory = mockFactory([]);
    await expect(
      readImageDimensions(factory.file("a", "image/tiff"), factory),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });
});

describe("resizeImage(file)", () => {
  test("conserve la taille native : 3000×2000 → canvas 3000×2000, pas de downscale", async () => {
    const factory = mockFactory([img("full", 3000, 2000)]);
    const blob = await resizeImage(factory.file("full"), { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(3000);
    expect(canvas.height).toBe(2000);
    expect(canvas.draws).toEqual([
      { image: expect.objectContaining({ width: 3000, height: 2000 }), dx: 0, dy: 0, dw: 3000, dh: 2000 },
    ]);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.9 }]);
  });

  test("ne fait PAS d'upscale : 800×600 → canvas 800×600 inchangé", async () => {
    const factory = mockFactory([img("small", 800, 600)]);
    const blob = await resizeImage(factory.file("small"), { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.draws[0]).toEqual(
      expect.objectContaining({ dw: 800, dh: 600 }),
    );
  });

  test("image déjà à la limite → dimensions conservées (pas de double resize)", async () => {
    const factory = mockFactory([img("exact", 16384, 9000)]);
    await resizeImage(factory.file("exact"), { factory });
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(16384);
    expect(canvas.height).toBe(9000);
  });

  test("downscale uniquement au-delà de MAX_CANVAS_DIMENSION : 20000×2000 → 16384×1638", async () => {
    const factory = mockFactory([img("huge", 20000, 2000)]);
    const blob = await resizeImage(factory.file("huge"), { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(16384);
    expect(canvas.height).toBe(1638);
    expect(canvas.draws).toEqual([
      { image: expect.objectContaining({ width: 20000, height: 2000 }), dx: 0, dy: 0, dw: 16384, dh: 1638 },
    ]);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.9 }]);
  });

  test("rejette un fichier non-image", async () => {
    const factory = mockFactory([]);
    await expect(
      resizeImage(factory.file("x", "application/pdf"), { factory }),
    ).rejects.toMatchObject({ code: "NOT_IMAGE" });
  });

  test("rejette un type d'image non supporté (image/tiff)", async () => {
    const factory = mockFactory([]);
    await expect(
      resizeImage(factory.file("x", "image/tiff"), { factory }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  test("lève CANVAS_UNAVAILABLE si le canvas n'expose pas de contexte 2D", async () => {
    const factory: CanvasFactory = {
      createCanvas: () =>
        ({
          width: 10,
          height: 10,
          getContext2D: () => null,
          toBlob: () => {},
        }) as CanvasLike,
      decodeImage: async () => img("c", 800, 600),
    };
    await expect(
      resizeImage(new Blob(["c"], { type: "image/png" }), { factory }),
    ).rejects.toMatchObject({ code: "CANVAS_UNAVAILABLE" });
  });
});

describe("toWebP(blob, quality=0.9)", () => {
  test("encode en image/webp à la qualité par défaut 0.9", async () => {
    const factory = mockFactory([img("p", 100, 50)]);
    const blob = await toWebP(factory.file("p"), undefined, { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.9 }]);
  });

  test("accepte une qualité explicite", async () => {
    const factory = mockFactory([img("p", 100, 50)]);
    await toWebP(factory.file("p"), 0.5, { factory });
    expect(factory.canvases[0].toBlobCalls[0].quality).toBe(0.5);
  });
});

describe("buildSpriteSheet(files, {maxColumns=10})", () => {
  test("25 images, maxColumns 10 → grille 10×3, frameCount 25, dims uniformes", async () => {
    const images = Array.from({ length: 25 }, (_, i) => img(`f${i}`, 1600, 900));
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => factory.file(i.id)),
      { maxColumns: 10, factory },
    );

    expect(sheet).toMatchObject({
      frameCount: 25,
      columns: 10,
      rows: 3,
    });
    expect(sheet.spriteBlob.type).toBe("image/webp");

    // 16000×2700 dépasserait le budget mémoire : les frames sont réduites
    // proportionnellement, jamais la grille.
    expect(sheet.frameWidth).toBeLessThan(1600);
    expect(sheet.frameHeight).toBeLessThan(900);
    expect(
      sheet.frameWidth * sheet.columns * sheet.frameHeight * sheet.rows,
    ).toBeLessThanOrEqual(MAX_SPRITE_PIXELS);

    const canvas = factory.canvases[0];
    expect(canvas.draws).toHaveLength(25);
    expect(canvas.width).toBe(sheet.frameWidth * sheet.columns);
    expect(canvas.height).toBe(sheet.frameHeight * sheet.rows);
  });

  test("1 image → 1 frame, grille 1×1, dims de la source", async () => {
    const factory = mockFactory([img("solo", 800, 1200)]);
    const sheet = await buildSpriteSheet([factory.file("solo")], { factory });

    expect(sheet).toMatchObject({
      frameCount: 1,
      columns: 1,
      rows: 1,
      frameWidth: 800,
      frameHeight: 1200,
    });
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(1200);
    expect(canvas.draws[0]).toMatchObject({ dx: 0, dy: 0, dw: 800, dh: 1200 });
  });

  test("normalise des frames hétérogènes : cellule commune + cadrage centré", async () => {
    const factory = mockFactory([img("a", 1600, 900), img("b", 800, 450)]);
    const sheet = await buildSpriteSheet([factory.file("a"), factory.file("b")], { factory });

    expect(sheet.frameWidth).toBe(1600);
    expect(sheet.frameHeight).toBe(900);
    // frame b (800×450) centrée dans SA cellule : col 1 → 1600 + centrage 400
    expect(factory.canvases[0].draws[1]).toMatchObject({
      dx: 2000,
      dy: 225,
      dw: 800,
      dh: 450,
    });
  });

  test("réduit une frame géante sous le budget mémoire : 20000×2000", async () => {
    const factory = mockFactory([img("wide", 20000, 2000)]);
    const sheet = await buildSpriteSheet([factory.file("wide")], { factory });

    expect(sheet.frameWidth).toBeLessThan(16384);
    expect(sheet.frameWidth * sheet.frameHeight).toBeLessThanOrEqual(
      MAX_SPRITE_PIXELS,
    );
    // Ratio conservé.
    expect(sheet.frameWidth / sheet.frameHeight).toBeCloseTo(10, 1);
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(sheet.frameWidth);
    expect(canvas.height).toBe(sheet.frameHeight);
  });

  test("grille 100 frames 1600×1600 : grille conservée, frames réduites", async () => {
    const images = Array.from({ length: 100 }, (_, i) => img(`f${i}`, 1600, 1600));
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => factory.file(i.id)),
      { maxColumns: 10, factory },
    );

    expect(sheet.columns).toBe(10);
    expect(sheet.rows).toBe(10);
    expect(
      sheet.frameWidth * sheet.columns * sheet.frameHeight * sheet.rows,
    ).toBeLessThanOrEqual(MAX_SPRITE_PIXELS);
    expect(factory.canvases[0].width).toBe(sheet.frameWidth * 10);
  });

  test("110 frames : la grille est réduite, pas rejetée", async () => {
    const images = Array.from({ length: 110 }, (_, i) => img(`f${i}`, 1600, 1600));
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => factory.file(i.id)),
      { maxColumns: 10, factory },
    );

    expect(sheet.rows).toBe(11);
    expect(
      sheet.frameWidth * sheet.columns * sheet.frameHeight * sheet.rows,
    ).toBeLessThanOrEqual(MAX_SPRITE_PIXELS);
  });

  test("rejette un lot vide", async () => {
    const factory = mockFactory([]);
    await expect(buildSpriteSheet([], { factory })).rejects.toMatchObject({
      code: "EMPTY_BATCH",
    });
  });

  test("rejette une frame non-image au milieu du lot", async () => {
    const factory = mockFactory([img("a", 100, 100)]);
    await expect(
      buildSpriteSheet([factory.file("a"), factory.file("junk", "text/html")], { factory }),
    ).rejects.toMatchObject({ code: "NOT_IMAGE" });
  });

  test("rejette une frame animée (GIF/WebP) avec erreur explicite", async () => {
    const { isAnimatedImage } = await import("@/lib/image/animated");
    vi.mocked(isAnimatedImage).mockResolvedValue(true);

    const factory = mockFactory([img("static", 100, 100)]);
    const animatedBlob = factory.file("static", "image/gif");

    await expect(
      buildSpriteSheet([animatedBlob], { factory }),
    ).rejects.toThrow("le type animation attend des frames statiques, pas un fichier animé");
  });
});

describe("createBrowserFactory (adaptateur navigateur)", () => {
  test("documente la limite jsdom : getContext('2d') → null (aucun rendu en test)", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const factory = createBrowserFactory();
      const canvas = factory.createCanvas(10, 10);
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(10);
      expect(canvas.getContext2D()).toBeNull();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
