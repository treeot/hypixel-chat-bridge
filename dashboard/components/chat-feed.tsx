'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { sendChat } from '@/app/(app)/chat/actions'
import { EmptyState } from '@/components/empty-state'
import { IconChat, IconSend } from '@/components/icons'
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
    <div className="panel flex h-[calc(100dvh-15rem)] min-h-[420px] flex-col lg:h-[calc(100dvh-14rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        <div role="tablist" aria-label="Filter chat" className="segmented">
          {FILTERS.map(f => (
            <button key={f.id} type="button" role="tab" aria-selected={f.id === filter} onClick={() => setFilter(f.id)} className="segment">
              {f.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className={`dot ${online ? 'dot-up' : 'dot-down'}`} />
          <span>
            <span className="font-medium text-foreground">{label}</span> {online ? 'online' : 'offline'}
          </span>
          {reconnecting ? <span className="badge badge-warning">Reconnecting…</span> : null}
        </span>
      </div>
      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 overflow-y-auto py-2"
      >
        {visible.length === 0 ? (
          <EmptyState centered icon={<IconChat />} title="No messages yet. New guild and officer chat appears here live." />
        ) : (
          visible.map(l =>
            l.kind === 'chat' ? (
              <div key={l.id} className="group flex items-baseline gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-surface-2/50 sm:px-4">
                <time dateTime={new Date(l.at).toISOString()} className="w-[4.5rem] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>
                <p className="min-w-0 flex-1 break-words leading-6">
                  {l.chat === 'officer' ? <span className="badge badge-warning mr-2 align-[1px]">Officer</span> : null}
                  {l.rank ? <span className="mr-1 text-muted-foreground">{l.rank}</span> : null}
                  <span className="font-medium text-foreground">{l.username ?? 'unknown'}</span>
                  <span className="text-muted-foreground">: </span>
                  <span>{l.text}</span>
                </p>
              </div>
            ) : (
              <div key={l.id} className="flex items-baseline gap-3 px-3 py-1.5 text-[13px] text-muted-foreground sm:px-4">
                <time dateTime={new Date(l.at).toISOString()} className="w-[4.5rem] shrink-0 font-mono text-[11px] tabular-nums">
                  {new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>
                <p className="min-w-0 flex-1 italic">{l.text}</p>
              </div>
            )
          )
        )}
      </div>
      <form ref={formRef} action={action} className="flex items-center gap-2 border-t border-border bg-surface-2/30 p-3">
        <input type="hidden" name="accountId" value={accountId} />
        <select name="chat" defaultValue="guild" aria-label="Chat" className="input w-[6.5rem] shrink-0 sm:w-28" disabled={!online}>
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
          className="input min-w-0 flex-1"
        />
        <SendButton disabled={!online} />
      </form>
    </div>
  )
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className="btn-primary px-3 sm:px-3.5"
      disabled={disabled || pending}
      title={disabled ? 'The account is offline, so it cannot send chat' : undefined}
    >
      <span className="hidden sm:inline">{pending ? 'Sending…' : 'Send'}</span>
      <IconSend className="sm:hidden" />
      <span className="sr-only sm:hidden">Send</span>
    </button>
  )
}
