/** Runs once when the server starts: fail loudly, naming the variable, if the bridge env is missing. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { bridgeEnv } = await import('./lib/env')
  bridgeEnv()
}
