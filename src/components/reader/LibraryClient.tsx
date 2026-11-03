"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, Search, X } from "lucide-react";

import { getSupabasePublicObjectUrl } from "@/lib/supabase/public-url";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Vue client minimale d'un webtoon publié (pas de settings côté navigateur). */
export interface LibraryWebtoon {
  id: string;
  title: string;
  description?: string;
  coverPath?: string;
  createdAt: string;
}

export type LibrarySort = "newest" | "title";

/** Délai de debounce de la recherche (ms). */
const SEARCH_DEBOUNCE_MS = 250;

const SORT_NEWEST: LibrarySort = "newest";

/**
 * Normalisation recherche : NFD + suppression des diacritiques + minuscules.
 * Rend « Éclat » trouvable via « eclat ».
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesQuery(webtoon: LibraryWebtoon, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = normalizeForSearch(
    `${webtoon.title} ${webtoon.description ?? ""}`,
  );
  return haystack.includes(normalizedQuery);
}

function compareByNewest(a: LibraryWebtoon, b: LibraryWebtoon): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (Number.isNaN(diff) || diff === 0) return a.id.localeCompare(b.id);
  return diff;
}

function compareByTitle(a: LibraryWebtoon, b: LibraryWebtoon): number {
  return a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id);
}

/** Filtrage + tri purs, exportés pour des tests unitaires directs. */
export function selectLibraryWebtoons(
  webtoons: LibraryWebtoon[],
  query: string,
  sort: LibrarySort,
): LibraryWebtoon[] {
  const normalizedQuery = normalizeForSearch(query.trim());
  const filtered = webtoons.filter((webtoon) =>
    matchesQuery(webtoon, normalizedQuery),
  );

  return filtered.sort(
    sort === "title" ? compareByTitle : compareByNewest,
  );
}

interface LibraryClientProps {
  /** Liste déjà filtrée côté serveur (publiés uniquement) : source SEO/no-JS. */
  webtoons: LibraryWebtoon[];
}

/**
 * Bibliothèque lecteur interactive : recherche (titre + description) et tri.
 * Le serveur rend cette liste complète — sans JS, toutes les cartes restent
 * visibles et indexables.
 */
export default function LibraryClient({ webtoons }: LibraryClientProps) {
  const t = useTranslations("library");
  const locale = useLocale();

  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [sort, setSort] = React.useState<LibrarySort>(SORT_NEWEST);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const visibleWebtoons = React.useMemo(
    () => selectLibraryWebtoons(webtoons, debouncedQuery, sort),
    [webtoons, debouncedQuery, sort],
  );

  // Aucune clé i18n dédiée au bouton d'effacement (messages hors périmètre) :
  // libellé local minimal, aligné sur la locale active.
  const clearLabel = locale.startsWith("fr")
    ? "Effacer la recherche"
    : "Clear search";

  function handleClear() {
    setQuery("");
    setDebouncedQuery("");
    searchInputRef.current?.focus();
  }

  return (
    <>
      <div className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            data-testid="library-search"
            className="h-9 pr-9 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label={clearLabel}
              title={clearLabel}
              className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="library-sort"
            className="text-sm whitespace-nowrap text-muted-foreground"
          >
            {t("sortBy")}
          </label>
          <select
            id="library-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as LibrarySort)}
            data-testid="library-sort"
            className={cn(
              "h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground transition-colors outline-none",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "dark:bg-input/30",
            )}
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="title">{t("sortTitle")}</option>
          </select>
        </div>
      </div>

      {visibleWebtoons.length === 0 ? (
        <p
          role="status"
          data-testid="library-no-results"
          className="mx-auto mt-24 text-center text-base text-muted-foreground"
        >
          {t("noResults")}
        </p>
      ) : (
        <ul className="mx-auto mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleWebtoons.map((webtoon) => (
            <li key={webtoon.id}>
              <Link
                href={`/read/${webtoon.id}`}
                className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-colors hover:bg-accent/50">
                  {webtoon.coverPath ? (
                    <Image
                      src={getSupabasePublicObjectUrl(webtoon.coverPath)}
                      alt={webtoon.title}
                      width={800}
                      height={450}
                      sizes="(min-width:640px) 50vw, 100vw"
                      className="aspect-video w-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-muted/50 text-muted-foreground">
                      <BookOpen aria-hidden="true" className="size-10" />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{webtoon.title}</CardTitle>
                    {webtoon.description ? (
                      <CardDescription className="line-clamp-2">
                        {webtoon.description}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
