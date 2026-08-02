import { Skeleton } from "@/components/ui/skeleton";

export default function ReadLoading() {
  return (
    <main className="flex flex-1 flex-col bg-background px-6 py-12">
      <Skeleton className="h-9 w-48" />
      <div className="mx-auto mt-8 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    </main>
  );
}
