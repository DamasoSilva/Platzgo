export function ThemedBackground() {
  return (
    <>
      {/* Background (light) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 block opacity-[0.9] dark:hidden"
        style={{
          backgroundImage:
            "radial-gradient(780px 420px at 14% 8%, rgba(204,255,0,0.10), transparent 62%)," +
            "radial-gradient(680px 420px at 86% 18%, rgba(16,185,129,0.10), transparent 60%)," +
            "radial-gradient(960px 520px at 50% 100%, rgba(56,189,248,0.08), transparent 64%)," +
            "linear-gradient(180deg, rgba(13,17,28,0.98) 0%, rgba(12,18,30,0.99) 40%, rgba(10,16,26,1) 100%)," +
            "repeating-linear-gradient(90deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 84px)," +
            "repeating-linear-gradient(0deg, rgba(148,163,184,0.04) 0 1px, transparent 1px 84px)",
        }}
      />

      {/* Background (dark) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 hidden opacity-[0.95] dark:block"
        style={{
          backgroundImage:
            "radial-gradient(820px 440px at 14% 8%, rgba(204,255,0,0.14), transparent 62%)," +
            "radial-gradient(700px 420px at 86% 18%, rgba(16,185,129,0.12), transparent 60%)," +
            "radial-gradient(980px 520px at 50% 100%, rgba(56,189,248,0.10), transparent 64%)," +
            "linear-gradient(180deg, rgba(10,14,24,0.98) 0%, rgba(9,15,26,0.99) 40%, rgba(7,12,20,1) 100%)," +
            "repeating-linear-gradient(90deg, rgba(148,163,184,0.06) 0 1px, transparent 1px 88px)," +
            "repeating-linear-gradient(0deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 88px)",
        }}
      />
    </>
  );
}
