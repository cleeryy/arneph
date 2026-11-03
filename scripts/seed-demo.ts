import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { deflateSync } from "node:zlib";

const BUCKET = "webtoon-images";
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 1280;
const ANIMATION_COLS = 3;
const ANIMATION_ROWS = 4;
const ANIMATION_FRAME_COUNT = ANIMATION_COLS * ANIMATION_ROWS;

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

export function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`encodePng: dimensions invalides ${width}x${height}`);
  }
  const stride = width * 4;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  // IHDR : width à l'offset 0, height à l'offset 4 (offsets relatifs aux données
  // du chunk). Un offset erroné produisait des PNG 5x0 non décodables.
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const rawRows = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    rawRows[y * (1 + stride)] = 0;
    pixels.copy(rawRows, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(rawRows);
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0))]);
}

function hslToRgb(h: number): [number, number, number] {
  const s = 0.6;
  const l = 0.25;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x2 = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x2; }
  else if (h < 120) { r = x2; g = c; }
  else if (h < 180) { g = c; b = x2; }
  else if (h < 240) { g = x2; b = c; }
  else if (h < 300) { r = x2; b = c; }
  else { r = c; b = x2; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function createGradientPng(width: number, height: number, hueStart: number, hueEnd: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (y * width + x) / (width * height);
      const h = hueStart + (hueEnd - hueStart) * t;
      const [r, g, b] = hslToRgb(h);
      const idx = (y * width + x) * 4;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
    }
  }
  return encodePng(pixels, width, height);
}

function createStripedPng(width: number, height: number, baseHue: number, stripeCount: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  const stripeWidth = width / stripeCount;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor(x / stripeWidth);
      const h = baseHue + (stripe % 2 === 0 ? 0 : 30);
      const [r, g, b] = hslToRgb(h);
      const idx = (y * width + x) * 4;
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = 255;
    }
  }
  return encodePng(pixels, width, height);
}

function createSpriteSheet(): Blob {
  const totalWidth = FRAME_WIDTH * ANIMATION_COLS;
  const totalHeight = FRAME_HEIGHT * ANIMATION_ROWS;
  const pixels = Buffer.alloc(totalWidth * totalHeight * 4);

  for (let i = 0; i < ANIMATION_FRAME_COUNT; i++) {
    const col = i % ANIMATION_COLS;
    const row = Math.floor(i / ANIMATION_COLS);
    const x = col * FRAME_WIDTH;
    const y = row * FRAME_HEIGHT;
    const hue = (i / ANIMATION_FRAME_COUNT) * 360;

    for (let py = 0; py < FRAME_HEIGHT; py++) {
      for (let px = 0; px < FRAME_WIDTH; px++) {
        const t = (py * FRAME_WIDTH + px) / (FRAME_WIDTH * FRAME_HEIGHT);
        const h = hue + t * 60;
        const [r, g, b] = hslToRgb(h);
        const dstIdx = ((y + py) * totalWidth + (x + px)) * 4;
        pixels[dstIdx] = r; pixels[dstIdx + 1] = g; pixels[dstIdx + 2] = b; pixels[dstIdx + 3] = 255;
      }
    }
  }

  return new Blob([new Uint8Array(encodePng(pixels, totalWidth, totalHeight))], { type: "image/png" });
}

function createWavBlob(frequency: number, durationSec: number, sampleRate: number = 44100): Blob {
  const numSamples = Math.floor(sampleRate * durationSec);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample * 32767)), 44 + i * bytesPerSample);
  }

  return new Blob([new Uint8Array(buffer)], { type: "audio/wav" });
}

async function uploadAsset(
  supabase: SupabaseClient,
  path: string,
  blob: Blob,
  contentType: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
  return data.path;
}

async function getExistingWebtoonId(
  supabase: SupabaseClient,
  title: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("webtoons").select("id").eq("title", title).maybeSingle();
  if (error) throw new Error(`Failed to check existing webtoon: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

async function deleteWebtoonAndAssets(
  supabase: SupabaseClient,
  webtoonId: string,
): Promise<void> {
  const prefix = `webtoons/sections/${webtoonId}/`;
  const { data: files, error: listError } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (!listError && files && files.length > 0) {
    const paths = files.map((f: { name: string }) => `${prefix}${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }
  const { error } = await supabase.from("webtoons").delete().eq("id", webtoonId);
  if (error) throw new Error(`Failed to delete webtoon ${webtoonId}: ${error.message}`);
}

async function deleteAllWebtoons(supabase: SupabaseClient): Promise<void> {
  const { data: webtoons, error: listError } = await supabase.from("webtoons").select("id");
  if (listError) throw new Error(`Failed to list webtoons: ${listError.message}`);
  for (const webtoon of (webtoons as { id: string }[]) ?? []) {
    await deleteWebtoonAndAssets(supabase, webtoon.id);
  }
}

async function createSectionWithImage(
  supabase: SupabaseClient,
  webtoonId: string,
  position: number,
  type: string,
  config: Record<string, unknown>,
  storagePath: string,
  width: number,
  height: number,
  mimeType: string,
  audioPath: string,
): Promise<void> {
  const { data: sectionRow, error: secError } = await supabase
    .from("sections")
    .insert({ webtoon_id: webtoonId, position, type, config, audio_path: audioPath })
    .select()
    .single();
  if (secError) throw new Error(`Failed to create section: ${secError.message}`);
  const sectionId = (sectionRow as { id: string }).id;

  await supabase.from("images").insert({
    id: crypto.randomUUID(),
    section_id: sectionId,
    webtoon_id: webtoonId,
    storage_path: storagePath,
    width,
    height,
    mime_type: mimeType,
    position: 0,
  });
}

interface SectionDef {
  type: string;
  config: Record<string, unknown>;
  width: number;
  height: number;
  mimeType: string;
  storagePath: string;
}

interface WebtoonDef {
  title: string;
  description: string;
  sections: SectionDef[];
}

const WEBTOONS: WebtoonDef[] = [
  {
    title: "Démo",
    description: "Webtoon de démonstration avec les 4 types de sections.",
    sections: [
      { type: "image", config: { type: "image", width: FRAME_WIDTH, height: FRAME_HEIGHT }, width: FRAME_WIDTH, height: FRAME_HEIGHT, mimeType: "image/png", storagePath: "webtoons/seed/demo/image.png" },
      { type: "long-y", config: { type: "long-y", width: 800, height: 4000 }, width: 800, height: 4000, mimeType: "image/png", storagePath: "webtoons/seed/demo/long-y.png" },
      { type: "pan-x", config: { type: "pan-x", width: 2400, height: 800, panSpeed: 100 }, width: 2400, height: 800, mimeType: "image/png", storagePath: "webtoons/seed/demo/pan-x.png" },
      { type: "animation", config: { type: "animation", frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT, columns: ANIMATION_COLS, rows: ANIMATION_ROWS, frameCount: ANIMATION_FRAME_COUNT, scrollHeight: 200 }, width: FRAME_WIDTH * ANIMATION_COLS, height: FRAME_HEIGHT * ANIMATION_ROWS, mimeType: "image/png", storagePath: "webtoons/seed/demo/sprite.png" },
    ],
  },
  {
    title: "Paysage",
    description: "Webtoon de paysages — sections image et long-y.",
    sections: [
      { type: "image", config: { type: "image", width: FRAME_WIDTH, height: FRAME_HEIGHT }, width: FRAME_WIDTH, height: FRAME_HEIGHT, mimeType: "image/png", storagePath: "webtoons/seed/paysage/image.png" },
      { type: "long-y", config: { type: "long-y", width: 800, height: 4000 }, width: 800, height: 4000, mimeType: "image/png", storagePath: "webtoons/seed/paysage/long-y.png" },
      { type: "pan-x", config: { type: "pan-x", width: 2400, height: 800, panSpeed: 150 }, width: 2400, height: 800, mimeType: "image/png", storagePath: "webtoons/seed/paysage/pan-x.png" },
    ],
  },
  {
    title: "Urban",
    description: "Webtoon urbain — sections animation et image.",
    sections: [
      { type: "animation", config: { type: "animation", frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT, columns: ANIMATION_COLS, rows: ANIMATION_ROWS, frameCount: ANIMATION_FRAME_COUNT, scrollHeight: 200 }, width: FRAME_WIDTH * ANIMATION_COLS, height: FRAME_HEIGHT * ANIMATION_ROWS, mimeType: "image/png", storagePath: "webtoons/seed/urban/sprite.png" },
      { type: "image", config: { type: "image", width: FRAME_WIDTH, height: FRAME_HEIGHT }, width: FRAME_WIDTH, height: FRAME_HEIGHT, mimeType: "image/png", storagePath: "webtoons/seed/urban/image.png" },
      { type: "long-y", config: { type: "long-y", width: 800, height: 4000 }, width: 800, height: 4000, mimeType: "image/png", storagePath: "webtoons/seed/urban/long-y.png" },
    ],
  },
];

function buildSectionAsset(sectionDef: SectionDef): Blob {
  switch (sectionDef.type) {
    case "image":
      return new Blob([new Uint8Array(createGradientPng(sectionDef.width, sectionDef.height, 240, 280))], { type: "image/png" });
    case "long-y":
      return new Blob([new Uint8Array(createGradientPng(sectionDef.width, sectionDef.height, 180, 220))], { type: "image/png" });
    case "pan-x":
      return new Blob([new Uint8Array(createStripedPng(sectionDef.width, sectionDef.height, 30, 8))], { type: "image/png" });
    case "animation":
      return createSpriteSheet();
    default:
      throw new Error(`Unknown section type: ${sectionDef.type}`);
  }
}

function buildSectionConfig(sectionDef: SectionDef, storagePath: string, audioPath: string): Record<string, unknown> {
  const config = { ...sectionDef.config, imagePath: storagePath, audioPath } as Record<string, unknown>;
  if (sectionDef.type === "animation") {
    config.spritePath = storagePath;
    delete config.imagePath;
  }
  return config;
}

export async function seedDemo(force: boolean = false): Promise<{ webtoonId: string; created: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[seed-demo] Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });

  let firstWebtoonId: string | null = null;
  let anyCreated = false;

  if (force) {
    console.log("[seed-demo] Force mode: deleting all existing webtoons...");
    await deleteAllWebtoons(supabase);
    console.log("[seed-demo] All existing webtoons deleted.");
  }

  for (const webtoonDef of WEBTOONS) {
    const existingId = await getExistingWebtoonId(supabase, webtoonDef.title);
    const slug = webtoonDef.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Les assets sont TOUJOURS régénérés (upsert) : un seed existant peut
    // contenir des fichiers corrompus, et `upsert: true` les répare sans
    // toucher aux lignes en base ni dupliquer le webtoon.
    const audioPath = await uploadAsset(supabase, `webtoons/seed/${slug}/audio.wav`, createWavBlob(440, 1), "audio/wav");
    const uploadedPaths: string[] = [];
    for (const sectionDef of webtoonDef.sections) {
      const asset = buildSectionAsset(sectionDef);
      const storagePath = await uploadAsset(supabase, sectionDef.storagePath, asset, sectionDef.mimeType);
      uploadedPaths.push(storagePath);
    }

    if (existingId) {
      console.log(`[seed-demo] "${webtoonDef.title}" already exists (id=${existingId}). Assets refreshed.`);
      if (!firstWebtoonId) firstWebtoonId = existingId;
      continue;
    }

    const { data: webtoonRow, error: webtoonError } = await supabase
      .from("webtoons")
      .insert({ title: webtoonDef.title, description: webtoonDef.description, visibility: "published", settings: {} })
      .select()
      .single();
    if (webtoonError) throw new Error(`Failed to create webtoon "${webtoonDef.title}": ${webtoonError.message}`);
    const webtoonId = (webtoonRow as { id: string }).id;
    if (!firstWebtoonId) firstWebtoonId = webtoonId;

    for (let i = 0; i < webtoonDef.sections.length; i++) {
      const sectionDef = webtoonDef.sections[i];
      const storagePath = uploadedPaths[i];
      const config = buildSectionConfig(sectionDef, storagePath, audioPath);

      await createSectionWithImage(supabase, webtoonId, i + 1, sectionDef.type, config, storagePath, sectionDef.width, sectionDef.height, sectionDef.mimeType, audioPath);
    }

    anyCreated = true;
    console.log(`[seed-demo] Webtoon "${webtoonDef.title}" created (id=${webtoonId}, published) with ${webtoonDef.sections.length} sections + audio.`);
  }

  return { webtoonId: firstWebtoonId ?? "", created: anyCreated };
}

const isMainModule = process.argv[1]?.endsWith("seed-demo.ts");

if (isMainModule) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  seedDemo(force)
    .then((result) => {
      console.log(`[seed-demo] Done. created=${result.created}, webtoonId=${result.webtoonId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seed-demo] Error:", err.message);
      process.exit(1);
    });
}
