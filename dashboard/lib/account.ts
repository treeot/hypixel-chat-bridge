import 'server-only'
import { cookies } from 'next/headers'
import type { AccountInfo } from './types'

export const ACCOUNT_COOKIE = 'hcb-account'

/** Cookie id if it names a listed account, else the first enabled account, else the first. */
export function pickAccount(accounts: AccountInfo[], cookie: string | undefined): AccountInfo | undefined {
  return accounts.find(a => String(a.id) === cookie) ?? accounts.find(a => a.enabled) ?? accounts[0]
}

export async function selectedAccount(accounts: AccountInfo[]): Promise<AccountInfo | undefined> {
  return pickAccount(accounts, (await cookies()).get(ACCOUNT_COOKIE)?.value)
}
