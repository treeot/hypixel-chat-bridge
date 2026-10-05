import axios from 'axios'
import type { Logger } from '../core/logger'

// No `g` flag: these are only ever used with `.test()`, and a stateful global
// regex would silently skip matches across repeated calls (`lastIndex` leak).
const UUID_REGEX = /([0-9a-f]{8})(?:-|)([0-9a-f]{4})(?:-|)(4[0-9a-f]{3})(?:-|)([89ab][0-9a-f]{3})(?:-|)([0-9a-f]{12})/im
const MOJANG_TIMEOUT_MS = 8_000
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/

async function retryRequest<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      if (error?.response?.status === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retries reached')
}

export async function getUsernameFromUUID(uuid: string, log?: Logger): Promise<string | undefined> {
  if (!UUID_REGEX.test(`${uuid}`)) return undefined

  try {
    const response = await retryRequest(() => axios.get(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`))
    return response.data.name
  } catch (error) {
    log?.error('Error fetching username from Mojang API', error, { uuid })
    return undefined
  }
}

export async function getUUIDFromUsername(username: string, log?: Logger): Promise<string | undefined> {
  if (!USERNAME_REGEX.test(username)) return undefined

  try {
    const response = await retryRequest(() => axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`, { timeout: MOJANG_TIMEOUT_MS }))
    return response.data.id
  } catch (error) {
    log?.error('Error fetching UUID from Mojang API', error, { username })
    return undefined
  }
}
