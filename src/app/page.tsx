import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, BookOpen, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Accueil « une seule page » : une déclaration, deux portes.
 *
 * Parti pris visuel : le studio d'impression. Trame de points, repères de
 * calage aux angles, titre avec un léger décalage CMJN (cyan/magenta) qui se
 * recale à l'arrivée. Aucune image : la typographie et la trame suffisent.
 */
export default async function Home() {
  const t = await getTranslations("home");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--foreground)_18%,transparent)_1px,transparent_0)] [background-size:22px_22px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-4 border border-foreground/10 sm:inset-6"
      />

      {/* Repères de calage, comme sur une planche à imprimer. */}
      {[
        "left-3 top-3 border-l border-t sm:left-5 sm:top-5",
        "right-3 top-3 border-r border-t sm:right-5 sm:top-5",
        "bottom-3 left-3 border-b border-l sm:bottom-5 sm:left-5",
        "bottom-3 right-3 border-b border-r sm:bottom-5 sm:right-5",
      ].map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute size-4 border-foreground/30",
            position,
          )}
        />
      ))}

      <header className="relative z-10 flex items-baseline justify-between px-6 pt-6 sm:px-10 sm:pt-8">
        <span className="font-heading text-sm font-semibold tracking-[0.28em] uppercase">
          Arneph
        </span>
        <span className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
          Webtoon studio
        </span>
      </header>

      <section className="relative z-10 flex flex-1 flex-col justify-end px-6 pb-10 pt-20 sm:px-10 sm:pb-14">
        <h1 className="home-title max-w-4xl text-balance font-heading text-[clamp(2.6rem,8.5vw,6.5rem)] font-semibold leading-[0.94] tracking-[-0.035em] text-foreground">
          {t("title")}
        </h1>
        <p className="mt-6 max-w-md text-pretty text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
          {t("subtitle")}
        </p>
      </section>

      <nav
        aria-label={t("title")}
        className="relative z-10 grid border-t border-foreground/15 sm:grid-cols-2"
      >
        <Link
          href="/read"
          className="home-entry group flex items-center justify-between gap-4 border-b border-foreground/15 bg-foreground px-6 py-7 text-background outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset sm:border-b-0 sm:border-r sm:px-10 sm:py-9"
        >
          <span className="flex items-center gap-3">
            <BookOpen aria-hidden="true" className="size-5 opacity-80" />
            <span className="font-heading text-xl font-medium sm:text-2xl">
              {t("readerLink")}
            </span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>

        <Link
          href="/editor"
          className="home-entry group flex items-center justify-between gap-4 px-6 py-7 text-foreground outline-none transition-colors hover:bg-foreground hover:text-background focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset sm:px-10 sm:py-9"
        >
          <span className="flex items-center gap-3">
            <PenLine aria-hidden="true" className="size-5 opacity-80" />
            <span className="font-heading text-xl font-medium sm:text-2xl">
              {t("editorLink")}
            </span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </nav>
    </main>
  );
}
