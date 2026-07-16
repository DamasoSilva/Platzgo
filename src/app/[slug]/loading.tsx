export default function EstablishmentSlugLoading() {
  return (
    <div className="ph-page">
      <div className="relative z-10">
        <div className="h-16 bg-card/50" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 pt-4">
          <div className="rounded-2xl bg-card/80 border border-border/60 p-6 sm:p-8 animate-pulse">
            <div className="h-4 w-32 bg-secondary rounded" />
            <div className="mt-3 h-9 w-72 bg-secondary rounded" />
            <div className="mt-4 h-5 w-96 bg-secondary rounded" />
            <div className="mt-5 flex gap-2.5">
              <div className="h-10 w-28 bg-secondary rounded-xl" />
              <div className="h-10 w-28 bg-secondary rounded-xl" />
            </div>
          </div>

          <div className="mt-8">
            <div className="aspect-[16/9] rounded-2xl bg-card/30 animate-pulse" />
          </div>

          <div className="mt-12">
            <div className="h-8 w-48 bg-secondary rounded animate-pulse mb-5" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl bg-card border border-border/60 overflow-hidden animate-pulse">
                  <div className="aspect-[16/10] bg-secondary" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 w-32 bg-secondary rounded" />
                    <div className="h-4 w-24 bg-secondary rounded" />
                    <div className="flex gap-2">
                      <div className="h-10 w-28 bg-secondary rounded-xl" />
                      <div className="h-10 w-10 bg-secondary rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}