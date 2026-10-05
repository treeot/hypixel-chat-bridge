export const SETUP_PREFIX = 'setup'
export const ROOT = '-'
const MAX_CUSTOM_ID = 100

export interface SetupId {
  area: string
  scope: string
  action: string
  arg: string
}

export function encodeId(area: string, action: string, scope: string = ROOT, arg: string = ROOT): string {
  for (const part of [area, action, scope, arg]) {
    if (!part || part.includes(':')) throw new Error(`Invalid custom id part "${part}"`)
  }
  const id = `${SETUP_PREFIX}:${area}:${scope}:${action}:${arg}`
  if (id.length > MAX_CUSTOM_ID) throw new Error(`Custom id too long: ${id}`)
  return id
}

export function decodeId(customId: string): SetupId | null {
  const parts = customId.split(':')
  if (parts.length !== 5 || parts[0] !== SETUP_PREFIX || parts.some(part => !part)) return null
  const [, area, scope, action, arg] = parts
  return { area, scope, action, arg }
}
