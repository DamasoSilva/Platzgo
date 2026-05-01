export default function ProfileLoading() {
  return (
    <div className="ph-page-ambient">
      <div className="h-16 border-b bg-card" />

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-muted" />

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Avatar sidebar */}
          <div className="lg:col-span-4">
            <div className="rounded-3xl border bg-card p-6 flex flex-col items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-9 w-32 animate-pulse rounded-lg bg-muted" />
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-8">
            <div className="rounded-3xl border bg-card p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-1">
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
                  </div>
                ))}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="h-10 w-28 animate-pulse rounded-xl bg-primary/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
