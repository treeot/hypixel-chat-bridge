import { readFileSync } from 'node:fs'
import { GatewayIntentBits } from 'discord.js'
import { describe, expect, it } from 'vitest'
import { BOT_PERMISSIONS, GATEWAY_INTENTS, PRIVILEGED_INTENTS, inviteUrl, permissionsInteger } from '../src/discord/permissions'

describe('discord permissions', () => {
  it('requests exactly the documented intents', () => {
    expect([...GATEWAY_INTENTS].sort()).toEqual(
      [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers].sort()
    )
    expect(PRIVILEGED_INTENTS).toEqual(['Server Members Intent', 'Message Content Intent'])
  })

  it('client.ts uses GATEWAY_INTENTS and nothing else', () => {
    const src = readFileSync('src/discord/client.ts', 'utf8')
    expect(src).toContain('intents: GATEWAY_INTENTS')
    expect(src).not.toMatch(/GuildPresences|GuildWebhooks/)
  })

  it('computes the invite permission integer', () => {
    expect(permissionsInteger()).toBe('939641920')
    expect(BOT_PERMISSIONS.every(p => p.reason.endsWith('.'))).toBe(true)
  })

  it('builds an invite URL with both scopes', () => {
    expect(inviteUrl('123')).toBe('https://discord.com/oauth2/authorize?client_id=123&scope=bot+applications.commands&permissions=939641920')
  })
})
