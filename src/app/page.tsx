import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, BookOpen, PenLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Révélation d'entrée : déplacement seul, sans opacité — le contenu reste
 * lisible dès le premier rendu. Désactivée avec `prefers-reduced-motion`
 * (motion-safe).
 */
const REVEAL =
  "motion-safe:animate-in motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out";

export default async function Home() {
  const t = await getTranslations("home");

  const entries = [
    {
      href: "/read",
      label: t("readerLink"),
      index: "01",
      primary: true,
      Icon: BookOpen,
    },
    {
      href: "/editor",
      label: t("editorLink"),
      index: "02",
      primary: false,
      Icon: PenLine,
    },
  ];

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
      {/* Trame de points, fondue vers le haut : profondeur sans image. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 0%, #000 10%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 0%, #000 10%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <header className="lg:col-span-7">
            <p
              className={cn(
                "font-mono text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase",
                REVEAL,
              )}
            >
              Arneph
            </p>
            <h1
              className={cn(
                "mt-5 max-w-xl font-heading text-4xl leading-[1.04] font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl",
                REVEAL,
                "motion-safe:delay-75",
              )}
            >
              {t("title")}
            </h1>
            <p
              className={cn(
                "mt-5 max-w-lg text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8",
                REVEAL,
                "motion-safe:delay-150",
              )}
            >
              {t("subtitle")}
            </p>
          </header>

          <nav
            className={cn(
              "grid gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1",
              REVEAL,
              "motion-safe:delay-200",
            )}
          >
            {entries.map(({ href, label, index, primary, Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex min-h-32 flex-col justify-between gap-8 rounded-xl p-5 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:min-h-36",
                  primary
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border bg-card text-card-foreground hover:bg-muted/60",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-lg",
                      primary
                        ? "bg-primary-foreground/10 text-primary-foreground"
                        : "border border-border bg-background text-foreground",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tracking-[0.2em]",
                      primary
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {index}
                  </span>
                </span>

                <span className="flex items-end justify-between gap-3">
                  <span className="font-heading text-lg font-medium tracking-tight">
                    {label}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className={cn(
                      "size-5 shrink-0 transition-[transform,opacity] duration-200 group-hover:opacity-100 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5",
                      primary ? "opacity-70" : "text-muted-foreground opacity-70",
                    )}
                  />
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </main>
  );
}
