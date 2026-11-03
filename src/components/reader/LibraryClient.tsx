"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Search,
  SearchX,
  X,
} from "lucide-react";

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
  // libellés locaux minimaux, alignés sur la locale active.
  const clearLabel = locale.startsWith("fr")
    ? "Effacer la recherche"
    : "Clear search";
  const resetLabel = locale.startsWith("fr") ? "Réinitialiser" : "Reset";

  const dateFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        // Force UTC : évite tout décalage d'hydratation serveur/navigateur.
        timeZone: "UTC",
      }),
    [locale],
  );

  function handleClear() {
    setQuery("");
    setDebouncedQuery("");
    searchInputRef.current?.focus();
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div role="search" className="relative w-full sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            data-testid="library-search"
            className="h-10 bg-background pr-10 pl-9 focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/60 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label={clearLabel}
              title={clearLabel}
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/60"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <label
            htmlFor="library-sort"
            className="text-sm whitespace-nowrap text-muted-foreground"
          >
            {t("sortBy")}
          </label>
          <div className="relative">
            <select
              id="library-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as LibrarySort)}
              data-testid="library-sort"
              className={cn(
                "h-10 appearance-none rounded-lg border border-input bg-background py-1 pr-9 pl-3 text-base text-foreground transition-colors outline-none sm:text-sm",
                "cursor-pointer focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-foreground/60",
                "dark:bg-input/30",
              )}
            >
              <option value="newest">{t("sortNewest")}</option>
              <option value="title">{t("sortTitle")}</option>
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
      </div>

      {visibleWebtoons.length === 0 ? (
        <div
          data-testid="library-no-results"
          className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center"
        >
          <span className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
            <SearchX aria-hidden="true" className="size-5" />
          </span>
          <p role="status" className="max-w-xs text-sm text-muted-foreground">
            {t("noResults")}
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {resetLabel}
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {visibleWebtoons.map((webtoon) => {
            const created = new Date(webtoon.createdAt);
            const createdLabel = Number.isNaN(created.getTime())
              ? null
              : dateFormatter.format(created);
            const initial =
              Array.from(webtoon.title.trim())[0]?.toUpperCase() ?? "";

            return (
              <li key={webtoon.id} className="min-w-0">
                <Link
                  href={`/read/${webtoon.id}`}
                  className="group block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Card className="h-full gap-0 overflow-hidden py-0 transition-colors duration-200 hover:ring-foreground/25 group-hover:bg-muted/30">
                    <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
                      {webtoon.coverPath ? (
                        <Image
                          src={getSupabasePublicObjectUrl(webtoon.coverPath)}
                          alt={webtoon.title}
                          width={800}
                          height={450}
                          sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                          className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
                          unoptimized
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[linear-gradient(140deg,var(--muted),var(--background))]"
                        >
                          {initial ? (
                            <span className="font-heading text-6xl font-semibold tracking-tight text-muted-foreground/60 select-none">
                              {initial}
                            </span>
                          ) : (
                            <BookOpen className="size-8 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      {/* Voile + pastille : affordance au survol / focus clavier. */}
                      {webtoon.coverPath ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="absolute right-3 bottom-3 inline-flex size-8 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow-sm transition-[opacity,transform] duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:translate-y-1 motion-safe:group-hover:translate-y-0 motion-safe:group-focus-visible:translate-y-0"
                      >
                        <ArrowUpRight className="size-4" />
                      </span>
                    </div>

                    <CardHeader className="gap-1.5 px-4 py-4">
                      {createdLabel ? (
                        <time
                          dateTime={webtoon.createdAt}
                          className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
                        >
                          {createdLabel}
                        </time>
                      ) : null}
                      <CardTitle className="text-[15px] leading-snug">
                        {webtoon.title}
                      </CardTitle>
                      {webtoon.description ? (
                        <CardDescription className="line-clamp-2 text-[13px] leading-relaxed">
                          {webtoon.description}
                        </CardDescription>
                      ) : null}
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
