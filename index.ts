import 'dotenv/config'
import { Bridge } from './src/bridge'
import { EnvError } from './src/core/env'
import { StartupError } from './src/core/errors'

process.title = 'Chat Bridge'

async function main(): Promise<void> {
  let bridge: Bridge
  try {
    bridge = new Bridge()
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }
  await bridge.start()
}

main().catch(error => {
  if (error instanceof StartupError) {
    console.error(error.message)
    process.exit(1)
  }
  // Anything thrown out of start() (DB unreachable, Discord login failure) is
  // fatal — log it plainly and exit non-zero so a supervisor can decide to restart.
  console.error('Fatal: bridge failed to start')
  console.error(error)
  process.exit(1)
})
