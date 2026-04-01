export default function TournamentsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Filters + summary */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="rounded-3xl border bg-card p-5">
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          </div>
          <div className="rounded-3xl border bg-card p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>

        {/* Tournament cards */}
        <div className="mt-6 h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-3xl border bg-card p-5 space-y-3">
              <div className="flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-4 animate-pulse rounded bg-muted" />
                <div className="h-4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
