import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getWebtoon } from "@/lib/db/queries";
import { EditorCanvasClient } from "@/components/editor/EditorCanvasClient";

export const dynamic = "force-dynamic";

export default async function EditorWebtoonPage({
  params,
}: {
  params: Promise<{ webtoonId: string }>;
}) {
  const { webtoonId } = await params;
  const t = await getTranslations("editor");

  const webtoon = await getWebtoon(webtoonId);

  if (!webtoon) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <aside className="w-full border-b border-border bg-muted/30 p-4 lg:w-72 lg:border-b-0 lg:border-r" data-testid="editor-sidebar">
          <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground mb-3">
            {t("sections")}
          </h2>
          {webtoon.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSections")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {webtoon.sections.map((section) => (
                <li
                  key={section.id}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <span className="font-medium capitalize">
                    {section.type.replace("-", " ")}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    #{section.position}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section
          data-testid="editor-canvas"
          className="flex-1 overflow-y-auto p-6"
        >
          <EditorCanvasClient initialSections={webtoon.sections} webtoonId={webtoonId} />
        </section>
      </div>
    </main>
  );
}
