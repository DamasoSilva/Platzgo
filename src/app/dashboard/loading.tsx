export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header card */}
      <div className="rounded-2xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>

      {/* Calendar grid placeholder */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-muted" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
