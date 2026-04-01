export default function CourtLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Court photo */}
        <div className="h-48 w-full animate-pulse rounded-2xl bg-muted" />

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Court info */}
          <div className="lg:col-span-4 space-y-4">
            <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-muted" />
          </div>

          {/* Booking panel */}
          <div className="lg:col-span-8 space-y-4">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            {/* Date selector */}
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
            {/* Time slots */}
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            {/* Summary */}
            <div className="mt-4 h-24 w-full animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
