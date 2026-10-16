'use client'

import { ConfirmButton } from '@/components/confirm-button'
import type { Result } from '@/lib/bridge-errors'
import { removeConfirm, type ListTab } from '@/lib/lists-copy'
import { ActionForm } from './action-form'

/** A Remove button that asks first, with a consequence line that depends on the list. `fields` are the hidden values the action needs. */
export function RemoveForm({
  tab,
  who,
  action,
  fields,
  success = 'Removed'
}: {
  tab: ListTab
  who?: string
  action: (formData: FormData) => Promise<Result>
  fields: Record<string, string>
  success?: string
}) {
  const copy = removeConfirm(tab, who)
  return (
    <ActionForm className="flex justify-end" action={action} success={who ? `${who} ${tab === 'links' ? 'unlinked' : 'removed'}` : success}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ConfirmButton className="btn-ghost btn-sm" {...copy}>
        {tab === 'links' ? 'Unlink' : 'Remove'}
      </ConfirmButton>
    </ActionForm>
  )
}
