'use client'

import { useId, useState } from 'react'
import { FieldErrors, FieldLabel, SchemaField } from '@/components/schema-form'
import { IconChevronRight, IconPlus } from '@/components/icons'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import type { FieldNode } from '@/lib/schema-form'
import { fieldCopy } from '@/lib/settings-copy'
import { SettingsActionButton } from '@/components/settings-action-button'
import { normalizeHex } from '@/lib/accent-colour'
import { accountName } from '@/lib/labels'
import { colourToHex, hexToColour, rankAccountIds, rankSection } from '@/lib/settings-editors'

// `color` holds the typed text while it isn't a colour yet, so validation blocks Save until it's fixed.
type Rank = { name?: string; ingameTag?: string; tag?: string; color?: number | string }
type RanksValue = { accounts?: Record<string, Rank[]> } | undefined

const MAX_RANKS = 25
const TEXT_FIELDS = ['name', 'ingameTag', 'tag'] as const

/** The schema node for one rank, dug out of the area's node (accounts → record → array → object). */
function rankNode(node: FieldNode): Extract<FieldNode, { kind: 'object' }> | null {
  if (node.kind !== 'object') return null
  const accounts = node.fields.accounts
  if (accounts?.kind !== 'record' || accounts.value.kind !== 'array' || accounts.value.item.kind !== 'object') return null
  return accounts.value.item
}

/** A colour swatch picker plus a hex box; stores the integer, blank → no colour. */
function ColourField({
  path,
  value,
  readOnly,
  issues,
  onChange
}: {
  path: string
  value: unknown
  readOnly: boolean
  issues: Record<string, string[]>
  onChange: (next: number | string | undefined) => void
}) {
  // Half-typed text is stored as is (see Rank), so it survives a re-render and fails validation.
  const hex = typeof value === 'string' ? value : colourToHex(value)
  const [text, setText] = useState(hex)
  const [synced, setSynced] = useState(hex)
  if (hex !== synced) {
    // Follow outside changes (Discard, the swatch) without clobbering a half-typed value.
    setSynced(hex)
    setText(hex)
  }
  const label = fieldCopy('ranks', path)?.label ?? 'Chat colour'
  const parsed = hexToColour(text)
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed"
          aria-label={`${label} picker`}
          value={normalizeHex(hex) ?? '#ffffff'}
          disabled={readOnly}
          onChange={e => onChange(hexToColour(e.target.value) ?? undefined)}
        />
        <input
          className="input font-mono"
          aria-label={label}
          aria-invalid={parsed === null || undefined}
          placeholder="#55ffff"
          maxLength={7}
          value={text}
          disabled={readOnly}
          onChange={e => {
            setText(e.target.value)
            const next = hexToColour(e.target.value)
            onChange(next === null ? e.target.value : next)
          }}
        />
      </div>
      {parsed === null ? <p className="field-error">Enter a colour like #55ffff, or leave it blank.</p> : <FieldErrors path={path} issues={issues} />}
    </div>
  )
}

/** Ranks: one section per account, with its ranks as small cards. No typed account keys. */
export function RanksEditor({ node, value, onChange, issues, readOnly, accounts, accountsUnavailable }: AreaEditorProps<RanksValue>) {
  const headingId = useId()
  const item = rankNode(node)
  const stored = value?.accounts ?? {}
  const ids = rankAccountIds(accounts, stored)
  // With one account its ranks are shown; with more, each starts folded to its title and rank count.
  const [open, setOpen] = useState<Set<string>>(() => new Set(ids.length === 1 ? ids : []))
  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const setList = (id: string, list: Rank[] | undefined) => {
    const next = { ...stored }
    if (list === undefined) delete next[id]
    else next[id] = list
    onChange({ ...(value ?? {}), accounts: next })
  }

  const unavailableNote = accountsUnavailable && (
    <p className="flash flash-info !mt-0 mx-4 my-3 sm:mx-5">
      The account list can&apos;t be loaded right now, so accounts are shown by number and ranks can&apos;t be imported. Try again in a minute.
    </p>
  )
  if (ids.length === 0)
    return unavailableNote || <p className="px-5 py-4 text-sm text-muted-foreground">No accounts yet. Add one under Settings → Accounts first.</p>

  return (
    <>
      {unavailableNote}
      {ids.map(id => {
        const { title, account, removable } = rankSection(id, accounts, accountsUnavailable)
        const name = account ? accountName(account, accounts) : title
        const list = Array.isArray(stored[id]) ? stored[id] : []
        const base = `accounts.${id}`
        // An account with a save error stays open so the error is visible.
        const expanded = open.has(id) || Object.keys(issues).some(k => k === base || k.startsWith(`${base}.`))
        const bodyId = `${headingId}-${id}-body`
        return (
          <section key={id} className="setting-row-stacked" aria-labelledby={`${headingId}-${id}`}>
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
                {!expanded && (
                  <span className="text-[13px] text-muted-foreground">
                    {list.length === 0 ? 'No ranks yet' : list.length === 1 ? '1 rank' : `${list.length} ranks`}
                  </span>
                )}
              </button>
              {!readOnly && removable && id in stored && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setList(id, undefined)}>
                  Remove account&apos;s ranks
                </button>
              )}
              {!readOnly && account && (
                <SettingsActionButton
                  action="refreshRanks"
                  accountId={account.id}
                  className="btn-secondary btn-sm"
                  label={`Import ranks from game for ${name}`}
                >
                  Import ranks from game
                </SettingsActionButton>
              )}
            </div>
            <div id={bodyId} className={`grid gap-4 pl-6 ${expanded ? '' : '!hidden'}`}>
              {list.length === 0 && (
                <p className="text-[13px] text-muted-foreground">
                  {account && !readOnly
                    ? `No ranks yet. Click Import ranks from game in this section and the bot copies ${name}'s guild ranks from the game.`
                    : 'No ranks yet.'}
                </p>
              )}
              {list.map((rank, i) => {
                const path = `${base}.${i}`
                const set = (key: keyof Rank, next: unknown) =>
                  setList(
                    id,
                    list.map((r, j) => (j === i ? { ...r, [key]: next } : r))
                  )
                return (
                  <fieldset key={i} className="setting-item" aria-label={rank.name ? `Rank ${rank.name}` : `Rank ${i + 1}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-medium text-muted-foreground">{rank.name?.trim() || `Rank ${i + 1}`}</p>
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm -mr-2"
                          onClick={() =>
                            setList(
                              id,
                              list.filter((_, j) => j !== i)
                            )
                          }
                        >
                          Remove rank
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {TEXT_FIELDS.map(key => (
                        <div key={key} className="grid content-start gap-2">
                          <FieldLabel path={`${path}.${key}`} small />
                          {item?.fields[key] ? (
                            <SchemaField
                              path={`${path}.${key}`}
                              node={item.fields[key]}
                              value={rank[key]}
                              onChange={next => set(key, next)}
                              issues={issues}
                              readOnly={readOnly}
                            />
                          ) : null}
                        </div>
                      ))}
                      <div className="grid content-start gap-2">
                        <FieldLabel path={`${path}.color`} small />
                        <ColourField path={`${path}.color`} value={rank.color} readOnly={readOnly} issues={issues} onChange={next => set('color', next)} />
                      </div>
                    </div>
                    <FieldErrors path={path} issues={issues} />
                  </fieldset>
                )
              })}
              <FieldErrors path={base} issues={issues} />
              {!readOnly && list.length < MAX_RANKS && (
                <div>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setOpen(prev => new Set(prev).add(id))
                      setList(id, [...list, { name: '', tag: '' }])
                    }}
                  >
                    <IconPlus size={14} />
                    Add rank
                  </button>
                </div>
              )}
            </div>
          </section>
        )
      })}
    </>
  )
}
