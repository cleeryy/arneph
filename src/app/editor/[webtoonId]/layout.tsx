import * as React from "react";

import { getWebtoon } from "@/lib/db/queries";
import { EditorStateProvider } from "@/components/editor/EditorStateContext";
import { EditorDetailLayoutContent } from "@/components/editor/EditorDetailShell";

export const dynamic = "force-dynamic";

export default async function EditorDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ webtoonId: string }>;
}) {
  const { webtoonId } = await params;
  const webtoon = await getWebtoon(webtoonId);

  return (
    <EditorStateProvider
      key={webtoonId}
      initialTitle={webtoon?.title ?? null}
      initialDescription={webtoon?.description ?? null}
      initialVisibility={webtoon?.visibility ?? null}
    >
      <EditorDetailLayoutContent
        webtoonId={webtoonId}
        initialCoverPath={webtoon?.coverPath ?? null}
      >
        {children}
      </EditorDetailLayoutContent>
    </EditorStateProvider>
  );
}
