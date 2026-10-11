'use server'

import { revalidatePath } from 'next/cache'
import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'
import { actionError, type Result } from '@/lib/bridge-errors'

const ACTIONS = ['promote', 'demote', 'mute', 'unmute', 'kick', 'invite', 'setrank'] as const
const USER = /^\w{1,16}$/
const DURATION = /^\d{1,4}[smhd]$/

function accountId(formData: FormData): number | null {
  const raw = String(formData.get('accountId') ?? '')
  return /^\d+$/.test(raw) ? Number(raw) : null
}

export async function moderate(formData: FormData): Promise<Result> {
  const actor = await requireRole('staff')
  const id = accountId(formData)
  if (id === null) return { ok: false, error: 'Pick an account' }
  const action = String(formData.get('action') ?? '')
  if (!(ACTIONS as readonly string[]).includes(action)) return { ok: false, error: 'Unknown action' }
  const user = String(formData.get('user') ?? '').trim()
  if (!USER.test(user)) return { ok: false, error: 'Enter a Minecraft username' }
  const extra = String(formData.get('extra') ?? '').trim()
  if (action === 'mute' && !DURATION.test(extra)) return { ok: false, error: 'Duration looks like 1h, 30m or 7d' }
  if (action === 'setrank' && !extra) return { ok: false, error: 'Pick a rank' }

  const res =
    action === 'promote' || action === 'demote'
      ? await bridge.command(actor.discordId, id, `/g ${action} ${user}`)
      : await bridge.moderation(actor.discordId, id, action, user, extra || undefined)
  if (!res.ok) return actionError(res)
  revalidatePath('/guild')
  return { ok: true }
}

export async function runCommand(formData: FormData): Promise<Result> {
  const actor = await requireRole('admin')
  const id = accountId(formData)
  if (id === null) return { ok: false, error: 'Pick an account' }
  const command = String(formData.get('command') ?? '').trim()
  if (!command) return { ok: false, error: 'Enter a command' }
  const res = await bridge.command(actor.discordId, id, command)
  if (!res.ok) return actionError(res)
  revalidatePath('/guild')
  return { ok: true }
}
