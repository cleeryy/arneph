import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Alias "@/*" → src/ (via tsconfig) ; fallback explicite pour vitest
      "@": path.resolve(__dirname, "./src"),
      // GUARDRAIL : aucun test ne doit dépendre d'un Supabase démarré.
      // @supabase/supabase-js n'est PAS encore installé (T10) ; tout import
      // de ce module dans les tests est redirigé vers le mock local.
      // Quand T10 l'installera, ce mock continuera d'intercepter — voulu.
      "@supabase/supabase-js": path.resolve(__dirname, "./src/test/mocks/supabase.ts"),
    },
  },
  test: {
    // jsdom requis pour les tests composants (pas de mode node ici)
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // globals volontairement NON activés : imports explicites dans les tests
  },
})
