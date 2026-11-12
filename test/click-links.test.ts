import { describe, expect, it } from 'vitest'
import { extractLinks, linksFrom } from '../src/minecraft/clickLinks'

describe('extractLinks', () => {
  it('reads a /linkaccount-shaped open_url nested in extra', () => {
    const component = {
      text: '',
      extra: [
        {
          text: 'Click here to link your account!',
          clickEvent: { action: 'open_url', value: 'https://hypixel.net/link/abc' }
        }
      ]
    }
    expect(extractLinks(component)).toEqual(['https://hypixel.net/link/abc'])
  })

  it('reads the 1.21.5 click_event { action, url } shape', () => {
    const component = { text: 'x', click_event: { action: 'open_url', url: 'https://hypixel.net/forums' } }
    expect(extractLinks(component)).toEqual(['https://hypixel.net/forums'])
  })

  it('ignores non-open_url actions', () => {
    const component = { extra: [{ text: 'run', clickEvent: { action: 'run_command', value: '/say hi' } }] }
    expect(extractLinks(component)).toEqual([])
  })

  it('returns nothing for plain text', () => {
    expect(extractLinks({ text: 'just chat' })).toEqual([])
    expect(extractLinks('a string')).toEqual([])
    expect(extractLinks(null)).toEqual([])
  })

  it('dedupes repeated links', () => {
    const component = {
      extra: [
        { clickEvent: { action: 'open_url', value: 'https://a.test/x' } },
        { clickEvent: { action: 'open_url', value: 'https://a.test/x' } }
      ]
    }
    expect(extractLinks(component)).toEqual(['https://a.test/x'])
  })

  it('walks translate `with` arguments', () => {
    const component = { translate: 'chat.type.text', with: [{ clickEvent: { action: 'open_url', value: 'https://a.test/w' } }] }
    expect(extractLinks(component)).toEqual(['https://a.test/w'])
  })
})

describe('linksFrom', () => {
  it('reads the component tree off a ChatMessage .json', () => {
    const msg = { json: { extra: [{ clickEvent: { action: 'open_url', value: 'https://a.test/j' } }] } }
    expect(linksFrom(msg)).toEqual(['https://a.test/j'])
  })
})
