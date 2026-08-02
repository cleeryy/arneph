import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { BookOpen } from "lucide-react";

import { listPublishedWebtoons } from "@/lib/db/queries";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** URL publique d'un objet du bucket storage `webtoon-images`. */
function coverUrl(coverPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/webtoon-images/${coverPath}`;
}

/** Bibliothèque lecteur : webtoons publiés uniquement (fetch serveur T10, drafts jamais exposés). */
export default async function ReadPage() {
  const t = await getTranslations("reader");
  const webtoons = await listPublishedWebtoons();

  return (
    <main className="flex flex-1 flex-col bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t("title")}
        </h1>
      </div>

      {webtoons.length === 0 ? (
        <p
          data-testid="reader-empty"
          className="mx-auto mt-24 text-center text-base text-muted-foreground"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="mx-auto mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {webtoons.map((webtoon) => (
            <li key={webtoon.id}>
              <Link
                href={`/read/${webtoon.id}`}
                className="block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-colors hover:bg-accent/50">
                  {webtoon.coverPath ? (
                    <Image
                      src={coverUrl(webtoon.coverPath)}
                      alt={webtoon.title}
                      width={800}
                      height={450}
                      sizes="(min-width:640px) 50vw, 100vw"
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-muted/50 text-muted-foreground">
                      <BookOpen aria-hidden="true" className="size-10" />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{webtoon.title}</CardTitle>
                    {webtoon.description ? (
                      <CardDescription className="line-clamp-2">
                        {webtoon.description}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
