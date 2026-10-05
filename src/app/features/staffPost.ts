import type { APIActionRowComponent, APIButtonComponent, APIEmbed } from 'discord.js'
import type { AppContext } from '../context'

export interface StaffPost {
  embeds: APIEmbed[]
  components?: APIActionRowComponent<APIButtonComponent>[]
}

export function staffChannelIds(...ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

/** Failures are logged, never thrown. */
export async function postToStaff(ctx: AppContext, post: StaffPost, extraChannelId?: string): Promise<void> {
  const ids = staffChannelIds(ctx.minecraft.config.officerChannelId, ctx.env.logChannelId, extraChannelId)
  if (!ids.length) {
    ctx.log.info('No officer or log channel configured; staff post skipped', { accountId: ctx.minecraft.id })
    return
  }
  await Promise.all(
    ids.map(async id => {
      try {
        const channel = await ctx.discord.client.channels.fetch(id)
        if (!channel?.isSendable()) throw new Error('not a channel the bot can send to')
        await channel.send({ embeds: post.embeds, components: post.components ?? [], allowedMentions: { parse: [] } })
      } catch (error) {
        ctx.log.warn('Could not post to a staff channel', { channelId: id, error: String(error) })
      }
    })
  )
}
