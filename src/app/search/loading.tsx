export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header placeholder */}
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Sidebar filters */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="h-10 w-full animate-pulse rounded-xl bg-primary/20" />
            </div>
          </div>

          {/* Results area */}
          <div className="lg:col-span-7 space-y-4">
            <div className="h-48 w-full animate-pulse rounded-2xl bg-muted" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border bg-card p-4 flex gap-4">
                <div className="h-24 w-32 shrink-0 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
