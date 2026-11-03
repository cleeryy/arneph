import { getTranslations } from "next-intl/server";

import { listWebtoons } from "@/lib/db/queries";
import { WebtoonListClient } from "@/components/editor/WebtoonListClient";

export const dynamic = "force-dynamic";

export default async function EditorPage() {
  const t = await getTranslations("editor");
  const webtoons = await listWebtoons();

  return (
    <main className="flex flex-1 flex-col bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <WebtoonListClient
          title={t("title")}
          webtoons={webtoons.map((webtoon) => ({
            id: webtoon.id,
            title: webtoon.title,
            visibility: webtoon.visibility,
          }))}
        />
      </div>
    </main>
  );
}
