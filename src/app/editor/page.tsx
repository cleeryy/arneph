import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, Trash2 } from "lucide-react";

import { listWebtoons, createWebtoon, deleteWebtoon } from "@/lib/db/queries";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const t = await getTranslations("editor");
  const webtoons = await listWebtoons();

  async function handleCreate() {
    "use server";
    await createWebtoon({ title: "Nouveau", visibility: "draft" });
  }

  return (
    <main className="flex flex-1 flex-col bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <form action={handleCreate}>
            <button
              type="submit"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-12 gap-2 text-base",
              )}
            >
              <Plus aria-hidden="true" />
              {t("newWebtoon")}
            </button>
          </form>
        </div>

        {webtoons.length === 0 ? (
          <p
            data-testid="editor-empty"
            className="mx-auto mt-24 text-center text-base text-muted-foreground"
          >
            {t("empty")}
          </p>
        ) : (
          <ul className="mx-auto mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {webtoons.map((webtoon) => (
              <li key={webtoon.id}>
                <Card className="h-full transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <CardTitle>{webtoon.title}</CardTitle>
                    <CardDescription>
                      {webtoon.visibility === "draft"
                        ? t("draft")
                        : t("published")}
                    </CardDescription>
                  </CardHeader>
                  <div className="flex items-center gap-2 px-6 pb-4">
                    <Link
                      href={`/editor/${webtoon.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "flex-1",
                      )}
                    >
                      {t("edit")}
                    </Link>
                    <Link
                      href={`/read/${webtoon.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "flex-1",
                      )}
                    >
                      {t("read")}
                    </Link>
                    <form action={async () => {
                      "use server";
                      await deleteWebtoon(webtoon.id);
                    }}>
                      <button
                        type="submit"
                        aria-label={t("delete")}
                        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
