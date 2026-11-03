import { vi } from "vitest"

const OK = { data: [], error: null }

function createQueryBuilder() {
  const builder: Record<string, unknown> = {}
  const chainable = [
    "select",
    "insert",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "order",
    "limit",
    "range",
    "single",
    "maybeSingle",
    "match",
    "or",
    "not",
  ]
  for (const m of chainable) {
    builder[m] = vi.fn(() => builder)
  }
  const thenable = Promise.resolve(OK)
  void thenable
  builder.then = (resolve: (v: typeof OK) => unknown) => resolve(OK)
  return builder as unknown as {
    select: ReturnType<typeof vi.fn>
    eq: ReturnType<typeof vi.fn>
    single: ReturnType<typeof vi.fn>
    then: (resolve: (v: typeof OK) => unknown) => unknown
  }
}

export function createClient(_url?: string, _key?: string) {
  void _url;
  void _key;
  return {
    from: vi.fn(() => createQueryBuilder()),
    rpc: vi.fn().mockResolvedValue(OK),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue(OK),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: "" }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "" }, error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    },
  }
}

export type SupabaseMockClient = ReturnType<typeof createClient>
