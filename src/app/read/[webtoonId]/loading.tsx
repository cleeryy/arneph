import { Skeleton } from "@/components/ui/skeleton";

export default function ReaderLoading() {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 py-12">
      <div className="mx-auto w-full max-w-[800px]">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-6 h-[70vh] w-full rounded-xl" />
        <Skeleton className="mt-4 h-10 w-1/3" />
      </div>
    </main>
  );
}
