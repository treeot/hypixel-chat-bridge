'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ACCOUNT_COOKIE } from '@/lib/account'
import { requireRole } from '@/lib/session'

export async function setAccountAction(formData: FormData): Promise<void> {
  await requireRole('staff')
  const id = String(formData.get('account') ?? '')
  if (!/^\d+$/.test(id)) return
  ;(await cookies()).set(ACCOUNT_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  revalidatePath('/', 'layout')
}
