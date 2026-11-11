import type { AreaId } from '../../settings/registry'
import type { SetupArea } from '../types'
import { accountsArea } from './accounts'
import { brandingArea } from './branding'
import { commandsArea } from './commands'
import { featuresArea } from './features'
import { filtersArea } from './filters'
import { formatsArea } from './formats'
import { gexpArea } from './gexp'
import { guildlbArea } from './guildlb'
import { joinRequestsArea } from './joinRequests'
import { motdArea } from './motd'
import { ranksArea } from './ranks'
import { relayArea } from './relay'
import { verifyArea } from './verify'

export const SETUP_AREAS: Record<AreaId, SetupArea> = {
  accounts: accountsArea,
  relay: relayArea,
  formats: formatsArea,
  ranks: ranksArea,
  commands: commandsArea,
  joinRequests: joinRequestsArea,
  gexp: gexpArea,
  filters: filtersArea,
  verify: verifyArea,
  guildlb: guildlbArea,
  features: featuresArea,
  branding: brandingArea,
  motd: motdArea
}

export const AREA_ORDER: readonly AreaId[] = [
  'accounts',
  'relay',
  'formats',
  'ranks',
  'commands',
  'filters',
  'joinRequests',
  'gexp',
  'verify',
  'guildlb',
  'features',
  'branding',
  'motd'
]

export function isAreaId(value: string): value is AreaId {
  return Object.prototype.hasOwnProperty.call(SETUP_AREAS, value)
}
