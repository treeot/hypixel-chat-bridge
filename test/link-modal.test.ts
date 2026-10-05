import { describe, expect, it, vi } from 'vitest'
import type { ButtonInteraction } from 'discord.js'
import type { AppContext } from '../src/app/context'
import { handleLinkButton } from '../src/app/interactions/link'
import { silentLogger } from './helpers/log'

vi.mock('../src/app/features/verify', () => ({
  verifyAndLink: async () => {
    throw new Error('Hypixel down')
  },
  applyVerifiedMember: async () => undefined
}))

describe('handleLinkButton', () => {
  it('answers generically instead of leaving the user on "thinking…" when the lookup throws', async () => {
    const submitted = {
      customId: 'link-account-modal',
      user: { id: 'd1' },
      fields: { getTextInputValue: () => 'Steve' },
      deferReply: vi.fn(async () => undefined),
      editReply: vi.fn(async () => undefined)
    }
    const interaction = {
      user: { id: 'd1' },
      showModal: vi.fn(async () => undefined),
      awaitModalSubmit: vi.fn(async () => submitted)
    }
    const ctx = { log: silentLogger() } as unknown as AppContext
    await handleLinkButton(interaction as unknown as ButtonInteraction, ctx)
    expect(submitted.deferReply).toHaveBeenCalledWith({ ephemeral: true })
    expect(submitted.editReply).toHaveBeenCalledWith({ content: 'Something went wrong. Please try again later.' })
    expect(ctx.log.error).toHaveBeenCalled()
  })
})
