import { describe, expect, it, vi } from 'vitest'
import type { APIEmbed } from 'discord.js'
import type { AppContext } from '../src/app/context'
import { slashCommands, slashGate, visibleCommands } from '../src/app/commands'
import type { Env } from '../src/core/env'

// Load the registry first: help.ts reads it, and importing help.ts first hits the circular import.
const help = slashCommands.find(command => command.name === 'help')!

const OWNER = '100000000000000042'
const env = { ownerId: OWNER, accounts: [{ index: 1, guildChannelId: '100000000000000001' }] } as unknown as Env

async function helpEmbed(userId = '100000000000000043'): Promise<APIEmbed> {
  const editReply = vi.fn(async () => undefined)
  const interaction = { user: { id: userId }, member: null, client: { user: null }, guild: null, editReply }
  const ctx = { env } as unknown as AppContext
  await help.execute(interaction as unknown as Parameters<typeof help.execute>[0], ctx)
  return ((editReply.mock.calls[0] as unknown[])[0] as { embeds: APIEmbed[] }).embeds[0]
}

describe('/help', () => {
  it('adds no static !guildlb line', async () => {
    const embed = await helpEmbed()
    const guild = embed.fields?.find(field => field.name === 'Minecraft — Guild & Utility')
    expect(guild?.value).toContain('`!guild`')
    expect((embed.fields ?? []).map(field => field.value).join('\n')).not.toContain('`!guildlb`')
  })

  const discordLines = (embed: APIEmbed) =>
    (embed.fields ?? [])
      .filter(field => field.name === 'Discord Commands' || field.name === '')
      .map(field => field.value)
      .join('\n')

  it('hides /setup from non-staff', async () => {
    expect(discordLines(await helpEmbed())).not.toContain('`setup`')
  })

  it('hides /setup from the owner too (displayHelp: false), while owner-visible commands still show', async () => {
    const lines = discordLines(await helpEmbed(OWNER))
    expect(lines).not.toContain('`setup`')
    expect(lines).toContain('`help`')
  })

  it('/setup is published and runnable without any optional key (no hiddenWithout / requires)', () => {
    const setup = visibleCommands(env).find(command => command.name === 'setup')
    expect(setup).toBeDefined()
    expect(slashGate(setup!, env)).toBeUndefined()
  })
})
