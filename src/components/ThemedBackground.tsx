export function ThemedBackground() {
  return (
    <>
      {/* Background (light) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 block opacity-[0.55] dark:hidden"
        style={{
          backgroundImage:
            "radial-gradient(900px 500px at 15% 10%, rgba(204,255,0,0.22), transparent 60%)," +
            "radial-gradient(700px 420px at 85% 25%, rgba(56,189,248,0.16), transparent 60%)," +
            "radial-gradient(900px 540px at 50% 100%, rgba(168,85,247,0.10), transparent 60%)," +
            "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,1))," +
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 80px)," +
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 80px)",
        }}
      />

      {/* Background (dark) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 hidden opacity-[0.55] dark:block"
        style={{
          backgroundImage:
            "radial-gradient(900px 520px at 15% 10%, rgba(204,255,0,0.18), transparent 62%)," +
            "radial-gradient(760px 460px at 85% 25%, rgba(56,189,248,0.14), transparent 62%)," +
            "radial-gradient(900px 540px at 50% 100%, rgba(168,85,247,0.10), transparent 62%)," +
            "linear-gradient(to bottom, rgba(18,18,18,0.90), rgba(18,18,18,1))," +
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 88px)," +
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 88px)",
        }}
      />
    </>
  );
}
