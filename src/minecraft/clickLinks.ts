/** A prismarine-chat `ChatMessage`, as far as link extraction needs it: its raw component tree. */
export interface ChatComponent {
  readonly json?: unknown
}

/** Classic (`{ action, value }`) and 1.21.5+ (`{ action, url }`) click-event shapes. */
function openUrl(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') return undefined
  const click = event as { action?: unknown; value?: unknown; url?: unknown }
  if (click.action !== 'open_url') return undefined
  const url = typeof click.value === 'string' ? click.value : typeof click.url === 'string' ? click.url : undefined
  return url || undefined
}

/** Every `open_url` link in a raw chat-component tree, in order, deduped. */
export function extractLinks(node: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const obj = n as Record<string, unknown>
    for (const link of [openUrl(obj.clickEvent), openUrl(obj.click_event)]) if (link) out.push(link)
    for (const key of ['extra', 'with'] as const) {
      const children = obj[key]
      if (Array.isArray(children)) for (const child of children) walk(child)
    }
  }
  walk(node)
  return [...new Set(out)]
}

/** The `open_url` links carried by a chat message's components. */
export function linksFrom(msg: ChatComponent): string[] {
  return extractLinks(msg.json)
}
