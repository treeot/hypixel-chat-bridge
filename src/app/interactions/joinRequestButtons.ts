import type { APIEmbed, ButtonInteraction } from 'discord.js'
import type { AppContext } from '../context'
import { isStaff } from '../permissions'
import { describeBlock, executeIfOnline } from '../features/guildCommand'
import { parseJoinButton } from '../features/joinRequest'

export interface Decision {
  action: 'accept' | 'deny'
  by: string
  at: number
}

export class DecisionLog {
  private readonly decisions = new Map<string, Decision>()

  constructor(
    private readonly ttlMs = 15 * 60_000,
    private readonly now: () => number = Date.now
  ) {}

  get(key: string): Decision | undefined {
    const decision = this.decisions.get(key)
    if (decision && this.now() - decision.at >= this.ttlMs) {
      this.decisions.delete(key)
      return undefined
    }
    return decision
  }

  set(key: string, action: 'accept' | 'deny', by: string): void {
    const t = this.now()
    for (const [k, d] of this.decisions) if (t - d.at >= this.ttlMs) this.decisions.delete(k)
    this.decisions.set(key, { action, by, at: t })
  }
}

export function markDecided(embed: APIEmbed | undefined, text: string): APIEmbed {
  const base = embed ?? {}
  return { ...base, fields: [...(base.fields ?? []).filter(f => f.name !== 'Decision'), { name: 'Decision', value: text }] }
}

const decisions = new DecisionLog()

export async function handleJoinButton(interaction: ButtonInteraction, ctx: AppContext): Promise<void> {
  const parsed = parseJoinButton(interaction.customId)
  if (!parsed) return
  const say = (content: string) => interaction.reply({ content, ephemeral: true })

  if (!isStaff(interaction.user.id, interaction.member?.roles, ctx.env)) {
    await say('Only staff can accept or deny join requests.')
    return
  }
  const account = ctx.accounts.get(parsed.accountId)
  if (!account) {
    await say(`Account ${parsed.accountId} is no longer set up.`)
    return
  }

  // Check, send and record run without an await in between, so two clicks in the same tick (officer and log copies) act once.
  const key = `${parsed.accountId}:${parsed.username.toLowerCase()}`
  const previous = decisions.get(key)
  if (previous) {
    await say(`Already ${previous.action === 'accept' ? 'accepted' : 'denied'} by <@${previous.by}>.`)
    return
  }

  if (parsed.action === 'accept') {
    const sent = executeIfOnline(account, `/g accept ${parsed.username}`)
    if (!sent.ok) {
      await say(`Could not accept ${parsed.username}: ${describeBlock(sent.reason)}.`)
      return
    }
  }

  decisions.set(key, parsed.action, interaction.user.id)
  const text =
    parsed.action === 'accept'
      ? `Accepted by <@${interaction.user.id}>`
      : `Denied by <@${interaction.user.id}> (Hypixel has no deny command; the request expires on its own)`
  await interaction.update({ embeds: [markDecided(interaction.message.embeds[0]?.toJSON(), text)], components: [] })
}
