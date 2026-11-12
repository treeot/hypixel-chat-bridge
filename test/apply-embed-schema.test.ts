import { describe, expect, it } from 'vitest'
import { applyEmbedSchema, EMBED_LIMITS } from '../src/settings/applyEmbed'

describe('applyEmbedSchema', () => {
  it('accepts a full embed', () => {
    expect(
      applyEmbedSchema.safeParse({
        authorName: 'Main',
        authorIconUrl: 'https://example.com/a.png',
        title: 'Alt',
        url: 'https://example.com',
        description: 'Requirements',
        color: 0xffffff,
        fields: [{ name: 'Member', value: '280', inline: true }],
        imageUrl: 'https://example.com/i.png',
        thumbnailUrl: 'https://example.com/t.png',
        footerText: 'Footer',
        footerIconUrl: 'https://example.com/f.png',
        showHowTo: false
      }).success
    ).toBe(true)
  })

  it('rejects non-https links, blank text, too many fields and oversized embeds', () => {
    expect(applyEmbedSchema.safeParse({ imageUrl: 'http://example.com/i.png' }).success).toBe(false)
    expect(applyEmbedSchema.safeParse({ title: '   ' }).success).toBe(false)
    expect(applyEmbedSchema.safeParse({ color: 0x1000000 }).success).toBe(false)
    const field = { name: 'n', value: 'v' }
    expect(applyEmbedSchema.safeParse({ fields: Array(EMBED_LIMITS.fields + 1).fill(field) }).success).toBe(false)
    const big = { name: 'n'.repeat(256), value: 'v'.repeat(1024) }
    expect(applyEmbedSchema.safeParse({ fields: Array(5).fill(big) }).success).toBe(false)
  })
})
