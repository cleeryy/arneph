import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getWebtoon } from "@/lib/db/queries";
import { EditorCanvasClient } from "@/components/editor/EditorCanvasClient";
import { SectionLayersPanelClient } from "@/components/editor/SectionLayersPanelClient";

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
        <aside className="w-full border-b border-border bg-muted/30 p-4 lg:w-72 lg:border-b-0 lg:border-r lg:sticky lg:top-14 lg:self-start lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto" data-testid="editor-sidebar">
          <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground mb-3">
            {t("sections")}
          </h2>
          <SectionLayersPanelClient initialSections={webtoon.sections} />
        </aside>

        <section
          data-testid="editor-canvas"
          className="flex-1 overflow-y-auto p-6"
        >
          <EditorCanvasClient initialSections={webtoon.sections} webtoonId={webtoonId} initialTitle={webtoon.title} initialVisibility={webtoon.visibility} />
        </section>
      </div>
    </main>
  );
}
