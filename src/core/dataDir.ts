import { accessSync, constants, mkdirSync } from 'node:fs'
import { StartupError } from './errors'

/** Railway mounts Volumes as root while the image runs as uid 1000. */
export function assertWritableDir(dir: string, onRailway: boolean): void {
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown error'
    const hint = onRailway
      ? 'Railway mounts Volumes as root and this image runs as uid 1000: add the variable RAILWAY_RUN_UID=0 to the service (the template sets it).'
      : 'Make sure the directory, or the Docker volume mounted there, is writable by the user running the bridge (uid 1000 in the Docker image).'
    throw new StartupError(`Cannot write to the data directory ${dir} (${code}). ${hint}`)
  }
}
