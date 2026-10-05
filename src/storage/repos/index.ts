import type { Store } from '../store'
import { AuthCacheRepo } from './authCache'
import { InfoRepository } from './info'
import { LinkRepo } from './links'
import { BlacklistRepo, WhitelistRepo } from './lists'
import { WaitlistRepo } from './waitlist'

export { AuthCacheRepo, BlacklistRepo, InfoRepository, LinkRepo, WaitlistRepo, WhitelistRepo }
export type { InfoDoc } from './info'
export type { LinkEntry } from './links'
export type { BlacklistEntry, PlayerListEntry, WhitelistEntry } from './lists'
export type { WaitlistEntry } from './waitlist'
export { createWaitlists, waitlistCollection } from './waitlist'

export interface Repos {
  info: InfoRepository
  whitelist: WhitelistRepo
  blacklist: BlacklistRepo
  waitlist: WaitlistRepo
  link: LinkRepo
  authCache: AuthCacheRepo
}

export function createRepos(store: Store): Repos {
  return {
    info: new InfoRepository(store),
    whitelist: new WhitelistRepo(store),
    blacklist: new BlacklistRepo(store),
    waitlist: new WaitlistRepo(store),
    link: new LinkRepo(store),
    authCache: new AuthCacheRepo(store)
  }
}
