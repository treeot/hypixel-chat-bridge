'use client'

import { setAccountAction } from '@/app/(app)/actions'
import { accountName } from '@/lib/labels'
import type { AccountInfo } from '@/lib/types'

/** Guild account picker; submits on change and stores the choice in a cookie. */
export function AccountSwitcher({ accounts, current }: { accounts: AccountInfo[]; current: number | undefined }) {
  if (accounts.length === 0) return null
  return (
    // React resets a form after its action runs; keying on the current account remounts the select showing the new choice.
    <form key={current} action={setAccountAction} title="Which guild account pages act on">
      <select
        name="account"
        aria-label="Account"
        defaultValue={current === undefined ? undefined : String(current)}
        onChange={e => e.currentTarget.form?.requestSubmit()}
        className="input input-sm w-auto max-w-[9rem] sm:max-w-[12rem]"
      >
        {accounts.map(a => (
          <option key={a.id} value={a.id}>
            {accountName(a, accounts)}
          </option>
        ))}
      </select>
    </form>
  )
}
