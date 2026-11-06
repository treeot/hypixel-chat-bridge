'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { FieldErrors, FieldLabel, SchemaField } from '@/components/schema-form'
import { useConfirm } from '@/components/confirm-dialog'
import { IconChevronRight, IconPlus } from '@/components/icons'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { newAccountItem } from '@/lib/form-options'
import type { FieldNode } from '@/lib/schema-form'
import type { DiscordDirectory } from '@/lib/types'
import { accountTitle, stripLockedRows, type AccountRow } from '@/lib/settings-editors'

type AccountsValue = { nextId?: number; list?: AccountRow[] } | undefined

const HOST_NOTE = "Set by whoever hosts the bot. Change it in the bot's config."
const FIELDS = ['label', 'guildChannelId', 'officerChannelId', 'relayGroup'] as const

/** "#guild-chat" for a channel id the bot's server has; the id itself when the directory doesn't list it. */
function channelLabel(discord: DiscordDirectory | null, id: string | null | undefined): string | null {
  if (!id) return null
  const channel = discord?.channels.find(c => c.id === id)
  return channel ? `#${channel.name}` : id
}

function rowNode(node: FieldNode): Extract<FieldNode, { kind: 'object' }> | null {
  if (node.kind !== 'object') return null
  const list = node.fields.list
  return list?.kind === 'array' && list.item.kind === 'object' ? list.item : null
}

/**
 * Accounts: every account the bot knows, including ones set in the bot's own config (shown with the
 * fields that config sets locked). Settings rows for config accounts are overlays; editing a config
 * account that has none adds one.
 */
export function AccountsEditor({
  node,
  value,
  onChange,
  issues,
  readOnly,
  accounts,
  accountsUnavailable,
  discord,
  footerSlot
}: AreaEditorProps<AccountsValue>) {
  const headingId = useId()
  const [confirm, dialog] = useConfirm()
  const item = rowNode(node)
  const list = value?.list ?? []
  const ids = [...new Set([...list.map(r => r.id), ...accounts.map(a => a.id)])].sort((a, b) => a - b)
  const reserved = accounts.map(a => a.id).filter(id => !list.some(r => r.id === id))

  const names = ids.map(id => {
    const row = list.find(r => r.id === id)
    const info = accounts.find(a => a.id === id)
    return { id, label: row?.label || info?.label || '' }
  })

  const update = (id: number, patch: Partial<AccountRow>) => {
    const exists = list.some(r => r.id === id)
    const info = accounts.find(a => a.id === id)
    const next = exists
      ? list.map(r => (r.id === id ? { ...r, ...patch } : r))
      : [...list, { id, enabled: info?.enabled ?? true, ...patch }].sort((a, b) => a.id - b.id)
    onChange({ ...(value ?? {}), list: stripLockedRows(next, accounts) })
  }
  const remove = async (id: number, name: string) => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      consequence: 'The bot will log out of this Minecraft account and stop relaying its chat. Its ranks and per-account settings are kept.',
      confirmLabel: 'Remove',
      tone: 'danger'
    })
    if (ok) onChange({ ...(value ?? {}), list: list.filter(r => r.id !== id) })
  }
  const added = newAccountItem(value ?? { nextId: 2, list: [] }, reserved)

  // Combine two guilds: point both at one channel + one relay group, so their chats share a Discord channel and relay in-game.
  const guildChannelOf = (id: number) => list.find(r => r.id === id)?.guildChannelId ?? accounts.find(a => a.id === id)?.guildChannelId
  const relayGroupOf = (id: number) => list.find(r => r.id === id)?.relayGroup ?? accounts.find(a => a.id === id)?.relayGroup
  // Only accounts the UI can edit (config/env accounts are changed in the host's config).
  const combinable = ids.filter(id => accounts.find(a => a.id === id)?.source !== 'env')
  const [combineA, setCombineA] = useState<number | ''>('')
  const [combineB, setCombineB] = useState<number | ''>('')
  const applyPatches = (patches: Map<number, Partial<AccountRow>>) => {
    let next = [...list]
    for (const [id, patch] of patches) {
      const idx = next.findIndex(r => r.id === id)
      if (idx >= 0) next[idx] = { ...next[idx], ...patch }
      else next = [...next, { id, enabled: accounts.find(a => a.id === id)?.enabled ?? true, ...patch }]
    }
    next.sort((a, b) => a.id - b.id)
    onChange({ ...(value ?? {}), list: stripLockedRows(next, accounts) })
  }
  const combineGuilds = () => {
    if (combineA === '' || combineB === '' || combineA === combineB) return
    const channel = guildChannelOf(combineA)
    if (!channel) return
    const group = (relayGroupOf(combineA) || relayGroupOf(combineB) || 'combined').toLowerCase()
    applyPatches(
      new Map([
        [combineA, { relayGroup: group }],
        [combineB, { guildChannelId: channel, relayGroup: group }]
      ])
    )
    setOpen(prev => new Set(prev).add(combineA as number).add(combineB as number))
  }

  // With one account its fields are shown; with more, each starts folded to a one-line summary.
  const [open, setOpen] = useState<Set<number>>(() => new Set(ids.length === 1 ? ids : []))
  const toggle = (id: number) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // A link like /settings/accounts#account-2 (from Overview) opens that account and scrolls to it.
  useEffect(() => {
    const openFromHash = () => {
      const match = /^#account-(\d+)$/.exec(window.location.hash)
      if (!match) return
      const id = Number(match[1])
      setOpen(prev => new Set(prev).add(id))
      requestAnimationFrame(() => document.getElementById(`account-${id}`)?.scrollIntoView({ block: 'start' }))
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [])

  return (
    <>
      {dialog}
      {accountsUnavailable && (
        <p className="flash flash-info !mt-0 mx-4 my-3 sm:mx-5">
          The bot&apos;s account list can&apos;t be loaded right now, so accounts set in its config and who&apos;s online aren&apos;t shown. Adding and removing
          accounts is off until it loads; try again in a minute.
        </p>
      )}
      {ids.length === 0 && !accountsUnavailable && (
        <p className="px-5 py-4 text-sm text-muted-foreground">No accounts yet. Add one to connect a Minecraft account.</p>
      )}
      {!readOnly && !accountsUnavailable && combinable.length >= 2 && (
        <div className="setting-row-stacked">
          <div>
            <p className="setting-label">Combine two guilds</p>
            <p className="setting-help">
              Point both at one Discord channel and one relay group, so their chats share a channel and relay to each other in-game. Set the{' '}
              <code>{'{guild}'}</code> tag under Formats so each line shows its guild.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-[13px]">
            <select
              className="input w-auto"
              aria-label="First guild"
              value={combineA}
              onChange={e => setCombineA(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Guild…</option>
              {combinable.map(id => (
                <option key={id} value={id}>
                  {accountTitle({ id, label: names.find(n => n.id === id)?.label }, names)}
                </option>
              ))}
            </select>
            <span className="pb-2 text-muted-foreground">+</span>
            <select
              className="input w-auto"
              aria-label="Second guild"
              value={combineB}
              onChange={e => setCombineB(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Guild…</option>
              {combinable
                .filter(id => id !== combineA)
                .map(id => (
                  <option key={id} value={id}>
                    {accountTitle({ id, label: names.find(n => n.id === id)?.label }, names)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={combineA === '' || combineB === '' || combineA === combineB || !guildChannelOf(combineA)}
              title={combineA !== '' && !guildChannelOf(combineA) ? 'The first guild needs a guild chat channel first.' : undefined}
              onClick={combineGuilds}
            >
              Combine
            </button>
          </div>
        </div>
      )}
      {ids.map(id => {
        const index = list.findIndex(r => r.id === id)
        const row = index >= 0 ? list[index] : undefined
        const info = accounts.find(a => a.id === id)
        const env = info?.source === 'env'
        const locks: string[] = env ? info.locked : []
        const path = `list.${index >= 0 ? index : list.length}`
        const title = accountTitle({ id, label: names.find(n => n.id === id)?.label }, names)
        const name = title.replace(/ \(#\d+\)$/, '')
        const enabled = row?.enabled ?? info?.enabled ?? true
        // An account with a save error stays open so the error is visible.
        const hasIssue = Object.keys(issues).some(k => k === path || k.startsWith(`${path}.`))
        const expanded = open.has(id) || hasIssue
        const bodyId = `${headingId}-${id}-body`
        const channel = channelLabel(discord, row?.guildChannelId ?? info?.guildChannelId)
        return (
          <section key={id} id={`account-${id}`} className="setting-row-stacked scroll-mt-20" aria-labelledby={`${headingId}-${id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="group -m-1 flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => toggle(id)}
              >
                <IconChevronRight
                  size={16}
                  aria-hidden="true"
                  className={`shrink-0 text-muted-foreground transition-transform group-hover:text-foreground ${expanded ? 'rotate-90' : ''}`}
                />
                <h3 id={`${headingId}-${id}`} className="setting-label">
                  {title}
                </h3>
                {env && <span className="badge">From the bot&apos;s config</span>}
                {info && <span className={info.online ? 'badge badge-success' : 'badge'}>{info.online ? 'Online' : 'Offline'}</span>}
                {!enabled && <span className="badge">Off</span>}
                {!expanded && channel && <span className="hidden truncate text-[13px] text-muted-foreground sm:inline">{channel}</span>}
              </button>
              {!readOnly && !accountsUnavailable && !env && row && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => void remove(id, name)}>
                  Remove
                </button>
              )}
            </div>
            <fieldset id={bodyId} className={`grid gap-5 pl-6 ${expanded ? '' : '!hidden'}`}>
              {item?.fields.enabled && (
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel path={`${path}.enabled`} small />
                  <SchemaField
                    path={`${path}.enabled`}
                    node={item.fields.enabled}
                    value={enabled}
                    onChange={next => update(id, { enabled: next as boolean })}
                    issues={issues}
                    readOnly={readOnly}
                  />
                </div>
              )}
              {FIELDS.map(key => {
                const field = item?.fields[key]
                if (!field) return null
                const locked = locks.includes(key)
                const shown =
                  key === 'label'
                    ? info?.label
                    : key === 'relayGroup'
                      ? info?.relayGroup
                      : key === 'guildChannelId' || key === 'officerChannelId'
                        ? channelLabel(discord, info?.[key])
                        : null
                return (
                  <div key={key} className="grid gap-2">
                    <FieldLabel path={`${path}.${key}`} small />
                    {locked ? (
                      <div>
                        {shown && <p className="text-sm">{shown}</p>}
                        <p className="setting-help">{HOST_NOTE}</p>
                      </div>
                    ) : (
                      <SchemaField
                        path={`${path}.${key}`}
                        node={field}
                        value={row?.[key]}
                        onChange={next => update(id, { [key]: key === 'relayGroup' && typeof next === 'string' ? next.toLowerCase() : next })}
                        issues={issues}
                        readOnly={readOnly}
                      />
                    )}
                  </div>
                )
              })}
              {!info && !accountsUnavailable && !readOnly && (
                <p className="flash flash-info !mt-0">
                  After you save, the bot sends the owner a Discord DM with a Microsoft sign-in code. Sign in with the Minecraft account that&apos;s in this
                  guild.
                </p>
              )}
              <FieldErrors path={path} issues={issues} />
            </fieldset>
          </section>
        )
      })}
      {issues.list && (
        <div className="setting-row-stacked">
          <FieldErrors path="list" issues={issues} />
        </div>
      )}
      {footerSlot &&
        !accountsUnavailable &&
        createPortal(
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!added}
            title={added ? undefined : 'The bot supports up to 10 accounts.'}
            onClick={() => {
              if (!added) return
              setOpen(prev => new Set(prev).add(added.item.id))
              onChange({ ...(added.value as object), list: [...list, added.item] })
            }}
          >
            <IconPlus size={14} />
            Add account
          </button>,
          footerSlot
        )}
    </>
  )
}
