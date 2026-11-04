import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const WEBTON_ID = crypto.randomUUID();
const DEMO_WEBTON_TITLE = "Démo";

const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1280"><rect width="100%" height="100%" fill="#e11d48"/><circle cx="400" cy="640" r="200" fill="#ffffff"/></svg>',
  "utf-8",
);
// 1x1 opaque PNG (self-contained fixture, no /tmp dependency).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const IMAGE_SVG_FIXTURE = {
  name: "test-image.svg",
  mimeType: "image/svg+xml",
  buffer: SVG_BYTES,
};

const SPRITE_PNG_FIXTURE = {
  name: "test-sprite.png",
  mimeType: "image/png",
  buffer: PNG_BYTES,
};

type UploadFixture = typeof IMAGE_SVG_FIXTURE;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";

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

async function addSection(webtoonId: string, type: string, fixture: UploadFixture) {
  const sectionRes = await apiRequest("POST", "/rest/v1/sections", {
    webtoon_id: webtoonId,
    type,
    config: { type },
    position: 1,
  });
  const sections = await sectionRes.json();
  const section = Array.isArray(sections) ? sections[0] : sections;
  const sectionId = section.id;

  const fileName = `webtoons/sections/${sectionId}/${Date.now()}-${fixture.name}`;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/webtoon-images/${fileName}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": fixture.mimeType,
      },
      body: fixture.buffer,
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
    mime_type: fixture.mimeType,
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

async function deleteWebtoon(webtoonId: string) {
  const { data: sections } = await apiRequest(
    "GET",
    `/rest/v1/sections?webtoon_id=eq.${webtoonId}`,
  ).then((r) => r.json());

  for (const section of (sections as { id: string }[]) ?? []) {
    await apiRequest("DELETE", `/rest/v1/sections?id=eq.${section.id}`);
  }

  await apiRequest("DELETE", `/rest/v1/webtoons?id=eq.${webtoonId}`);
}

test.describe("E2E Full User Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test.afterEach(async () => {
    await deleteWebtoon(WEBTON_ID);
  });

  test("full user flow: create → edit → save → publish → read", async ({ page }) => {
    await page.getByRole("link", { name: "Éditeur" }).click();
    await page.waitForURL(/\/editor$/);

    await createWebtoon();

    await page.reload();
    await page.waitForURL(/\/editor$/);

    await page.getByRole("link", { name: "Éditer" }).first().click();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    await addSection(WEBTON_ID, "image", IMAGE_SVG_FIXTURE);
    await addSection(WEBTON_ID, "animation", SPRITE_PNG_FIXTURE);

    await page.reload();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    await expect(page.locator("[data-testid='editor-sidebar']")).toBeVisible();

    // Attente que les sections ajoutées via l'API soient chargées puis rendues.
    const sortableSections = page.locator(
      "[data-testid='editor-canvas-shell'] [data-testid^='sortable-section-']",
    );
    await expect(sortableSections.first()).toBeVisible();
    const sectionCount = await sortableSections.count();
    expect(sectionCount).toBeGreaterThanOrEqual(2);

    // Réordonnancement via le bouton "Descendre" (listeners dnd-kit sur le
    // handle GripVertical → dragTo Playwright sur le conteneur est flaky en
    // headless ; le drag réel est couvert par sortable.test.tsx).
    const firstSection = sortableSections.first();
    await firstSection.getByRole("button", { name: "Descendre" }).click();
    await page.waitForTimeout(500);

    await page.getByTestId("save-button").click();
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator("[data-testid='visibility-badge']")).toContainText("Publié");

    await page.goto(`${BASE}/read/${WEBTON_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-testid='reader-deck']")).toBeVisible();

    // Lecteur du webtoon de démo — la route /read/[webtoonId] attend un UUID,
    // pas un titre : on le résout via l'API.
    const demoRes = await apiRequest(
      "GET",
      `/rest/v1/webtoons?select=id&title=eq.${encodeURIComponent(DEMO_WEBTON_TITLE)}`,
    );
    const demos = (await demoRes.json()) as { id: string }[];
    const demoId = demos[0].id;

    await page.goto(`${BASE}/read/${demoId}`);
    await page.waitForLoadState("networkidle");

    const deck = page.locator("[data-testid='reader-deck']");
    await expect(deck).toBeVisible();
    await expect(deck).toHaveAttribute("data-hydrated", "true");
    await expect(page.getByTestId("image-step")).toBeVisible();

    // Le lecteur est un deck discret : un geste passe à l'étape suivante.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("long-y-step")).toBeVisible();

    await page.keyboard.press("End");
    await expect(page.getByTestId("reader-end")).toBeVisible();
    await expect(page.getByRole("button", { name: /Revoir depuis le début/ })).toBeVisible();
  });
});
