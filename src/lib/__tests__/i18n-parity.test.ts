import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

function collectKeys(obj: unknown, prefix = ""): Set<string> {
  const keys = new Set<string>()
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return keys
  }
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    keys.add(fullKey)
    const value = (obj as Record<string, unknown>)[key]
    if (value !== null && typeof value === "object") {
      for (const subKey of collectKeys(value, fullKey)) {
        keys.add(subKey)
      }
    }
  }
  return keys
}

describe("i18n parity — fr.json ↔ en.json", () => {
  test("both files have exactly the same set of keys", () => {
    const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"))
    const en = JSON.parse(readFileSync("messages/en.json", "utf8"))

    const frKeys = collectKeys(fr)
    const enKeys = collectKeys(en)

    const onlyInFr = [...frKeys].filter((k) => !enKeys.has(k))
    const onlyInEn = [...enKeys].filter((k) => !frKeys.has(k))

    expect(onlyInFr).toEqual([])
    expect(onlyInEn).toEqual([])
  })
})