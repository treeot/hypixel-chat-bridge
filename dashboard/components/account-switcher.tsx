'use client'

import { setAccountAction } from '@/app/(app)/actions'
import type { AccountInfo } from '@/lib/types'

/** Guild account picker; submits on change and stores the choice in a cookie. */
export function AccountSwitcher({ accounts, current }: { accounts: AccountInfo[]; current: number | undefined }) {
  if (accounts.length === 0) return null
  return (
    <form action={setAccountAction}>
      <select
        name="account"
        aria-label="Account"
        defaultValue={current === undefined ? undefined : String(current)}
        onChange={e => e.currentTarget.form?.requestSubmit()}
        className="input h-8 w-auto py-0 font-mono text-[12px]"
      >
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {`G${a.id} · ${a.label}`}
          </option>
        ))}
      </select>
    </form>
  )
}
