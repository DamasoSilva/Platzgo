export default function SignInLoading() {
  return (
    <div className="ph-page ph-page-ambient flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-600 to-emerald-800" />
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        <div className="w-full max-w-md px-6 py-16 animate-pulse">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-secondary" />
              <div className="h-6 w-28 rounded bg-secondary" />
            </div>
          </div>
          <div className="h-9 w-32 rounded bg-secondary mb-2" />
          <div className="h-4 w-56 rounded bg-secondary/70" />
          <div className="mt-8 space-y-4">
            <div className="h-4 w-16 rounded bg-secondary/60" />
            <div className="h-12 w-full rounded-xl bg-secondary" />
            <div className="h-4 w-16 rounded bg-secondary/60" />
            <div className="h-12 w-full rounded-xl bg-secondary" />
            <div className="h-12 w-full rounded-xl bg-primary/20 mt-2" />
          </div>
          <div className="mt-6 flex justify-center">
            <div className="h-4 w-48 rounded bg-secondary/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
