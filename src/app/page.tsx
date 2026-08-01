import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <h1 className="text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          {t("subtitle")}
        </p>
      </main>
    </div>
  );
}
