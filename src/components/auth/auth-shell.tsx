import Link from "next/link";

import { cn } from "@/lib/utils";

interface AuthShellProps {
  /** Nom de marque affiché au-dessus du titre (i18n : `auth.brand`). */
  brand: string;
  title: string;
  subtitle?: string;
  backHomeLabel: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Cadre commun aux écrans d'authentification et de compte.
 *
 * Reprend l'identité « studio d'impression » de l'accueil : trame de points,
 * filet de coupe aux angles, micro-label mono en capitales. La colonne reste
 * étroite (`max-w-sm`) et centrée, comme la page de connexion d'origine.
 */
export function AuthShell({
  brand,
  title,
  subtitle,
  backHomeLabel,
  children,
  className,
}: AuthShellProps) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklab,var(--foreground)_14%,transparent)_1px,transparent_0)] [background-size:22px_22px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-4 border border-foreground/10 sm:inset-6"
      />

      <div className={cn("relative w-full max-w-sm", className)}>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-1.5 rotate-45 bg-foreground/60"
          />
          <p className="font-mono text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">
            {brand}
          </p>
        </div>

        <h1 className="mt-6 font-heading text-2xl font-semibold tracking-tight text-balance text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}

        <div className="mt-8">{children}</div>

        <Link
          href="/"
          className="mt-10 inline-block rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          ← {backHomeLabel}
        </Link>
      </div>
    </main>
  );
}
