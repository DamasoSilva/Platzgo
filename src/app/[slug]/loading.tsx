export default function SlugLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Establishment header card */}
        <div className="rounded-3xl border bg-card p-6 space-y-3">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="flex gap-3">
            <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>

        {/* Cover image */}
        <div className="mt-6 aspect-[16/9] max-h-64 w-full animate-pulse rounded-3xl bg-muted" />

        {/* Quadras heading */}
        <div className="mt-8 h-7 w-28 animate-pulse rounded bg-muted" />

        {/* Courts grid */}
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border bg-card overflow-hidden">
              <div className="aspect-[16/10] w-full animate-pulse bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
