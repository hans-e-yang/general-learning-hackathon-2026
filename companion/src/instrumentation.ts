export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { configureAgentLoop, getAdapter } = await import("@/lib/agent");
  const { publish } = await import("@/lib/session/bus");
  configureAgentLoop({ adapter: getAdapter(), publishEvent: publish });
}
