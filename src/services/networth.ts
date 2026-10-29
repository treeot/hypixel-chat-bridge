import type { NetworthResult } from 'skyhelper-networth'
import { hypixelGet } from './hypixel'

export interface PlayerNetworth {
  profileName: string
  networth: NetworthResult
}

type NetworthLib = typeof import('skyhelper-networth')
let lib: Promise<NetworthLib> | undefined

/** skyhelper-networth pulls in a large item database, so it loads on the first networth request, not at boot. */
function loadNetworthLib(): Promise<NetworthLib> {
  lib ??= import('skyhelper-networth').catch(error => {
    lib = undefined
    throw error
  })
  return lib
}

let networthReady: Promise<void> | undefined

/** Items auto-refresh every 12h, prices cache for 5min; a failed warm-up is retried on the next call. */
export function ensureNetworthReady(): Promise<void> {
  if (!networthReady) {
    networthReady = loadNetworthLib()
      .then(async ({ NetworthManager, UpdateManager }) => {
        UpdateManager.disable()
        await NetworthManager.updateItems()
      })
      .catch(error => {
        networthReady = undefined
        throw error
      })
  }
  return networthReady
}

export async function getPlayerNetworth(apiKey: string, uuid: string): Promise<PlayerNetworth | undefined> {
  await ensureNetworthReady()
  const { ProfileNetworthCalculator } = await loadNetworthLib()
  // Hypixel keys profile members by undashed, lowercase uuid; normalize so a dashed/upper uuid still matches.
  const memberId = uuid.replaceAll('-', '').toLowerCase()
  const profileResponse = await hypixelGet('/v2/skyblock/profiles', apiKey, { uuid })
  const profiles: any[] = profileResponse.data.profiles ?? []

  let selectedProfile = profiles.find(profile => profile.selected === true)
  if (!selectedProfile)
    selectedProfile = [...profiles].sort(
      (a, b) => (b.members?.[memberId]?.leveling?.experience || 0) - (a.members?.[memberId]?.leveling?.experience || 0)
    )[0]
  if (!selectedProfile) return undefined

  const profileData = selectedProfile.members?.[memberId]
  // The fallback sort can pick a profile that doesn't actually contain this member; without profile data
  // the calculator would throw, so treat it the same as "no profiles" for a clean upstream reply.
  if (!profileData) return undefined

  // Museum is optional: a player with their Museum API toggle off makes Hypixel 403 this
  // endpoint. Networth is still computable without it, so treat any museum failure as "no data".
  let museumData: any
  try {
    const museumResponse = await hypixelGet('/v2/skyblock/museum', apiKey, { profile: selectedProfile.profile_id })
    museumData = museumResponse.data.members?.[memberId]
  } catch {
    museumData = undefined
  }

  const bankBalance = selectedProfile.banking?.balance || 0

  const calculator = new ProfileNetworthCalculator(profileData, museumData, bankBalance)
  const networth = await calculator.getNetworth()

  return { profileName: selectedProfile.cute_name, networth }
}
