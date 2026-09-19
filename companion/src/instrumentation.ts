export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { configureAgentLoop, getAdapter } = await import("@/lib/agent");
  const { publish } = await import("@/lib/session/bus");
  const adapter = getAdapter();
  console.info(
    `[circlr] agent adapter=${adapter.name} (CIRCLR_LLM=${process.env.CIRCLR_LLM ?? "fake"})`,
  );
  configureAgentLoop({ adapter, publishEvent: publish });
}
