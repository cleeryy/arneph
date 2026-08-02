import { beforeEach, describe, expect, test, vi } from "vitest";

import {
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

/** Blob dont le contenu texte sert d'id vers une image mockée. */
function file(id: string, type = "image/png"): Blob {
  return new Blob([id], { type });
}

interface MockFactoryHandle extends CanvasFactory {
  canvases: MockCanvas[];
  decodeCalls: string[];
}

/** Crée une factory mockée dont decodeImage résout par contenu Blob. */
function mockFactory(images: MockImage[]): MockFactoryHandle {
  const byId = new Map(images.map((i) => [i.id, i]));
  const canvases: MockCanvas[] = [];
  const decodeCalls: string[] = [];

  return {
    canvases,
    decodeCalls,
    createCanvas: vi.fn((width: number, height: number) => {
      const canvas = new MockCanvas(width, height);
      canvases.push(canvas);
      return canvas;
    }),
    decodeImage: vi.fn(async (blob: Blob): Promise<DecodedImage> => {
      const id = await blob.text();
      decodeCalls.push(id);
      const found = byId.get(id);
      if (!found) throw new Error(`mock: image inconnue "${id}"`);
      return found;
    }),
  };
}

describe("readImageDimensions(file)", () => {
  test("lit les dimensions réelles via le décodeur", async () => {
    const factory = mockFactory([img("a", 1200, 800)]);
    const dims = await readImageDimensions(file("a"), factory);
    expect(dims).toEqual({ width: 1200, height: 800 });
  });

  test("rejette un fichier non-image avant décodage", async () => {
    const factory = mockFactory([]);
    await expect(
      readImageDimensions(file("a", "text/plain"), factory),
    ).rejects.toMatchObject({ name: "ImageProcessingError", code: "NOT_IMAGE" });
  });

  test("rejette un type d'image non supporté", async () => {
    const factory = mockFactory([]);
    await expect(
      readImageDimensions(file("a", "image/tiff"), factory),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });
});

describe("resizeImage(file, targetWidth=1600)", () => {
  test("réduit 3200×2400 → canvas 1600×1200, ratio 4:3 conservé, sortie WebP", async () => {
    const factory = mockFactory([img("big", 3200, 2400)]);
    const blob = await resizeImage(file("big"), 1600, { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.draws).toEqual([
      { image: expect.objectContaining({ width: 3200, height: 2400 }), dx: 0, dy: 0, dw: 1600, dh: 1200 },
    ]);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.82 }]);
  });

  test("ne fait PAS d'upscale : 800×600 → canvas 800×600 inchangé", async () => {
    const factory = mockFactory([img("small", 800, 600)]);
    const blob = await resizeImage(file("small"), 1600, { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.draws[0]).toEqual(
      expect.objectContaining({ dw: 800, dh: 600 }),
    );
  });

  test("image déjà à la cible → dimensions conservées (pas de double resize)", async () => {
    const factory = mockFactory([img("exact", 1600, 900)]);
    await resizeImage(file("exact"), 1600, { factory });
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
  });

  test("rejette un fichier non-image", async () => {
    const factory = mockFactory([]);
    await expect(
      resizeImage(file("x", "application/pdf"), 1600, { factory }),
    ).rejects.toMatchObject({ code: "NOT_IMAGE" });
  });

  test("rejette un type d'image non supporté (image/tiff)", async () => {
    const factory = mockFactory([]);
    await expect(
      resizeImage(file("x", "image/tiff"), 1600, { factory }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_TYPE" });
  });

  test("rejette une image aux dimensions démesurées (> 16384px)", async () => {
    const factory = mockFactory([img("huge", 20000, 2000)]);
    await expect(
      resizeImage(file("huge"), 1600, { factory }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });

  test("rejette un targetWidth invalide (≤ 0)", async () => {
    const factory = mockFactory([img("a", 1000, 1000)]);
    await expect(
      resizeImage(file("a"), 0, { factory }),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });
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
      resizeImage(file("c"), 1600, { factory }),
    ).rejects.toMatchObject({ code: "CANVAS_UNAVAILABLE" });
  });
});

describe("toWebP(blob, quality=0.82)", () => {
  test("encode en image/webp à la qualité par défaut 0.82", async () => {
    const factory = mockFactory([img("p", 100, 50)]);
    const blob = await toWebP(file("p"), undefined, { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.82 }]);
  });

  test("accepte une qualité explicite", async () => {
    const factory = mockFactory([img("p", 100, 50)]);
    await toWebP(file("p"), 0.5, { factory });
    expect(factory.canvases[0].toBlobCalls[0].quality).toBe(0.5);
  });
});

describe("buildSpriteSheet(files, {maxWidth=1600, maxColumns=10})", () => {
  test("25 images, maxColumns 10 → grille 10×3, frameCount 25, dims uniformes", async () => {
    const images = Array.from({ length: 25 }, (_, i) => img(`f${i}`, 1600, 900));
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => file(i.id)),
      { maxWidth: 1600, maxColumns: 10, factory },
    );

    expect(sheet).toMatchObject({
      frameCount: 25,
      columns: 10,
      rows: 3,
      frameWidth: 1600,
      frameHeight: 900,
    });
    expect(sheet.spriteBlob.type).toBe("image/webp");

    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(16000);
    expect(canvas.height).toBe(2700);
    expect(canvas.draws).toHaveLength(25);

    // positions de la grille : ligne 0 col 0 / 9, ligne 1 col 0, ligne 2 col 4
    expect(canvas.draws[0]).toMatchObject({ dx: 0, dy: 0, dw: 1600, dh: 900 });
    expect(canvas.draws[9]).toMatchObject({ dx: 14400, dy: 0 });
    expect(canvas.draws[10]).toMatchObject({ dx: 0, dy: 900 });
    expect(canvas.draws[24]).toMatchObject({ dx: 6400, dy: 1800 });
  });

  test("1 image → 1 frame, grille 1×1, dims de la source", async () => {
    const factory = mockFactory([img("solo", 800, 1200)]);
    const sheet = await buildSpriteSheet([file("solo")], { factory });

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
    const sheet = await buildSpriteSheet([file("a"), file("b")], { factory });

    expect(sheet.frameWidth).toBe(1600);
    expect(sheet.frameHeight).toBe(900);
    // frame b (800×450) centrée dans la cellule 1600×900 : décalage 400/225
    expect(factory.canvases[0].draws[1]).toMatchObject({
      dx: 400,
      dy: 225,
      dw: 800,
      dh: 450,
    });
  });

  test("réduit les frames > maxWidth (3200×2400 → 1600×1200)", async () => {
    const factory = mockFactory([img("wide", 3200, 2400)]);
    const sheet = await buildSpriteSheet([file("wide")], {
      maxWidth: 1600,
      factory,
    });

    expect(sheet).toMatchObject({ frameWidth: 1600, frameHeight: 1200 });
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.draws[0]).toMatchObject({ dw: 1600, dh: 1200 });
  });

  test("grille 100 frames 1600×1600, 10 colonnes → 16000×16000 (limite atteinte, accepté)", async () => {
    const images = Array.from({ length: 100 }, (_, i) => img(`f${i}`, 1600, 1600));
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => file(i.id)),
      { maxColumns: 10, factory },
    );

    expect(sheet.rows).toBe(10);
    expect(factory.canvases[0].width).toBe(16000);
    expect(factory.canvases[0].height).toBe(16000);
  });

  test("rejette une grille qui dépasserait la limite canvas (110×1600 = 17600 > 16384)", async () => {
    const images = Array.from({ length: 110 }, (_, i) => img(`f${i}`, 1600, 1600));
    const factory = mockFactory(images);
    await expect(
      buildSpriteSheet(images.map((i) => file(i.id)), {
        maxColumns: 10,
        factory,
      }),
    ).rejects.toMatchObject({ code: "SPRITE_TOO_LARGE" });
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
      buildSpriteSheet([file("a"), file("junk", "text/html")], { factory }),
    ).rejects.toMatchObject({ code: "NOT_IMAGE" });
  });
});

describe("createBrowserFactory (adaptateur navigateur)", () => {
  test("documente la limite jsdom : getContext('2d') → null (aucun rendu en test)", () => {
    const factory = createBrowserFactory();
    const canvas = factory.createCanvas(10, 10);
    expect(canvas.width).toBe(10);
    expect(canvas.height).toBe(10);
    expect(canvas.getContext2D()).toBeNull();
  });
});
