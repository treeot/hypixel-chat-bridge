'use server'

import { bridge } from '@/lib/bridge'
import { actionError, type Result } from '@/lib/bridge-errors'
import { requireRole } from '@/lib/session'

export async function sendChat(formData: FormData): Promise<Result> {
  const user = await requireRole('staff')
  const accountId = String(formData.get('accountId') ?? '')
  const chat = formData.get('chat')
  const message = String(formData.get('message') ?? '').trim()
  if (!/^\d+$/.test(accountId)) return { ok: false, error: 'No account selected' }
  if (chat !== 'guild' && chat !== 'officer') return { ok: false, error: 'Pick guild or officer chat' }
  if (message.length < 1 || message.length > 256) return { ok: false, error: 'Message must be 1–256 characters' }
  if (/[\r\n]/.test(message)) return { ok: false, error: 'Message must be a single line' }
  const res = await bridge.chat(user.discordId, Number(accountId), chat, message, user.name)
  return res.ok ? { ok: true } : actionError(res)
}
