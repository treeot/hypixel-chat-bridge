import nbt from 'prismarine-nbt'
import type { ChatCommand } from '../context'
import { targetIgn, resolveProfile, statEmbed, matchesTriggers } from './_shared'

const triggers = ['accessories', 'acc'] as const

/** Magic power is not computed: it needs Hypixel's undocumented talisman-family grouping and an external rarity-to-points table, so this reports the raw count/ID list. */
const accessories: ChatCommand = {
  name: 'accessories',
  toggle: 'accessories',

  triggers,
  usage: '[ign]',
  description: "Counts a player's accessories and lists their IDs.",
  matches: message => matchesTriggers(message, triggers),

  async execute(ctx, { chat, message, username, rank }) {
    const resolved = await resolveProfile(ctx, targetIgn(message, username), 'accessories')
    if (!resolved) return
    const { ign, uuid, selected } = resolved

    const talismanBag = selected.member?.inventory?.talisman_bag
    if (!talismanBag?.data) return ctx.minecraft.execute(`/gc ${ign} has their Inventory API off or no talisman bag data.`)

    let accessoryIds: string[]
    try {
      const buffer = Buffer.from(talismanBag.data, 'base64')
      const { parsed } = await nbt.parse(buffer)
      const simplified = nbt.simplify(parsed) as { i?: any[] }
      const items = simplified.i ?? []
      accessoryIds = items
        .filter((item: any) => item?.id !== undefined && item?.tag?.ExtraAttributes?.id)
        .map((item: any) => item.tag.ExtraAttributes.id as string)
    } catch (error) {
      ctx.log.error('Error decoding talisman bag NBT', error, { uuid })
      return ctx.minecraft.execute(`/gc Could not decode ${ign}'s accessory bag.`)
    }

    const uniqueIds = [...new Set(accessoryIds)]

    ctx.minecraft.execute(`/gc ${ign} ➜ Accessories ${accessoryIds.length} items (${uniqueIds.length} unique)`)

    await ctx.discord.sendEmbed(
      chat,
      statEmbed(
        ign,
        'accessories',
        [
          `**Accessories:** ${accessoryIds.length} items (${uniqueIds.length} unique)`,
          '',
          '*Magic power is not calculated — it requires an external talisman-family/rarity database not present in this API response. See the source comment in `accessories.ts` for details.*'
        ].join('\n'),
        rank,
        undefined,
        username
      )
    )
  }
}

export default accessories
