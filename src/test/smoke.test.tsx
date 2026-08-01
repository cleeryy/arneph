import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { Button } from "@/components/ui/button"

describe("smoke — infra vitest + RTL", () => {
  test("renders a shadcn Button with its label", () => {
    render(<Button>Chargement</Button>)
    expect(screen.getByRole("button", { name: "Chargement" })).toBeInTheDocument()
  })

  test("guardrail: @supabase/supabase-js resolves to local mock without the package", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const client = createClient("https://fake.supabase.co", "fake-key")
    const res = await client.from("episodes").select("*").eq("id", 1)
    expect(client.from).toHaveBeenCalledWith("episodes")
    expect(res).toEqual({ data: [], error: null })
  })
})
