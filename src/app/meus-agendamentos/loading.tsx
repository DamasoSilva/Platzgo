export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />

        {/* Filters */}
        <div className="mt-6 flex gap-3">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Booking cards */}
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-3xl border bg-card p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                </div>
                <div className="text-right space-y-2">
                  <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
                <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
