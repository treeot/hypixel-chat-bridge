'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { sendChat } from '@/app/(app)/chat/actions'
import { useToast } from '@/components/toast'
import { appendLine, lineId, nextBackoff, toLine, type ChatLine } from '@/lib/chat-lines'

type Filter = 'all' | 'guild' | 'officer'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'guild', label: 'Guild' },
  { id: 'officer', label: 'Officer' }
]

export function ChatFeed({ accountId, label, initialOnline }: { accountId: number; label: string; initialOnline: boolean }) {
  const [lines, setLines] = useState<ChatLine[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [online, setOnline] = useState(initialOnline)
  const [reconnecting, setReconnecting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const formRef = useRef<HTMLFormElement>(null)
  const push = useToast()

  useEffect(() => {
    let source: EventSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let backoff: number | undefined
    let disposed = false
    let localId = 0

    const handle = (kind: string) => (event: Event) => {
      const message = event as MessageEvent<string>
      let data: Record<string, unknown>
      try {
        data = JSON.parse(message.data) as Record<string, unknown>
      } catch {
        return
      }
      backoff = undefined
      setReconnecting(false)
      const line = toLine(
        lineId(message.lastEventId, () => --localId),
        kind,
        data
      )
      if (!line) return
      if (kind === 'status') setOnline(Boolean(data.online))
      setLines(current => appendLine(current, line))
    }

    const connect = () => {
      const es = new EventSource(`/api/events?accountId=${accountId}`)
      source = es
      es.addEventListener('open', () => {
        backoff = undefined
        setReconnecting(false)
      })
      for (const kind of ['chat', 'event', 'status']) es.addEventListener(kind, handle(kind))
      es.addEventListener('error', () => {
        setReconnecting(true)
        // CLOSED means the browser gave up (e.g. the relay answered 502 during a bridge
        // outage); CONNECTING is the browser's own retry, which we leave alone.
        if (es.readyState !== EventSource.CLOSED || disposed) return
        es.close()
        backoff = nextBackoff(backoff)
        timer = setTimeout(connect, backoff)
      })
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(timer)
      source?.close()
    }
  }, [accountId])

  useEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines, filter])

  const visible = lines.filter(l => filter === 'all' || l.kind === 'status' || l.chat === filter)

  async function action(formData: FormData) {
    const res = await sendChat(formData)
    if (res.ok) formRef.current?.reset()
    else push(res.error, 'error')
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div role="tablist" className="flex items-center gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === filter}
              onClick={() => setFilter(f.id)}
              className={`nav-link${f.id === filter ? ' nav-link-active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
          <span className={`dot ${online ? 'dot-up' : 'dot-down'}`} />
          {label} {online ? 'online' : 'offline'}
          {reconnecting ? <span> · Reconnecting…</span> : null}
        </span>
      </div>
      <div
        ref={scroller}
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="h-[60vh] overflow-y-auto px-4 py-3 font-mono text-[13px]"
      >
        {visible.length === 0 ? (
          <p className="panel-empty">No messages yet</p>
        ) : (
          visible.map(l => (
            <div key={l.id} className={l.kind === 'chat' ? '' : 'text-muted-foreground'}>
              <span className="text-muted-foreground">{new Date(l.at).toLocaleTimeString()} </span>
              {l.chat ? <span className="text-muted-foreground">[{l.chat === 'officer' ? 'O' : 'G'}] </span> : null}
              {l.kind === 'chat' ? (
                <>
                  {l.rank ? <span>{l.rank} </span> : null}
                  <strong>{l.username ?? 'unknown'}</strong>: {l.text}
                </>
              ) : (
                l.text
              )}
            </div>
          ))
        )}
      </div>
      <form ref={formRef} action={action} className="flex items-center gap-2 border-t border-border p-3">
        <input type="hidden" name="accountId" value={accountId} />
        <select name="chat" defaultValue="guild" aria-label="Chat" className="input w-28" disabled={!online}>
          <option value="guild">Guild</option>
          <option value="officer">Officer</option>
        </select>
        <input
          name="message"
          required
          maxLength={256}
          autoComplete="off"
          aria-label="Message"
          placeholder={online ? 'Send a message' : 'Account is offline'}
          title={online ? undefined : 'The account is offline, so it cannot send chat'}
          disabled={!online}
          className="input flex-1"
        />
        <SendButton disabled={!online} />
      </form>
    </div>
  )
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn" disabled={disabled || pending} title={disabled ? 'The account is offline, so it cannot send chat' : undefined}>
      {pending ? 'sending…' : 'Send'}
    </button>
  )
}
