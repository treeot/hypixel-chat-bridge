import type { AppContext } from '../context'

export type ScreenFlow = 'joinRequest' | 'apply' | 'invite' | 'waitlist'

export interface ScreenInput {
  flow: ScreenFlow
  accountId: number
  uuid: string
  username: string
}

export type ScreenVerdict = { action: 'continue' } | { action: 'hold' | 'deny'; note: string; applicantReply?: string }

export type PreAcceptCheck = (ctx: AppContext, input: ScreenInput) => Promise<ScreenVerdict>

/** Runs `ctx.preAcceptCheck` if set. No hook -> continue. A throwing hook is logged (warn) and treated as continue (GuildLB errors never block join handling). */
export async function runPreAcceptCheck(ctx: AppContext, input: ScreenInput): Promise<ScreenVerdict> {
  if (!ctx.preAcceptCheck) return { action: 'continue' }
  try {
    return await ctx.preAcceptCheck(ctx, input)
  } catch (error) {
    ctx.log.warn('Pre-accept check failed; continuing', { error, flow: input.flow, accountId: input.accountId })
    return { action: 'continue' }
  }
}
