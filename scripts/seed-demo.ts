import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deflateSync } from "node:zlib";

const BUCKET = "webtoon-images";
const WEBTON_TITLE = "Démo";
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 1280;
const ANIMATION_COLS = 3;
const ANIMATION_ROWS = 4;
const ANIMATION_FRAME_COUNT = ANIMATION_COLS * ANIMATION_ROWS;

function svgToBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml" });
}

function imageSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}">
  <rect width="100%" height="100%" fill="#1a1a2e"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#e0e0e0" font-family="sans-serif" font-size="48" font-weight="bold">${label}</text>
</svg>`;
}

function longYSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="4000">
  <rect width="100%" height="100%" fill="#16213e"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#e0e0e0" font-family="sans-serif" font-size="48" font-weight="bold">${label}</text>
</svg>`;
}

function panXSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="800">
  <rect width="100%" height="100%" fill="#0f3460"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#e0e0e0" font-family="sans-serif" font-size="48" font-weight="bold">${label}</text>
</svg>`;
}

function animationFrameSvg(frameIndex: number): string {
  const hue = (frameIndex / ANIMATION_FRAME_COUNT) * 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}">
  <rect width="100%" height="100%" fill="hsl(${hue}, 60%, 25%)"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        fill="#ffffff" font-family="sans-serif" font-size="64" font-weight="bold">Frame ${frameIndex + 1}</text>
</svg>`;
}

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

function encodePng(pixels: Buffer, width: number, height: number): Buffer {
  const stride = width * 4;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 1);
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

function createSpriteSheet(frames: Blob[]): Blob {
  const totalWidth = FRAME_WIDTH * ANIMATION_COLS;
  const totalHeight = FRAME_HEIGHT * ANIMATION_ROWS;
  const pixels = Buffer.alloc(totalWidth * totalHeight * 4);

  for (let i = 0; i < frames.length; i++) {
    const col = i % ANIMATION_COLS;
    const row = Math.floor(i / ANIMATION_COLS);
    const x = col * FRAME_WIDTH;
    const y = row * FRAME_HEIGHT;
    const [ri, gi, bi] = hslToRgb((i / frames.length) * 360);

    for (let py = 0; py < FRAME_HEIGHT; py++) {
      for (let px = 0; px < FRAME_WIDTH; px++) {
        const idx = ((y + py) * totalWidth + (x + px)) * 4;
        pixels[idx] = ri;
        pixels[idx + 1] = gi;
        pixels[idx + 2] = bi;
        pixels[idx + 3] = 255;
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

export async function seedDemo(force: boolean = false): Promise<{ webtoonId: string; created: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[seed-demo] Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existingId = await getExistingWebtoonId(supabase, WEBTON_TITLE);

  if (existingId) {
    if (!force) {
      console.log(`[seed-demo] "${WEBTON_TITLE}" already exists (id=${existingId}). Skipping. Use --force to recreate.`);
      return { webtoonId: existingId, created: false };
    }
    console.log(`[seed-demo] Force mode: deleting existing webtoon ${existingId}...`);
    await deleteWebtoonAndAssets(supabase, existingId);
    console.log("[seed-demo] Existing webtoon deleted.");
  }

  const imagePath = await uploadAsset(supabase, "webtoons/seed/demo/image.svg", svgToBlob(imageSvg("Image simple")), "image/svg+xml");
  const longYPath = await uploadAsset(supabase, "webtoons/seed/demo/long-y.svg", svgToBlob(longYSvg("Longue image axe Y")), "image/svg+xml");
  const panXPath = await uploadAsset(supabase, "webtoons/seed/demo/pan-x.svg", svgToBlob(panXSvg("Image large axe X")), "image/svg+xml");

  const frameBlobs: Blob[] = [];
  for (let i = 0; i < ANIMATION_FRAME_COUNT; i++) {
    frameBlobs.push(svgToBlob(animationFrameSvg(i)));
  }
  const spriteBlob = createSpriteSheet(frameBlobs);
  const spritePath = await uploadAsset(supabase, "webtoons/seed/demo/sprite.png", spriteBlob, "image/png");

  const audioPath = await uploadAsset(supabase, "webtoons/seed/demo/audio.wav", createWavBlob(440, 1), "audio/wav");

  const { data: webtoonRow, error: webtoonError } = await supabase
    .from("webtoons")
    .insert({ title: WEBTON_TITLE, description: "Webtoon de démonstration avec les 4 types de sections.", visibility: "published", settings: {} })
    .select()
    .single();
  if (webtoonError) throw new Error(`Failed to create webtoon: ${webtoonError.message}`);
  const webtoonId = (webtoonRow as { id: string }).id;

  async function createSectionWithImage(
    position: number,
    type: string,
    config: Record<string, unknown>,
    storagePath: string,
    width: number,
    height: number,
    mimeType: string,
  ) {
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

  await createSectionWithImage(1, "image", { type: "image", imagePath, width: FRAME_WIDTH, height: FRAME_HEIGHT, audioPath: audioPath }, imagePath, FRAME_WIDTH, FRAME_HEIGHT, "image/svg+xml");
  await createSectionWithImage(2, "long-y", { type: "long-y", imagePath: longYPath, width: 800, height: 4000, audioPath: audioPath }, longYPath, 800, 4000, "image/svg+xml");
  await createSectionWithImage(3, "pan-x", { type: "pan-x", imagePath: panXPath, width: 2400, height: 800, panSpeed: 100, audioPath: audioPath }, panXPath, 2400, 800, "image/svg+xml");
  await createSectionWithImage(4, "animation", { type: "animation", spritePath, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT, columns: ANIMATION_COLS, rows: ANIMATION_ROWS, frameCount: ANIMATION_FRAME_COUNT, scrollHeight: 200, audioPath: audioPath } as Record<string, unknown>, spritePath, FRAME_WIDTH * ANIMATION_COLS, FRAME_HEIGHT * ANIMATION_ROWS, "image/png");

  console.log(`[seed-demo] Webtoon "${WEBTON_TITLE}" created (id=${webtoonId}, published) with 4 sections + audio.`);
  return { webtoonId, created: true };
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
