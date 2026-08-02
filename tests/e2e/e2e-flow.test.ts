import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE = "http://localhost:3000";
const WEBTON_ID = crypto.randomUUID();
const DEMO_WEBTON_TITLE = "Démo";

const IMAGE_SVG = "/tmp/test-image.svg";
const SPRITE_PNG = "/tmp/test-sprite.png";
const AUDIO_WAV = "/tmp/test-audio.wav";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

function contentType(filePath: string): string {
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

async function apiRequest(method: string, url: string, body?: unknown) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const res = await fetch(`${SUPABASE_URL}${url}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
  }
  return res;
}

async function createWebtoon() {
  await apiRequest("POST", "/rest/v1/webtoons", {
    id: WEBTON_ID,
    title: "E2E Test",
    description: "Webtoon créé pour les tests E2E.",
    visibility: "draft",
    settings: {},
  });
}

async function addSection(webtoonId: string, type: string, imagePath: string) {
  const sectionRes = await apiRequest("POST", "/rest/v1/sections", {
    webtoon_id: webtoonId,
    type,
    config: { type },
    position: 1,
  });
  const sections = await sectionRes.json();
  const section = Array.isArray(sections) ? sections[0] : sections;
  const sectionId = section.id;

  const fileBuffer = fs.readFileSync(imagePath);
  const fileName = `webtoons/sections/${sectionId}/${Date.now()}-${path.basename(imagePath)}`;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/webtoon-images/${fileName}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": contentType(imagePath),
      },
      body: fileBuffer,
    },
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload failed: ${uploadRes.status} ${text}`);
  }

  const uploadData = await uploadRes.json();
  const storagePath = uploadData.Key;

  const width = type === "animation" ? 2400 : 800;
  const height = type === "animation" ? 5120 : type === "long-y" ? 4000 : 1280;

  await apiRequest("POST", "/rest/v1/images", {
    id: crypto.randomUUID(),
    section_id: sectionId,
    webtoon_id: webtoonId,
    storage_path: storagePath,
    width,
    height,
    mime_type: contentType(imagePath),
    position: 0,
  });

  const config =
    type === "animation"
      ? {
          type: "animation",
          spritePath: storagePath,
          frameWidth: 800,
          frameHeight: 1280,
          columns: 3,
          rows: 4,
          frameCount: 12,
          scrollHeight: 200,
        }
      : { type, imagePath: storagePath, width, height };

  await apiRequest(
    "PATCH",
    `/rest/v1/sections?id=eq.${sectionId}`,
    { config },
  );
}

test.describe("E2E Full User Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test("full user flow: create → edit → save → publish → read", async ({ page }) => {
    await page.getByRole("link", { name: "Éditeur" }).click();
    await page.waitForURL(/\/editor$/);

    await createWebtoon();

    await page.reload();
    await page.waitForURL(/\/editor$/);

    await page.getByRole("link", { name: "Éditer" }).first().click();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    await addSection(WEBTON_ID, "image", IMAGE_SVG);
    await addSection(WEBTON_ID, "animation", SPRITE_PNG);

    await page.reload();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    await expect(page.locator("[data-testid='editor-sidebar']")).toBeVisible();

    const sortableSections = page.locator("[data-testid^='sortable-section-']");
    const sectionCount = await sortableSections.count();
    expect(sectionCount).toBeGreaterThanOrEqual(2);

    const firstHandle = sortableSections.first();
    const lastHandle = sortableSections.last();

    const firstBox = await firstHandle.boundingBox();
    const lastBox = await lastHandle.boundingBox();

    if (sectionCount >= 2) {
      await sortableSections.first().dragTo(sortableSections.last());
      await page.waitForTimeout(1000);
    }

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Publier" }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator("[data-testid='visibility-badge']")).toContainText("Publié");

    await page.goto(`${BASE}/read/${WEBTON_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-testid='reader-container']")).toBeVisible();
    await expect(page.locator("[data-testid='reader-sections']")).toBeVisible();

    await page.goto(`${BASE}/read/${DEMO_WEBTON_TITLE}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-testid='reader-container']")).toBeVisible();

    await expect(page.locator("[data-testid='section-image']")).toBeVisible();
    await expect(page.locator("[data-testid='section-long-y']")).toBeVisible();
    await expect(page.locator("[data-testid='pan-x-section']")).toBeVisible();
    await expect(page.locator("[data-testid='animation-section']")).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });
});
