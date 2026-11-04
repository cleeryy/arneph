import fs from "node:fs";
import path from "node:path";

import { test, expect, type Locator, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";
const DEMO_TITLE = "Démo";
const READING_INDEX_PREFIX = "arneph:reader-index:v1";

/**
 * `next dev` lit `.env.local`, pas le process Playwright. On reprend donc les
 * mêmes clés (priorité à l'environnement déjà exporté) pour résoudre le
 * webtoon de démo via l'API REST Supabase, comme `e2e-flow.test.ts`.
 */
function loadLocalEnv(): Record<string, string> {
  const values: Record<string, string> = {};

  for (const file of [".env.local", ".env"]) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;

    for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key in values) continue;

      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    }
  }

  return values;
}

const LOCAL_ENV = loadLocalEnv();
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  LOCAL_ENV.NEXT_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_ENV.SUPABASE_SERVICE_ROLE_KEY || "";

async function apiRequest(method: string, url: string): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}${url}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
  }
  return res;
}

async function resolveDemoWebtoon(): Promise<{ id: string; title: string }> {
  const res = await apiRequest(
    "GET",
    `/rest/v1/webtoons?select=id,title&title=eq.${encodeURIComponent(DEMO_TITLE)}`,
  );
  const rows = (await res.json()) as { id: string; title: string }[];
  if (rows.length === 0) {
    throw new Error(
      `Webtoon de démo "${DEMO_TITLE}" introuvable — lancer le seed local.`,
    );
  }
  return rows[0];
}

async function listPublishedWebtoons(): Promise<
  { title: string; createdAt: string }[]
> {
  const res = await apiRequest(
    "GET",
    "/rest/v1/webtoons?select=title,created_at&visibility=eq.published&order=created_at.desc",
  );
  const rows = (await res.json()) as { title: string; created_at: string }[];
  return rows.map((row) => ({ title: row.title, createdAt: row.created_at }));
}

/** Cartes de la bibliothèque : un `<li>` par webtoon publié. */
function libraryCards(page: Page): Locator {
  return page.locator("main ul > li");
}

async function libraryTitles(page: Page): Promise<string[]> {
  return libraryCards(page)
    .locator('[data-slot="card-title"]')
    .allInnerTexts();
}

test.describe.configure({ timeout: 90_000 });

test.describe("Produit — lecteur, bibliothèque, éditeur (lecture seule)", () => {
  test("lecteur : navigation discrète, progression et reprise", async ({ page }) => {
    const demo = await resolveDemoWebtoon();

    await page.goto(`${BASE}/read/${demo.id}`);
    await page.waitForLoadState("networkidle");

    const deck = page.getByTestId("reader-deck");
    const progressBar = page.getByTestId("reader-progress");
    await expect(deck).toBeVisible();
    await expect(deck).toHaveAttribute("data-hydrated", "true");
    await expect(progressBar).toBeVisible();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByTestId("image-step")).toBeVisible();

    // Un geste = un écran : le compteur et la progression avancent d'un coup.
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("long-y-step")).toBeVisible();
    await expect
      .poll(async () => Number(await progressBar.getAttribute("aria-valuenow")))
      .toBeGreaterThan(0);

    // L'index de lecture est persisté (pas un ratio de pixels).
    const storageKey = `${READING_INDEX_PREFIX}:${demo.id}`;
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = window.localStorage.getItem(key);
          return raw === null ? -1 : Number.parseInt(raw, 10);
        }, storageKey),
      )
      .toBeGreaterThan(0);

    await page.reload({ waitUntil: "networkidle" });

    const resumeButton = page.getByTestId("resume-reading");
    await expect(resumeButton).toBeVisible();
    await resumeButton.click();
    await expect(page.getByTestId("long-y-step")).toBeVisible();
  });

  test("bibliothèque : recherche, tri et état sans résultat", async ({ page }) => {
    const published = await listPublishedWebtoons();
    expect(published.length).toBeGreaterThan(1);

    await page.goto(`${BASE}/read`);
    await page.waitForLoadState("networkidle");

    const cards = libraryCards(page);
    await expect(cards.first()).toBeVisible();

    const initialTitles = await libraryTitles(page);
    expect(initialTitles.length).toBe(published.length);

    // Recherche insensible aux accents : « demo » trouve « Démo » (et les
    // descriptions qui contiennent « démonstration »), donc on vérifie que la
    // liste se réduit strictement et que la carte de démo reste présente.
    const search = page.getByTestId("library-search");
    await search.fill(DEMO_TITLE);

    await expect
      .poll(() => cards.count())
      .toBeLessThan(initialTitles.length);
    await expect
      .poll(() => libraryTitles(page))
      .toContain(DEMO_TITLE);

    await search.fill("requete-absurde-sans-resultat");
    await expect(page.getByTestId("library-no-results")).toBeVisible();
    await expect(cards).toHaveCount(0);

    // « Réinitialiser » restaure la liste complète.
    await page.getByRole("button", { name: "Réinitialiser" }).click();
    await expect(cards).toHaveCount(initialTitles.length);

    // Le tri par titre réordonne réellement les cartes (ordre A→Z, fr).
    await page.getByTestId("library-sort").selectOption("title");

    const expectedTitleOrder = published
      .map((webtoon) => webtoon.title)
      .sort((a, b) => a.localeCompare(b, "fr"));
    await expect
      .poll(() => libraryTitles(page))
      .toEqual(expectedTitleOrder);
    expect(expectedTitleOrder).not.toEqual(initialTitles);
  });

  test("éditeur : métadonnées, historique vierge, duplication et sélection de calque", async ({
    page,
  }) => {
    const demo = await resolveDemoWebtoon();

    await page.goto(`${BASE}/editor/${demo.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("editor-sidebar")).toBeVisible();

    // Métadonnées chargées depuis le serveur.
    await expect(page.getByTestId("metadata-form")).toBeVisible();
    await expect(page.getByTestId("metadata-title")).toHaveValue(DEMO_TITLE);

    // Aucune édition : l'historique est vide, donc « Annuler » est inactif.
    await expect(page.getByTestId("undo-button")).toBeDisabled();
    await expect(page.getByTestId("redo-button")).toBeDisabled();

    const canvasSections = page.locator(
      "[data-testid='editor-canvas'] [data-testid^='sortable-section-']",
    );
    await expect(canvasSections.first()).toBeVisible();
    const sectionCount = await canvasSections.count();
    expect(sectionCount).toBeGreaterThan(0);

    // Chaque section du canvas expose une action « Dupliquer ».
    await expect(
      canvasSections
        .first()
        .getByRole("button", { name: "Dupliquer la section" }),
    ).toBeVisible();

    // Sélection dans la sidebar → le calque et la section canvas correspondent.
    const layers = page.locator("[data-testid^='layer-section-']");
    await expect(layers).toHaveCount(sectionCount);

    const targetLayer = layers.nth(Math.min(1, sectionCount - 1));
    const targetSectionId = await targetLayer.getAttribute("data-section-id");
    expect(targetSectionId).not.toBeNull();

    // Clic côté gauche de la ligne : évite les boutons d'action en bout de ligne.
    await targetLayer.click({ position: { x: 8, y: 8 } });

    await expect(targetLayer).toHaveAttribute("data-selected", "true");
    await expect(targetLayer).toHaveAttribute("aria-pressed", "true");

    const canvasTarget = page.locator(
      `[data-testid='editor-canvas'] [data-testid='editor-section-${targetSectionId}']`,
    );
    await expect(canvasTarget).toHaveAttribute("data-selected", "true");
  });
});
