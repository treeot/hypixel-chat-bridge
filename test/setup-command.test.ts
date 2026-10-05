import axios from 'axios'
import { ApplicationCommandOptionType, MessageFlags, type AttachmentBuilder } from 'discord.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { slashCommands } from '../src/app/commands'
import type { AppContext } from '../src/app/context'
import { BUNDLE_FORMAT, MAX_BUNDLE_BYTES } from '../src/settings/bundle'
import { SettingsStore } from '../src/settings/store'
import { fetchAttachmentText, runSetupCommand, setupCommand } from '../src/setup/command'
import { PendingImports } from '../src/setup/importFlow'
import { silentLogger } from './helpers/log'
import { G1 } from './helpers/setupState'

vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>()
  return { ...actual, default: { ...actual.default, get: vi.fn() } }
})

function fakeCtx() {
  const docs = new Map<string, Record<string, unknown>>()
  return {
    env: { ownerId: '100000000000000042', accounts: [{ index: 1, guildChannelId: G1 }], hypixelApiKey: 'k' },
    log: silentLogger(),
    settings: new SettingsStore({ get: async t => docs.get(t) ?? null, set: async (t, v) => void docs.set(t, v) }),
    accounts: { list: () => [], get: () => undefined },
    discord: { client: { channels: { fetch: async () => null } } }
  } as unknown as AppContext
}

function fakeInteraction(subcommand: string, file?: { size: number; url: string }) {
  return {
    options: { getSubcommand: () => subcommand, getAttachment: () => file },
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
    followUp: vi.fn(async () => undefined)
  }
}

type Fake = ReturnType<typeof fakeInteraction>
const call = (i: Fake, extra: Parameters<typeof runSetupCommand>[2] = {}) =>
  runSetupCommand(i as unknown as Parameters<typeof runSetupCommand>[0], fakeCtx(), extra)
const firstEdit = (i: Fake) => (i.editReply.mock.calls[0] as unknown[])[0] as Record<string, unknown>

describe('/setup command definition', () => {
  it('is owner-only, not auto-deferred, with four subcommands', () => {
    expect(setupCommand).toMatchObject({ name: 'setup', permission: 'owner', deferred: false })
    expect(setupCommand.options?.map(o => o.name)).toEqual(['panel', 'show', 'export', 'import'])
    const imp = setupCommand.options?.find(o => o.name === 'import') as { options: { type: number; required: boolean }[] }
    expect(imp.options[0]).toMatchObject({ type: ApplicationCommandOptionType.Attachment, required: true })
  })

  it('is registered exactly once', () => {
    expect(slashCommands.filter(c => c.name === 'setup')).toHaveLength(1)
  })
})

describe('runSetupCommand', () => {
  it('panel replies ephemerally with the home panel', async () => {
    const i = fakeInteraction('panel')
    await call(i)
    expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(firstEdit(i)).toMatchObject({ embeds: [{ title: '⚙️ Bridge setup' }], allowedMentions: { parse: [] } })
  })

  it('show replies with the summary', async () => {
    const i = fakeInteraction('show')
    await call(i)
    expect(firstEdit(i)).toMatchObject({ embeds: [{ title: 'Bridge settings' }] })
  })

  it('export attaches a dated settings bundle', async () => {
    const i = fakeInteraction('export')
    await call(i, { now: () => new Date('2026-10-04T10:00:00Z') })
    const file = (firstEdit(i).files as AttachmentBuilder[])[0]
    expect(file.name).toBe('bridge-settings-2026-10-04.json')
    expect(JSON.parse((file.attachment as Buffer).toString('utf8'))).toMatchObject({ format: BUNDLE_FORMAT, version: 1 })
  })

  it('import rejects oversized and invalid files', async () => {
    const big = fakeInteraction('import', { size: 300_000, url: 'https://cdn.example/x.json' })
    await call(big)
    expect(firstEdit(big).content).toContain('at most 256 KB')

    const bad = fakeInteraction('import', { size: 10, url: 'https://cdn.example/x.json' })
    await call(bad, { fetchText: async () => '{oops' })
    expect(firstEdit(bad).content).toContain('Nothing was imported')
    expect(firstEdit(bad).content).toContain('not valid JSON')
  })

  it('import of a valid file shows a preview and parks it for confirmation', async () => {
    const imports = new PendingImports()
    const text = JSON.stringify({ format: BUNDLE_FORMAT, version: 1, settings: { relay: { guild: true, officer: false } } })
    const i = fakeInteraction('import', { size: text.length, url: 'https://cdn.example/x.json' })
    await call(i, { fetchText: async () => text, imports })
    const preview = firstEdit(i) as { components: { components: { custom_id: string }[] }[] }
    const confirm = preview.components[0].components[0].custom_id
    expect(confirm).toMatch(/^setup:import:-:confirm:[0-9a-f]{12}$/)
    expect(imports.take(confirm.split(':')[4])).toEqual({
      settings: { relay: { guild: true, officer: false } },
      overrides: { joinRequests: {}, gexp: {} },
      notes: []
    })
  })
})

describe('fetchAttachmentText', () => {
  afterEach(() => vi.mocked(axios.get).mockReset())

  it('downloads as text with the size limit and returns the body', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: '{"a":1}' })
    await expect(fetchAttachmentText('https://cdn.example/x.json')).resolves.toBe('{"a":1}')
    expect(axios.get).toHaveBeenCalledWith('https://cdn.example/x.json', expect.objectContaining({ responseType: 'text', maxContentLength: MAX_BUNDLE_BYTES }))
  })

  it('refuses a download over MAX_BUNDLE_BYTES (axios limit hit, or an oversized body)', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error(`maxContentLength size of ${MAX_BUNDLE_BYTES} exceeded`))
    await expect(fetchAttachmentText('https://cdn.example/x.json')).rejects.toThrow('at most 256 KB')
    vi.mocked(axios.get).mockResolvedValue({ data: 'é'.repeat(MAX_BUNDLE_BYTES / 2 + 1) })
    await expect(fetchAttachmentText('https://cdn.example/x.json')).rejects.toThrow('at most 256 KB')
  })

  it('reports an HTTP failure', async () => {
    vi.mocked(axios.get).mockRejectedValue(Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }))
    await expect(fetchAttachmentText('https://cdn.example/x.json')).rejects.toThrow('HTTP 404')
  })
})
