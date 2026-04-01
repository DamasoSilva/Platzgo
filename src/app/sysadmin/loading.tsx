export default function SysadminLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-6 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
