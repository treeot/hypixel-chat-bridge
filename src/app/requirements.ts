import type { Env } from '../core/env'
import type { Logger } from '../core/logger'

export type Requirement = 'hypixel' | 'guildlbGuild'

export const REQUIREMENT_ENV: Record<Requirement, string> = {
  hypixel: 'HYPIXEL_API_KEY',
  guildlbGuild: 'GUILDLB_GUILD_KEY'
}

export function has(env: Env, req: Requirement): boolean {
  switch (req) {
    case 'hypixel':
      return !!env.hypixelApiKey
    case 'guildlbGuild':
      return !!env.guildlb?.guildKey
  }
}

export function firstMissing(env: Env, reqs: readonly Requirement[] | undefined): string | undefined {
  for (const req of reqs ?? []) if (!has(env, req)) return REQUIREMENT_ENV[req]
  return undefined
}

export function disabledLine(feature: string, envVar: string): string {
  return `${feature} is disabled: ${envVar} is not set.`
}

export class MissingKeyError extends Error {
  constructor(readonly envVar: string) {
    super(`${envVar} is not set`)
    this.name = 'MissingKeyError'
  }
}

export function hypixelKey(env: Env): string {
  if (!env.hypixelApiKey) throw new MissingKeyError(REQUIREMENT_ENV.hypixel)
  return env.hypixelApiKey
}

/** `apiKey` throws `MissingKeyError` instead of calling the API with no key. */
export function hypixelDeps(env: Env, log: Logger): { readonly apiKey: string; log: Logger } {
  return {
    get apiKey() {
      return hypixelKey(env)
    },
    log
  }
}

const HYPIXEL_BUTTONS: Record<string, string> = { 'apply-guild': 'Applying', 'link-account': 'Linking' }

export function buttonGate(customId: string, env: Env): string | undefined {
  const feature = HYPIXEL_BUTTONS[customId.split(':')[0]]
  return feature && !has(env, 'hypixel') ? disabledLine(feature, REQUIREMENT_ENV.hypixel) : undefined
}

export interface StartupNotice {
  level: 'info' | 'debug'
  text: string
}

/** Startup notices for features off because a key is missing. GuildLB is opt-in, so its line is debug unless some GuildLB key is set. */
export function disabledFeatures(env: Env): StartupNotice[] {
  const lines: StartupNotice[] = []
  if (!has(env, 'hypixel'))
    lines.push({
      level: 'info',
      text: 'HYPIXEL_API_KEY not set: live SkyBlock stat commands, join requirements/auto-accept, GEXP, own-guild lookups, verify/link and Apply are disabled.'
    })
  if (!has(env, 'guildlbGuild'))
    lines.push({
      level: env.guildlb ? 'info' : 'debug',
      text: 'GUILDLB_GUILD_KEY not set: alliance blacklist and scammer checks, /alliance and !scammer are off.'
    })
  return lines
}
