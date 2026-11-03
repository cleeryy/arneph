import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

// next/image requiert la config optimizer (hors test) → mock qui expose src/w/h.
// `unoptimized` est conservé en data-attribute : les assets Supabase ne doivent
// jamais passer par l'optimiseur Next (règle AGENTS.md).
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, className, unoptimized } = props as {
      src: string;
      alt: string;
      width: number;
      height: number;
      className?: string;
      unoptimized?: boolean;
    };
    return (
      <img
        data-testid="next-image"
        data-unoptimized={String(Boolean(unoptimized))}
        alt={alt}
        src={src}
        width={width}
        height={height}
        className={className}
      />
    );
  },
}));

import LibraryClient, {
  type LibraryWebtoon,
} from "../LibraryClient";

const messages = {
  library: {
    searchPlaceholder: "Rechercher un webtoon…",
    sortBy: "Trier par",
    sortNewest: "Plus récents",
    sortTitle: "Titre (A→Z)",
    noResults: "Aucun webtoon ne correspond.",
  },
};

const webtoons: LibraryWebtoon[] = [
  {
    id: "w-zephyr",
    title: "Zéphyr",
    description: "Un vent léger sur les toits",
    createdAt: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "w-eclat",
    title: "Éclat d'été",
    description: "Une aventure estivale au bord de la mer",
    coverPath: "covers/eclat.webp",
    createdAt: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "w-aurore",
    title: "Aurore",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
];

function renderLibrary(items: LibraryWebtoon[] = webtoons) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <LibraryClient webtoons={items} />
    </NextIntlClientProvider>,
  );
}

/** Ordre affiché, déduit des liens de carte (pas de markup de test dédié). */
function renderedOrder(): string[] {
  return screen.getAllByRole("link").map((link) => {
    const href = link.getAttribute("href") ?? "";
    return href.replace("/read/", "");
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LibraryClient", () => {
  test("affiche la liste serveur, liens /read/:id et image non optimisée", () => {
    renderLibrary();

    expect(screen.getByText("Zéphyr")).toBeInTheDocument();
    expect(screen.getByText("Éclat d'été")).toBeInTheDocument();
    expect(screen.getByText("Aurore")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText("Éclat d'été").closest("a")).toHaveAttribute(
      "href",
      "/read/w-eclat",
    );

    const image = screen.getByTestId("next-image");
    expect(image).toHaveAttribute("alt", "Éclat d'été");
    expect(image.getAttribute("src")).toContain("covers/eclat.webp");
    expect(image).toHaveAttribute("data-unoptimized", "true");
  });

  test("trie par défaut du plus récent au plus ancien (createdAt desc)", () => {
    renderLibrary();

    expect(renderedOrder()).toEqual(["w-eclat", "w-aurore", "w-zephyr"]);
  });

  test("trie par titre A→Z avec localeCompare fr", () => {
    renderLibrary();

    fireEvent.change(screen.getByLabelText("Trier par"), {
      target: { value: "title" },
    });

    expect(renderedOrder()).toEqual(["w-aurore", "w-eclat", "w-zephyr"]);
  });

  test("filtre sur le titre sans tenir compte des accents ni de la casse", async () => {
    renderLibrary();

    fireEvent.change(screen.getByTestId("library-search"), {
      target: { value: "ECLAT" },
    });

    await waitFor(() => expect(renderedOrder()).toEqual(["w-eclat"]));
    expect(screen.getByText("Éclat d'été")).toBeInTheDocument();
  });

  test("filtre sur la description, insensible aux accents", async () => {
    renderLibrary();

    fireEvent.change(screen.getByTestId("library-search"), {
      target: { value: "estivale" },
    });

    await waitFor(() => expect(renderedOrder()).toEqual(["w-eclat"]));
  });

  test("affiche l'état vide de recherche si aucun résultat", async () => {
    renderLibrary();

    fireEvent.change(screen.getByTestId("library-search"), {
      target: { value: "introuvable" },
    });

    await waitFor(() =>
      expect(screen.getByTestId("library-no-results")).toHaveTextContent(
        "Aucun webtoon ne correspond.",
      ),
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  test("le bouton d'effacement restaure la liste complète", async () => {
    renderLibrary();
    const input = screen.getByTestId("library-search");

    fireEvent.change(input, { target: { value: "introuvable" } });
    await waitFor(() =>
      expect(screen.getByTestId("library-no-results")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /effacer la recherche/i }));

    await waitFor(() => expect(renderedOrder()).toHaveLength(3));
    expect(input).toHaveValue("");
    expect(screen.queryByTestId("library-no-results")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  test("le bouton d'effacement est absent sans requête", () => {
    renderLibrary();

    expect(
      screen.queryByRole("button", { name: /effacer la recherche/i }),
    ).not.toBeInTheDocument();
  });

  test("le filtrage est debounced (pas de recalcul immédiat)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderLibrary();

    fireEvent.change(screen.getByTestId("library-search"), {
      target: { value: "zephyr" },
    });
    expect(renderedOrder()).toHaveLength(3);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(renderedOrder()).toEqual(["w-zephyr"]);
  });
});
