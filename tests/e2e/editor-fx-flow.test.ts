import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const WEBTON_ID = crypto.randomUUID();

// 1x1 opaque PNG (self-contained fixture, no /tmp dependency).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const IMAGE_PNG_FIXTURE = {
  name: "test-image.png",
  mimeType: "image/png",
  buffer: PNG_BYTES,
};

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
    title: "E2E FX Flow Test",
    description: "Webtoon créé pour les tests E2E FX flow.",
    visibility: "draft",
    settings: {},
  });
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

function createMinimalAnimatedGif() {
  const header = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(1, 0);
  lsd.writeUInt16LE(1, 2);
  lsd[4] = 0xf0;
  lsd[5] = 0;
  lsd[6] = 0;

  const gct = Buffer.from([0x00, 0x00, 0x00, 0xff, 0xff, 0xff]);

  const imgDesc1 = Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const lzwMin1 = Buffer.from([0x02]);
  const data1 = Buffer.from([0x02, 0x01, 0x00, 0x01, 0x01, 0x00]);
  const block1 = Buffer.concat([lzwMin1, data1, Buffer.from([0x00])]);

  const imgDesc2 = Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const lzwMin2 = Buffer.from([0x02]);
  const data2 = Buffer.from([0x02, 0x02, 0x00, 0x01, 0x01, 0x00]);
  const block2 = Buffer.concat([lzwMin2, data2, Buffer.from([0x00])]);

  const gce1 = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const gce2 = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]);

  const trailer = Buffer.from([0x3b]);

  return Buffer.concat([
    header, lsd, gct,
    gce1, imgDesc1, block1,
    gce2, imgDesc2, block2,
    trailer,
  ]);
}

test.describe("E2E Editor FX Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
  });

  test.afterEach(async () => {
    await deleteWebtoon(WEBTON_ID);
  });

  test("new-section dialog: create pan-x, cancel, sidebar reorder, FX upload+save+render", async ({ page }) => {
    await createWebtoon();

    await page.goto(`${BASE}/editor/${WEBTON_ID}`);
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    await expect(page.locator("[data-testid='editor-sidebar']")).toBeVisible();
    await expect(page.locator("[data-testid='editor-canvas']")).toBeVisible();

    const sortableSections = page.locator("[data-testid^='sortable-section-']");
    const countBeforeDialog = await sortableSections.count();

    await page.getByRole("button", { name: "Ajouter une section" }).first().click();
    await page.waitForTimeout(500);

    const dialogContent = page.locator('[data-slot="dialog-content"]');
    await expect(dialogContent).toBeVisible();
    await expect(dialogContent.getByText("Nouvelle section")).toBeVisible();

    await dialogContent.getByRole("button", { name: "Annuler" }).click();
    await page.waitForTimeout(300);

    await expect(sortableSections).toHaveCount(countBeforeDialog);

    await page.getByRole("button", { name: "Ajouter une section" }).first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();

    await page.getByRole("button", { name: "Panoramique" }).click();
    await page.getByRole("button", { name: "Créer" }).click();
    await page.waitForTimeout(500);

    const canvasSortables = page.locator(
      "[data-testid='editor-canvas'] [data-testid^='sortable-section-']",
    );
    await expect(canvasSortables.first()).toBeVisible();

    // La section créée via le dialog a une config invalide (imagePath vide,
    // width/height 0) qui échoue la validation Zod au save. On lui ajoute une
    // image via le panneau de config (UI) pour la rendre sauvegardable.
    const firstCanvasSection = canvasSortables.first();
    await firstCanvasSection.getByRole("button", { name: "Modifier la section" }).click();
    await page.waitForTimeout(500);

    const imageUpload = page.locator("#image-upload");
    await imageUpload.setInputFiles(IMAGE_PNG_FIXTURE);
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: "Fermer le panneau" }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForTimeout(1000);

    await page.reload();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));

    const panXPreview = page.locator("[data-testid='preview-pan-x']").first();
    await expect(panXPreview).toBeVisible();

    const gifBuffer = createMinimalAnimatedGif();
    const gifFileName = `webtoons/sections/${WEBTON_ID}/${Date.now()}-fx-test.gif`;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/webtoon-images/${gifFileName}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "image/gif",
        },
        body: gifBuffer,
      },
    );
    expect(uploadRes.ok).toBeTruthy();
    const fxStoragePath = gifFileName;

    const sectionRes = await apiRequest("POST", "/rest/v1/sections", {
      webtoon_id: WEBTON_ID,
      type: "image",
      config: {
        type: "image",
        imagePath: fxStoragePath,
        width: 800,
        height: 1280,
        fxPath: fxStoragePath,
        fxConfig: {
          position: { x: "center", y: "center" },
          size: { mode: "percent", width: 100 },
          opacity: 1,
        },
      },
      position: 2,
    });
    const sections = await sectionRes.json();
    const fxSection = Array.isArray(sections) ? sections[0] : sections;
    const fxSectionId = fxSection.id;

    await apiRequest("POST", "/rest/v1/images", {
      id: crypto.randomUUID(),
      section_id: fxSectionId,
      webtoon_id: WEBTON_ID,
      storage_path: fxStoragePath,
      width: 800,
      height: 1280,
      mime_type: "image/gif",
      position: 0,
    });

    await page.reload();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));
    await expect(page.locator("[data-testid='editor-sidebar']")).toBeVisible();

    // Deux sections existent désormais : on teste le réordonnancement.
    const canvasSections = page.locator(
      "[data-testid='editor-canvas'] [data-testid^='sortable-section-']",
    );
    await expect(canvasSections).toHaveCount(2);
    await canvasSections.first().getByRole("button", { name: "Descendre" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.waitForTimeout(1000);

    await page.reload();
    await page.waitForURL(new RegExp(`/editor/${WEBTON_ID}`));
    await expect(page.locator("[data-testid='editor-sidebar']")).toBeVisible();

    const fxSectionAfterReload = page.locator(`[data-testid='editor-section-${fxSectionId}']`);
    await expect(fxSectionAfterReload).toBeVisible();

    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator("[data-testid='visibility-badge']")).toContainText("Publié");

    await page.goto(`${BASE}/read/${WEBTON_ID}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-testid='fx-overlay']")).toBeVisible();
    await expect(page.locator("[data-testid='pan-x-section']").first()).toBeVisible();
  });
});
