import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOT_PERMISSIONS, PRIVILEGED_INTENTS, permissionsInteger } from '../src/discord/permissions'

const readme = readFileSync('README.md', 'utf8')

const BUTTON =
  /\[!\[Deploy on Railway\]\(https:\/\/railway\.com\/button\.svg\)\]\(https:\/\/railway\.com\/deploy\/hypixel-chat-bridge\?referralCode=AZj5w0&utm_medium=integration&utm_source=docs&utm_campaign=hypixel-chat-bridge\)/

const embedded = [...readme.matchAll(/!\[[^\]]*\]\((docs\/images\/[^)\s]+)\)/g)].map(m => m[1])

describe('README', () => {
  it('has the Deploy on Railway button', () => {
    expect(readme).toMatch(BUTTON)
  })

  it('keeps the single ban warning', () => {
    expect(readme).toMatch(/banned/i)
    expect(readme.match(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gm)).toEqual(['> [!WARNING]'])
  })

  it('states the exact intents and permissions', () => {
    for (const i of ['Guilds', 'GuildMessages', 'MessageContent', 'GuildMembers', ...PRIVILEGED_INTENTS]) expect(readme).toContain(i)
    for (const p of BOT_PERMISSIONS) expect(readme).toContain(p.label)
    expect(readme).toContain(`permissions=${permissionsInteger()}`)
  })

  it('names the three required variables', () => {
    for (const v of ['DISCORD_TOKEN', 'OWNER_ID', 'GUILD_CHANNEL_ID']) expect(readme).toContain(v)
  })

  it('embeds only committed, size-checked images', () => {
    for (const img of embedded) {
      expect(existsSync(img), img).toBe(true)
      expect(statSync(img).size, img).toBeLessThan(img.endsWith('.gif') ? 3 * 1024 * 1024 : 400 * 1024)
    }
  })

  it('links every doc page', () => {
    for (const page of [
      'configuration',
      'commands',
      'multi-guild',
      'storage',
      'free-database',
      'railway',
      'rest-api',
      'guildlb',
      'safety-filter',
      'faq',
      'troubleshooting'
    ])
      expect(readme).toContain(`(docs/${page}.md)`)
  })

  it('labels the cost table as an estimate and links the free-database guide', () => {
    expect(readme).toMatch(/\| Estimate \/ month/)
    expect(readme).toContain('(docs/free-database.md)')
  })

  it('escapes every dollar sign outside code (GitHub renders $…$ as math)', () => {
    const prose = readme.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
    expect(prose.match(/(?<!\\)\$/g)).toBeNull()
  })

  it('does not mention /info, /guildlb or !guildlb', () => {
    expect(readme).not.toMatch(/(^|[\s`(])\/(info|guildlb)\b|!guildlb/m)
  })
})
