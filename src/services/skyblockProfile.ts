import { hypixelGet } from './hypixel'

export interface SelectedProfile {
  profile: any
  member: any
  bareUuid: string
  cuteName: string
}

export async function fetchProfiles(apiKey: string, uuid: string): Promise<any[]> {
  const { data } = await hypixelGet('/v2/skyblock/profiles', apiKey, { uuid })
  return data.profiles ?? []
}

export async function selectMember(apiKey: string, uuid: string): Promise<SelectedProfile | undefined> {
  const profiles = await fetchProfiles(apiKey, uuid)
  if (!profiles.length) return undefined

  const bareUuid = uuid.replaceAll('-', '')
  const selected =
    profiles.find(p => p.selected) ??
    [...profiles].sort((a, b) => (b.members?.[bareUuid]?.leveling?.experience || 0) - (a.members?.[bareUuid]?.leveling?.experience || 0))[0]

  const member = selected?.members?.[bareUuid]
  if (!member) return undefined

  return { profile: selected, member, bareUuid, cuteName: selected.cute_name }
}
