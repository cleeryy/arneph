import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// ─── next/navigation ───
// Les hooks de navigation Next.js sont inutilisables hors d'un contexte
// App Router ; mock systématique pour que les tests composants restent isolés.
const push = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()
const prefetch = vi.fn()
const back = vi.fn()
const forward = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh, prefetch, back, forward }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

// ─── Supabase (pattern T10) ───
// @supabase/supabase-js n'est PAS installé pour l'instant : la résolution est
// assurée par l'alias dans vitest.config.ts vers ./mocks/supabase.ts.
// Quand T10 l'installera, remplacer l'alias par :
//
//   vi.mock("@supabase/supabase-js", () => ({
//     createClient: vi.fn(() => ({
//       from: vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: [], error: null }) })),
//     })),
//   }))

// Re-export pour les tests qui voudraient le mock directement
export { createClient } from "@/test/mocks/supabase"
