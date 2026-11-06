import { describe, expect, test, vi } from "vitest";

import {
  MAX_CANVAS_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_SPRITE_FRAMES,
  MAX_SPRITE_PIXELS,
  buildSpriteSheet,
  createBrowserFactory,
  fitWithin,
  readImageDimensions,
  resizeImage,
  sliceLongYImage,
  sliceSpriteSheet,
  toWebP,
  type CanvasFactory,
  type CanvasLike,
  type DecodedImage,
  type ImageContext2D,
} from "@/lib/image/process";
import {
  LONG_Y_TILE_HEIGHT,
  MAX_LONG_Y_PIXELS,
  MAX_LONG_Y_TILES,
} from "@/lib/image/limits";

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

interface RegionDrawCall {
  image: DecodedImage;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

class MockContext implements ImageContext2D {
  constructor(
    private readonly draws: DrawCall[],
    private readonly regionDraws: RegionDrawCall[],
  ) {}

  drawImage(
    image: DecodedImage,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    this.draws.push({ image, dx, dy, dw, dh });
  }

  drawImageRegion(
    image: DecodedImage,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    this.regionDraws.push({ image, sx, sy, sw, sh, dx, dy, dw, dh });
  }
}

class MockCanvas implements CanvasLike {
  readonly draws: DrawCall[] = [];
  readonly regionDraws: RegionDrawCall[] = [];
  readonly toBlobCalls: ToBlobCall[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext2D(): ImageContext2D | null {
    return new MockContext(this.draws, this.regionDraws);
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
  /** Simule `ImageBitmap.close()` pour vérifier la libération mémoire. */
  close: ReturnType<typeof vi.fn>;
}

function img(id: string, width: number, height: number): MockImage {
  return { id, width, height, close: vi.fn() };
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

describe("fitWithin(width, height, maxDimension)", () => {
  test("borne les DEUX dimensions : 800×20000 → 655×16384", () => {
    expect(fitWithin(800, 20000, MAX_CANVAS_DIMENSION)).toEqual({
      width: 655,
      height: MAX_CANVAS_DIMENSION,
    });
  });

  test("applique un maxDimension plus petit : 4000×3000 → 1600×1200", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  test("ne fait jamais d'upscale : 800×600 inchangé", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("resizeImage(file)", () => {
  test("conserve la taille native : 3000×2000 → canvas 3000×2000, pas de downscale", async () => {
    const source = img("full", 3000, 2000);
    const factory = mockFactory([source]);
    const blob = await resizeImage(factory.file("full"), { factory });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(3000);
    expect(canvas.height).toBe(2000);
    expect(canvas.draws).toEqual([
      { image: expect.objectContaining({ width: 3000, height: 2000 }), dx: 0, dy: 0, dw: 3000, dh: 2000 },
    ]);
    expect(canvas.toBlobCalls).toEqual([{ type: "image/webp", quality: 0.9 }]);
    // IMG-7 : le bitmap décodé est libéré après usage.
    expect(source.close).toHaveBeenCalledTimes(1);
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

  test("rejette 16384×9000 : au-delà de MAX_IMAGE_PIXELS avant tout canvas", async () => {
    expect(16384 * 9000).toBeGreaterThan(MAX_IMAGE_PIXELS);
    const source = img("too-many-pixels", 16384, 9000);
    const factory = mockFactory([source]);

    await expect(
      resizeImage(factory.file("too-many-pixels"), { factory }),
    ).rejects.toMatchObject({
      name: "ImageProcessingError",
      code: "IMAGE_TOO_LARGE",
    });

    expect(factory.canvases).toHaveLength(0);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  test("rejette une planche long-y 800×20000 (hauteur > MAX_CANVAS_DIMENSION)", async () => {
    expect(20000).toBeGreaterThan(MAX_CANVAS_DIMENSION);
    const factory = mockFactory([img("long-y", 800, 20000)]);

    await expect(
      resizeImage(factory.file("long-y"), { factory }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
    expect(factory.canvases).toHaveLength(0);
  });

  test("applique maxDimension aux DEUX côtés : 4000×3000 → 1600×1200", async () => {
    const source = img("photo", 4000, 3000);
    const factory = mockFactory([source]);
    const blob = await resizeImage(factory.file("photo"), {
      factory,
      maxDimension: 1600,
    });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.draws).toEqual([
      { image: expect.objectContaining({ width: 4000, height: 3000 }), dx: 0, dy: 0, dw: 1600, dh: 1200 },
    ]);
    expect(source.close).toHaveBeenCalledTimes(1);
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

describe("resizeImage(file, { maxWidth })", () => {
  test("borne UNIQUEMENT la largeur : 3000×12000 → 1600×6400", async () => {
    const source = img("long", 3000, 12000);
    const factory = mockFactory([source]);
    const blob = await resizeImage(factory.file("long"), {
      factory,
      maxWidth: 1600,
    });

    expect(blob.type).toBe("image/webp");
    const canvas = factory.canvases[0];
    // maxDimension aurait donné 400×1600 : la hauteur de la planche serait
    // écrasée, d'où l'option dédiée.
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(6400);
    expect(canvas.draws).toEqual([
      {
        image: expect.objectContaining({ width: 3000, height: 12000 }),
        dx: 0,
        dy: 0,
        dw: 1600,
        dh: 6400,
      },
    ]);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  test("ne fait jamais d'upscale : 800×200 inchangé", async () => {
    const factory = mockFactory([img("small", 800, 200)]);
    await resizeImage(factory.file("small"), { factory, maxWidth: 1600 });

    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(200);
  });

  test("maxWidth prime sur maxDimension quand les deux sont fournis", async () => {
    const factory = mockFactory([img("photo", 3000, 12000)]);
    await resizeImage(factory.file("photo"), {
      factory,
      maxWidth: 1000,
      maxDimension: 200,
    });

    const canvas = factory.canvases[0];
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(4000);
  });

  test("applique toujours le budget canvas à la source avant réduction", async () => {
    const factory = mockFactory([img("huge", 4000, 20000)]);

    await expect(
      resizeImage(factory.file("huge"), { factory, maxWidth: 1600 }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    expect(factory.canvases).toHaveLength(0);
  });
});

describe("sliceLongYImage(file)", () => {
  test("découpe une planche 800×10000 en 3 tuiles sans redimensionner", async () => {
    const source = img("strip", 800, 10000);
    const factory = mockFactory([source]);
    const sliced = await sliceLongYImage(factory.file("strip"), { factory });

    // Décodage unique, bitmap libéré dans le finally.
    expect(factory.decodeCalls).toEqual(["strip"]);
    expect(source.close).toHaveBeenCalledTimes(1);

    expect(sliced).toMatchObject({
      width: 800,
      height: 10000,
      tileHeight: LONG_Y_TILE_HEIGHT,
    });
    expect(sliced.tiles).toHaveLength(3);
    expect(sliced.tiles.every((tile) => tile.type === "image/webp")).toBe(true);

    expect(factory.canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [800, 4096],
      [800, 4096],
      [800, 1808],
    ]);

    const regions = factory.canvases.map((canvas) => canvas.regionDraws[0]);
    expect(regions.map(({ sy, sh }) => [sy, sh])).toEqual([
      [0, 4096],
      [4096, 4096],
      [8192, 1808],
    ]);
    for (const region of regions) {
      expect(region).toMatchObject({
        sx: 0,
        sw: 800,
        dx: 0,
        dy: 0,
        dw: 800,
      });
    }
    // La planche n'est jamais dessinée en pleine hauteur.
    expect(factory.canvases.some((canvas) => canvas.height > 4096)).toBe(false);
    expect(factory.canvases[0].toBlobCalls).toEqual([
      { type: "image/webp", quality: 0.9 },
    ]);
  });

  test("réduit la largeur et met la hauteur des tuiles à l'échelle : 3200×9000 → 1600×4500", async () => {
    const source = img("strip", 3200, 9000);
    const factory = mockFactory([source]);
    const sliced = await sliceLongYImage(factory.file("strip"), {
      factory,
      maxWidth: 1600,
    });

    expect(sliced).toMatchObject({
      width: 1600,
      height: 4500,
      tileHeight: 2048,
    });
    expect(sliced.tiles).toHaveLength(3);
    expect(factory.canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([
      [1600, 2048],
      [1600, 2048],
      // Dernière tuile source : 9000 - 2×4096 = 808 px, soit 404 px à l'échelle.
      [1600, 404],
    ]);
    expect(factory.canvases[2].regionDraws[0]).toMatchObject({
      sy: 8192,
      sh: 808,
      dh: 404,
    });
  });

  test("respecte les options tileHeight / maxWidth / quality", async () => {
    const factory = mockFactory([img("strip", 800, 2500)]);
    const sliced = await sliceLongYImage(factory.file("strip"), {
      factory,
      tileHeight: 1000,
      maxWidth: 400,
      quality: 0.5,
    });

    expect(sliced).toMatchObject({
      width: 400,
      height: 1250,
      tileHeight: 500,
    });
    expect(sliced.tiles).toHaveLength(3);
    expect(factory.canvases.map((canvas) => canvas.height)).toEqual([500, 500, 250]);
    expect(factory.canvases[0].toBlobCalls).toEqual([
      { type: "image/webp", quality: 0.5 },
    ]);
  });

  test("rejette une largeur au-delà de MAX_CANVAS_DIMENSION avant tout canvas", async () => {
    const source = img("wide", 20000, 1000);
    const factory = mockFactory([source]);

    await expect(
      sliceLongYImage(factory.file("wide"), { factory }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    expect(factory.canvases).toHaveLength(0);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  test("rejette une planche au-delà de MAX_LONG_Y_PIXELS", async () => {
    expect(4000 * 16000).toBeGreaterThan(MAX_LONG_Y_PIXELS);
    const factory = mockFactory([img("heavy", 4000, 16000)]);

    await expect(
      sliceLongYImage(factory.file("heavy"), { factory }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    expect(factory.canvases).toHaveLength(0);
  });

  test("rejette une planche qui produirait plus de MAX_LONG_Y_TILES tuiles", async () => {
    const factory = mockFactory([img("tall", 800, 10000)]);

    await expect(
      sliceLongYImage(factory.file("tall"), { factory, tileHeight: 256 }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    expect(Math.ceil(10000 / 256)).toBeGreaterThan(MAX_LONG_Y_TILES);
    expect(factory.canvases).toHaveLength(0);
  });

  test("libère le bitmap quand un encodage échoue", async () => {
    const source = img("strip", 800, 5000);
    const failingFactory: CanvasFactory = {
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext2D: () => ({
            drawImage: () => {},
            drawImageRegion: () => {},
          }),
          toBlob: (callback: (blob: Blob | null) => void) => callback(null),
        }) as CanvasLike,
      decodeImage: async () => source,
    };

    await expect(
      sliceLongYImage(new Blob(["strip"], { type: "image/png" }), {
        factory: failingFactory,
      }),
    ).rejects.toMatchObject({ code: "ENCODE_FAILED" });

    expect(source.close).toHaveBeenCalledTimes(1);
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

  test("rejette une source au-delà de MAX_IMAGE_PIXELS (8000×6000)", async () => {
    expect(8000 * 6000).toBeGreaterThan(MAX_IMAGE_PIXELS);
    const source = img("huge", 8000, 6000);
    const factory = mockFactory([source]);

    await expect(
      toWebP(factory.file("huge"), undefined, { factory }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    expect(factory.canvases).toHaveLength(0);
    expect(source.close).toHaveBeenCalledTimes(1);
  });

  test("libère le bitmap décodé après encodage", async () => {
    const source = img("p", 100, 50);
    const factory = mockFactory([source]);
    await toWebP(factory.file("p"), undefined, { factory });
    expect(source.close).toHaveBeenCalledTimes(1);
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
    // IMG-7 : chaque frame décodée est libérée après assemblage.
    images.forEach((image) => expect(image.close).toHaveBeenCalledTimes(1));
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

  test("120 frames : limite haute acceptée", async () => {
    const images = Array.from({ length: MAX_SPRITE_FRAMES }, (_, i) =>
      img(`f${i}`, 100, 100),
    );
    const factory = mockFactory(images);
    const sheet = await buildSpriteSheet(
      images.map((i) => factory.file(i.id)),
      { maxColumns: 10, factory },
    );

    expect(sheet.frameCount).toBe(MAX_SPRITE_FRAMES);
    expect(sheet.columns).toBe(10);
    expect(sheet.rows).toBe(12);
  });

  test("au-delà de MAX_SPRITE_FRAMES (121) : TOO_MANY_FRAMES avant décodage", async () => {
    const images = Array.from(
      { length: MAX_SPRITE_FRAMES + 1 },
      (_, i) => img(`f${i}`, 100, 100),
    );
    const factory = mockFactory(images);

    await expect(
      buildSpriteSheet(
        images.map((i) => factory.file(i.id)),
        { maxColumns: 10, factory },
      ),
    ).rejects.toMatchObject({
      name: "ImageProcessingError",
      code: "TOO_MANY_FRAMES",
    });

    expect(factory.decodeCalls).toEqual([]);
    expect(factory.canvases).toHaveLength(0);
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

describe("sliceSpriteSheet(sprite, geometry)", () => {
  const GRID = { columns: 4, rows: 3, frameWidth: 100, frameHeight: 100, frameCount: 10 };

  test("découpe la grille en frames WebP dans l'ordre de lecture", async () => {
    const source = img("sheet", 400, 300);
    const factory = mockFactory([source]);
    const sliced = await sliceSpriteSheet(factory.file("sheet"), GRID, { factory });

    // La feuille n'est décodée qu'une seule fois, quelles que soient les frames.
    expect(factory.decodeCalls).toEqual(["sheet"]);
    // IMG-7 : le bitmap de la feuille est libéré après découpe.
    expect(source.close).toHaveBeenCalledTimes(1);

    expect(sliced.frameWidth).toBe(100);
    expect(sliced.frameHeight).toBe(100);
    expect(sliced.frames).toHaveLength(10);
    expect(sliced.frames.every((frame) => frame.type === "image/webp")).toBe(
      true,
    );

    // Une toile par frame, toutes aux dimensions uniformes de la cellule.
    expect(factory.canvases).toHaveLength(10);
    expect(
      factory.canvases.every(
        (canvas) => canvas.width === 100 && canvas.height === 100,
      ),
    ).toBe(true);

    // Lecture gauche → droite, puis haut → bas, limitée à frameCount.
    const regions = factory.canvases.map((canvas) => canvas.regionDraws[0]);
    expect(regions.map(({ sx, sy }) => [sx, sy])).toEqual([
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
      [0, 100],
      [100, 100],
      [200, 100],
      [300, 100],
      [0, 200],
      [100, 200],
    ]);
    for (const region of regions) {
      expect(region).toMatchObject({
        sw: 100,
        sh: 100,
        dx: 0,
        dy: 0,
        dw: 100,
        dh: 100,
      });
    }
    expect(regions[0].image).toMatchObject({ width: 400, height: 300 });
    expect(regions.every((region) => region.image === regions[0].image)).toBe(
      true,
    );
  });

  test("s'arrête à frameCount et ignore le reste de la grille", async () => {
    const factory = mockFactory([img("sheet", 400, 300)]);
    const sliced = await sliceSpriteSheet(
      factory.file("sheet"),
      { ...GRID, frameCount: 3 },
      { factory },
    );

    expect(sliced.frames).toHaveLength(3);
    expect(factory.canvases).toHaveLength(3);
    expect(factory.canvases.map((canvas) => canvas.regionDraws[0].sx)).toEqual([
      0, 100, 200,
    ]);
  });

  test("encode chaque frame en WebP avec la qualité demandée", async () => {
    const factory = mockFactory([img("sheet", 200, 100)]);
    await sliceSpriteSheet(
      factory.file("sheet"),
      { columns: 2, rows: 1, frameWidth: 100, frameHeight: 100, frameCount: 2 },
      { factory, quality: 0.5 },
    );

    expect(factory.canvases[0].toBlobCalls).toEqual([
      { type: "image/webp", quality: 0.5 },
    ]);
    expect(factory.canvases[1].toBlobCalls).toEqual([
      { type: "image/webp", quality: 0.5 },
    ]);
  });

  test("rejette une géométrie invalide avant tout décodage", async () => {
    const factory = mockFactory([img("sheet", 400, 300)]);
    await expect(
      sliceSpriteSheet(
        factory.file("sheet"),
        { ...GRID, frameCount: 13 },
        { factory },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });

    await expect(
      sliceSpriteSheet(
        factory.file("sheet"),
        { ...GRID, columns: 0 },
        { factory },
      ),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });

    expect(factory.decodeCalls).toEqual([]);
  });

  test("rejette une feuille trop petite pour la grille annoncée et libère le bitmap", async () => {
    const source = img("sheet", 150, 100);
    const factory = mockFactory([source]);
    await expect(
      sliceSpriteSheet(
        factory.file("sheet"),
        { columns: 2, rows: 1, frameWidth: 100, frameHeight: 100, frameCount: 2 },
        { factory },
      ),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(source.close).toHaveBeenCalledTimes(1);
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
