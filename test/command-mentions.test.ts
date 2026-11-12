import { afterEach, describe, expect, it } from 'vitest'
import { commandMention, rememberCommandIds } from '../src/app/commandMentions'
import { applyMessage, applyReply } from '../src/app/interactions/application'

describe('commandMention', () => {
  afterEach(() => rememberCommandIds([]))

  it('is plain /verify until the commands are published', () => {
    expect(commandMention('verify')).toBe('`/verify`')
    expect(applyMessage(1).embeds[0].description).toContain('Link your Minecraft account first with `/verify`.')
  })

  it('is a clickable mention once Discord gave the command an id', () => {
    rememberCommandIds([{ id: '1234567890', name: 'verify' }])
    expect(commandMention('verify')).toBe('</verify:1234567890>')
    expect(applyMessage(1).embeds[0].description).toContain('</verify:1234567890>')
    expect(applyReply({ kind: 'notLinked' })).toContain('</verify:1234567890>')
    expect(applyReply({ kind: 'notLinked' })).not.toContain('/link')
  })
})
