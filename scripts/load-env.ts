import fs from "node:fs";
import path from "node:path";

/** Fichiers lus dans cet ordre : le premier défini gagne. */
export const DEFAULT_ENV_FILES = [".env.local", ".env"] as const;

const ENV_LINE =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

function stripQuotes(value: string): string {
  if (value.length < 2) return value;

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse un contenu `.env` minimal (commentaires, lignes vides, quotes). */
export function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    const match = ENV_LINE.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    values[key] = stripQuotes(rawValue);
  }

  return values;
}

/**
 * Racine par défaut : le répertoire de travail. Playwright et `npm run` sont
 * lancés depuis la racine du dépôt ; passer `root` sinon.
 *
 * `import.meta.url` n'est pas utilisable ici : Playwright transpile la config
 * et ses imports en CJS, où `import.meta` lève une SyntaxError.
 */
function resolveProjectRoot(): string {
  return process.cwd();
}

export interface LoadLocalEnvOptions {
  /** Répertoire contenant les fichiers `.env*` (défaut : racine du dépôt). */
  root?: string;
  /** Fichiers à lire, du plus prioritaire au moins prioritaire. */
  files?: readonly string[];
}

/**
 * Charge `.env.local` puis `.env` dans `process.env` sans écraser une variable
 * déjà définie (l'environnement exporté et la CI restent prioritaires).
 *
 * Utilisé par `playwright.config.ts`, dont le process est le parent des workers
 * E2E : les tests voient donc les variables via `process.env`.
 */
export function loadLocalEnv(options: LoadLocalEnvOptions = {}): void {
  const files = options.files ?? DEFAULT_ENV_FILES;
  const root = options.root ? path.resolve(options.root) : resolveProjectRoot();

  for (const file of files) {
    const fullPath = path.resolve(root, file);
    if (!fs.existsSync(fullPath)) continue;

    const values = parseEnv(fs.readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
