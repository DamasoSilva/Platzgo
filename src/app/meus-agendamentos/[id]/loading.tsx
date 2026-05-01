export default function BookingDetailLoading() {
  return (
    <div className="ph-page-ambient">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="rounded-3xl border bg-card p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-6 w-56 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
            <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <div className="h-10 w-28 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-muted" />
          </div>

          {/* Notifications */}
          <div className="h-20 w-full animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
