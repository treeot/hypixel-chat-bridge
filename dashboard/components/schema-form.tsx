'use client'

import { createContext, useContext, useRef, useState, type ComponentType } from 'react'
import type { z } from 'zod'
import { SETTINGS, type AreaId } from '@bridge/settings/registry'
import { IconPlus } from '@/components/icons'
import { Switch } from '@/components/switch'
import { useToast } from '@/components/toast'
import { fieldCopy } from '@/lib/settings-copy'
import { fieldMessage, issueLine } from '@/lib/validation'
import { noticeCopy } from '@/lib/bridge-errors'
import { HostDetail } from '@/components/error-copy'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { firstFreeChannel, PICKER_HINT, pickerKind, pickerOptions, recordKeyKind, type PickerKind } from '@/lib/discord-picker'
import { appendAt, matchesAny, type FormOptions } from '@/lib/form-options'
import { cleanValue, issuesByPath, triFromValue, triToValue, type FieldNode } from '@/lib/schema-form'
import type { AccountInfo, DiscordDirectory } from '@/lib/types'

type Result = { ok: true; notices?: string[] } | { ok: false; error: string; hostDetail?: string; issues?: string[] }

/** Last-resort label for a path with no copy entry; test/settings-copy.test.ts keeps every real field covered. */
const humanize = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** A required boolean renders as a switch, which sits at the end of its label's row. */
const isInlineSwitch = (node: FieldNode) => node.kind === 'boolean' && !node.optional
const isScalar = (node: FieldNode) => node.kind === 'string' || node.kind === 'number' || node.kind === 'enum' || node.kind === 'boolean'

const lastSegment = (path: string) => path.split('.').pop() ?? path

/** A field's label and one-line help, from the copy map keyed by area and path. */
export function FieldLabel({ path, small = false }: { path: string; small?: boolean }) {
  const { area } = useContext(FormContext)
  const copy = fieldCopy(area, path)
  return (
    <div className="min-w-0">
      <p className={small ? 'text-[13px] font-medium' : 'setting-label'}>{copy?.label ?? humanize(lastSegment(path))}</p>
      {copy?.help && <p className="setting-help">{copy.help}</p>}
    </div>
  )
}

/** One top-level field as a card row: label and help on the left, the control on the right or below. `path` picks the copy. */
/** `note` (e.g. a "Needs a Hypixel API key" tag) shows under the label; `dimmed` greys the whole row. */
export function SettingRow({
  path,
  node,
  children,
  note,
  dimmed = false
}: {
  path: string
  node: FieldNode
  children: React.ReactNode
  note?: React.ReactNode
  dimmed?: boolean
}) {
  const label = note ? (
    <div className="min-w-0">
      <FieldLabel path={path} />
      {note}
    </div>
  ) : (
    <FieldLabel path={path} />
  )
  const dim = dimmed ? ' opacity-55' : ''
  if (isInlineSwitch(node))
    return (
      <div className={`setting-row-inline${dim}`}>
        {label}
        {children}
      </div>
    )
  if (isScalar(node))
    return (
      <div className={`setting-row${dim}`}>
        {label}
        <div className="min-w-0 md:max-w-sm">{children}</div>
      </div>
    )
  return (
    <div className={`setting-row-stacked${dim}`}>
      {label}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function withMissingSwitches(node: FieldNode, value: unknown): unknown {
  if (node.kind !== 'object' || (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value)))) return value
  const obj = { ...((value ?? {}) as Record<string, unknown>) }
  for (const [key, field] of Object.entries(node.fields)) if (field.kind === 'boolean' && !field.optional && obj[key] === undefined) obj[key] = false
  return obj
}

function defaultFor(node: FieldNode): unknown {
  switch (node.kind) {
    case 'boolean':
      return false
    case 'number':
      return 0
    case 'enum':
      return node.optional ? '' : (node.options[0] ?? '')
    case 'object':
      return Object.fromEntries(Object.entries(node.fields).flatMap(([k, f]) => (f.optional ? [] : [[k, defaultFor(f)]])))
    case 'array':
      return []
    case 'record':
      return {}
    case 'json':
      return null
    default:
      return ''
  }
}

type FormCtx = { area: AreaId; options: FormOptions; add: (arrayPath: string) => void; discord: DiscordDirectory | null }
const FormContext = createContext<FormCtx>({ area: 'relay', options: {}, add: () => {}, discord: null })

/** A channel or role select fed by the bridge's Discord directory; a text input with a how-to hint when the directory is unavailable. */
export function DiscordPicker({
  kind,
  name,
  value,
  optional,
  disabled,
  taken,
  className = '',
  label,
  onChange
}: {
  kind: PickerKind
  name?: string
  value: string
  optional: boolean
  disabled: boolean
  taken?: readonly string[]
  className?: string
  label?: string
  onChange: (next: string) => void
}) {
  const { discord } = useContext(FormContext)
  if (!discord)
    return (
      <>
        <input
          className={`input ${className}`}
          name={name}
          aria-label={label}
          value={value}
          inputMode="numeric"
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
        />
        <p className="setting-help mt-1.5">{PICKER_HINT[kind]}</p>
      </>
    )
  return (
    <select className={`input ${className}`} name={name} aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {pickerOptions(kind, discord, value, optional, taken).map(group => {
        const options = group.options.map(o => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))
        return group.label === null ? (
          options
        ) : (
          <optgroup key={group.label} label={group.label}>
            {options}
          </optgroup>
        )
      })}
    </select>
  )
}

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key))

/** The (already friendly) messages for one path, under its control. */
export function FieldErrors({ path, issues }: { path: string; issues: Record<string, string[]> }) {
  return (
    <>
      {(issues[path] ?? []).map((m, i) => (
        <p key={i} className="field-error">
          {m}
        </p>
      ))}
    </>
  )
}

/** An input with the copy's unit after it, when it has one. */
function WithUnit({ unit, children }: { unit?: string; children: React.ReactNode }) {
  if (!unit) return <>{children}</>
  return (
    <div className="flex items-center gap-2">
      {children}
      <span className="shrink-0 text-[13px] text-muted-foreground">{unit}</span>
    </div>
  )
}

/**
 * The generic control for one field (and everything under it), labelled from the copy map.
 * Custom area editors can render it for the parts they don't replace; it must sit inside SchemaForm.
 */
export function SchemaField({
  path,
  node,
  value,
  onChange,
  issues,
  readOnly
}: {
  path: string
  node: FieldNode
  value: unknown
  onChange: (next: unknown) => void
  issues: Record<string, string[]>
  readOnly: boolean
}) {
  const { area, options, add } = useContext(FormContext)
  const copy = fieldCopy(area, path)
  const label = copy?.label ?? humanize(lastSegment(path))
  const invalid = (issues[path]?.length ?? 0) > 0
  if (matchesAny(options.readOnly, path) && node.kind !== 'object' && node.kind !== 'array')
    return <p className="text-sm">{options.format ? options.format(path, value) : String(value ?? '')}</p>
  switch (node.kind) {
    case 'boolean':
      if (node.optional)
        return (
          <div>
            <select
              className="input"
              name={path}
              aria-label={label}
              value={triFromValue(value)}
              disabled={readOnly}
              onChange={e => onChange(triToValue(e.target.value))}
            >
              <option value="">Inherit</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
            <FieldErrors path={path} issues={issues} />
          </div>
        )
      return (
        <div className="flex shrink-0 flex-col items-end">
          <Switch name={path} label={label} checked={value === true} disabled={readOnly} onChange={onChange} />
          <FieldErrors path={path} issues={issues} />
        </div>
      )
    case 'string': {
      const kind = pickerKind(path)
      if (kind)
        return (
          <div>
            <DiscordPicker
              kind={kind}
              name={path}
              label={label}
              value={typeof value === 'string' ? value : ''}
              optional={node.optional}
              disabled={readOnly}
              onChange={onChange}
            />
            <FieldErrors path={path} issues={issues} />
          </div>
        )
      return (
        <div>
          <WithUnit unit={copy?.unit}>
            <input
              className="input"
              name={path}
              aria-label={label}
              aria-invalid={invalid || undefined}
              value={typeof value === 'string' ? value : ''}
              placeholder={copy?.placeholder}
              maxLength={node.maxLength}
              pattern={node.pattern}
              disabled={readOnly}
              onChange={e => onChange(e.target.value)}
            />
          </WithUnit>
          <FieldErrors path={path} issues={issues} />
        </div>
      )
    }
    case 'number':
      return (
        <div>
          <WithUnit unit={copy?.unit}>
            <input
              className="input"
              type="number"
              name={path}
              aria-label={label}
              aria-invalid={invalid || undefined}
              value={typeof value === 'number' ? value : ''}
              placeholder={copy?.placeholder}
              step={node.int ? 1 : 'any'}
              min={node.min}
              max={node.max}
              disabled={readOnly}
              onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </WithUnit>
          <FieldErrors path={path} issues={issues} />
        </div>
      )
    case 'enum':
      return (
        <div>
          <select
            className="input"
            name={path}
            aria-label={label}
            aria-invalid={invalid || undefined}
            value={typeof value === 'string' ? value : ''}
            disabled={readOnly}
            onChange={e => onChange(e.target.value)}
          >
            {node.optional && <option value="">Default</option>}
            {node.options.map(o => (
              <option key={o} value={o}>
                {copy?.options?.[o] ?? humanize(o)}
              </option>
            ))}
          </select>
          <FieldErrors path={path} issues={issues} />
        </div>
      )
    case 'object': {
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      return (
        <fieldset className="setting-group">
          {Object.entries(node.fields).map(([key, child]) => {
            if (matchesAny(options.hidden, join(path, key))) return null
            const field = (
              <SchemaField
                path={join(path, key)}
                node={child}
                value={obj[key]}
                onChange={next => onChange({ ...obj, [key]: next })}
                issues={issues}
                readOnly={readOnly}
              />
            )
            return isInlineSwitch(child) ? (
              <div key={key} className="flex items-center justify-between gap-4">
                <FieldLabel path={join(path, key)} small />
                {field}
              </div>
            ) : (
              <div key={key} className="grid gap-2">
                <FieldLabel path={join(path, key)} small />
                {field}
              </div>
            )
          })}
          <FieldErrors path={path} issues={issues} />
        </fieldset>
      )
    }
    case 'array': {
      const list = Array.isArray(value) ? value : []
      return (
        <div className="grid gap-2">
          {list.map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {options.itemTitle?.(path, item) && <p className="mb-2 text-sm font-semibold">{options.itemTitle(path, item)}</p>}
                <SchemaField
                  path={join(path, i)}
                  node={node.item}
                  value={item}
                  onChange={next => onChange(list.map((x, j) => (j === i ? next : x)))}
                  issues={issues}
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && (
                <button type="button" className="btn-ghost btn-sm mt-0.5" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {!readOnly && (node.max === undefined || list.length < node.max) && (
            <div>
              <button type="button" className="btn-secondary btn-sm" onClick={() => (options.newItem ? add(path) : onChange([...list, defaultFor(node.item)]))}>
                <IconPlus size={14} />
                Add
              </button>
            </div>
          )}
          <FieldErrors path={path} issues={issues} />
        </div>
      )
    }
    case 'record':
      return <RecordField path={path} node={node} value={value} onChange={onChange} issues={issues} readOnly={readOnly} />
    case 'json':
      return <JsonField path={path} issues={issues} />
  }
}

function RecordField({
  path,
  node,
  value,
  onChange,
  issues,
  readOnly
}: {
  path: string
  node: Extract<FieldNode, { kind: 'record' }>
  value: unknown
  onChange: (next: unknown) => void
  issues: Record<string, string[]>
  readOnly: boolean
}) {
  const { discord } = useContext(FormContext)
  const rec = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const entries = Object.entries(rec)
  const keys = entries.map(([k]) => k)
  const rename = (from: string, to: string) => onChange(Object.fromEntries(entries.map(([k, v]) => [k === from ? to : k, v])))
  const keyKind = recordKeyKind(path)
  const newKey = () => {
    const free = keyKind === 'channel' && discord ? firstFreeChannel(discord, keys) : null
    if (free) return free
    let n = entries.length + 1
    while (`key${n}` in rec) n++
    return `key${n}`
  }
  return (
    <div className="grid gap-2">
      {entries.map(([key, v], i) => (
        <div key={i} className="flex items-start gap-2">
          {keyKind ? (
            <div className="w-48 shrink-0">
              <DiscordPicker kind={keyKind} label="Channel" value={key} optional={false} disabled={readOnly} taken={keys} onChange={to => rename(key, to)} />
            </div>
          ) : (
            <input
              className="input !w-40 shrink-0 font-mono text-[13px]"
              aria-label="Key"
              value={key}
              disabled={readOnly}
              onChange={e => rename(key, e.target.value)}
            />
          )}
          <div className="min-w-0 flex-1">
            <SchemaField
              path={join(path, key)}
              node={node.value}
              value={v}
              onChange={next => onChange({ ...rec, [key]: next })}
              issues={issues}
              readOnly={readOnly}
            />
          </div>
          {!readOnly && (
            <button type="button" className="btn-ghost btn-sm mt-0.5" onClick={() => onChange(Object.fromEntries(entries.filter(([k]) => k !== key)))}>
              Remove
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => onChange({ ...rec, [newKey()]: defaultFor(node.value) })}>
            <IconPlus size={14} />
            Add
          </button>
        </div>
      )}
      <FieldErrors path={path} issues={issues} />
    </div>
  )
}

/** A setting the dashboard has no control for: never a raw JSON box. Its value is left as it is on save. */
function JsonField({ path, issues }: { path: string; issues: Record<string, string[]> }) {
  return (
    <div>
      <p className="text-[13px] text-muted-foreground">This setting can be changed with /setup in Discord.</p>
      <FieldErrors path={path} issues={issues} />
    </div>
  )
}

/** Groups "path: message" issue strings by path, with every message made friendly. */
function friendlyIssues(area: AreaId, raw: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(issuesByPath(raw)).map(([path, messages]) => [path, messages.map(m => fieldMessage(area, path, m))]))
}

/**
 * The settings card for one area: fields, validation, and the save bar. With `editor`, that
 * component (see lib/area-editors.tsx) replaces the generic field list; everything else stays.
 */
export function SchemaForm({
  area,
  node,
  initial,
  issues: initialIssues = [],
  readOnly = false,
  partial = false,
  options = {},
  discord = null,
  editor: Editor,
  accounts = [],
  accountsUnavailable = false,
  missingKey = null,
  accountId,
  onSubmit
}: {
  area: AreaId
  node: FieldNode
  initial: unknown
  issues?: readonly string[]
  readOnly?: boolean
  /** Validate against the partial schema (per-account overrides). */
  partial?: boolean
  options?: FormOptions
  /** The bridge's Discord channels and roles; null falls back to typed ids. */
  discord?: DiscordDirectory | null
  /** A custom body for this area (from AREA_EDITORS); the generic fields render without one. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- editors narrow the value to their area's type
  editor?: ComponentType<AreaEditorProps<any>>
  /** Every account, handed to a custom editor. */
  accounts?: AccountInfo[]
  /** The account list couldn't be read, handed to a custom editor. */
  accountsUnavailable?: boolean
  /** A key this area needs that the bot lacks, handed to a custom editor. */
  missingKey?: string | null
  /** The account whose override is edited, handed to a custom editor. */
  accountId?: number
  onSubmit: (value: unknown) => Promise<Result>
}) {
  // A required on/off switch missing from the stored value shows as off, so it's saved as off rather than failing as empty.
  const start = partial ? initial : withMissingSwitches(node, initial)
  const [value, setValue] = useState<unknown>(start)
  const [issues, setIssues] = useState<Record<string, string[]>>(() => friendlyIssues(area, initialIssues))
  // Technical detail of the last failed save, folded under the banner for whoever hosts the bot.
  const [hostDetail, setHostDetail] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  // What the server last accepted, so the footer can say whether anything is pending.
  const [baseline, setBaseline] = useState<unknown>(start)
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline)
  const push = useToast()

  // Top-level shown errors: root issues plus any path no rendered field claims.
  const rendered = new Set<string>()
  const collect = (n: FieldNode, path: string, v: unknown) => {
    rendered.add(path)
    if (n.kind === 'object') for (const [k, c] of Object.entries(n.fields)) collect(c, join(path, k), (v as Record<string, unknown> | undefined)?.[k])
    else if (n.kind === 'array' && Array.isArray(v)) v.forEach((x, i) => collect(n.item, join(path, i), x))
    else if (n.kind === 'record' && v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(n.value, join(path, k), x)
  }
  collect(node, '', value)
  rendered.delete('')
  // With a custom editor every issue is listed here too, so none can go unseen.
  const loose = Object.entries(issues).filter(([p]) => Editor || p === '' || !rendered.has(p))

  const add = (arrayPath: string) => {
    const made = options.newItem?.(arrayPath, value)
    if (made) setValue(appendAt(made.value, arrayPath, made.item))
  }

  // Bring the first problem into view after a failed save: the summary banner, or the first flagged field.
  const showIssues = (next: Record<string, string[]>, detail?: string) => {
    setIssues(next)
    setHostDetail(detail)
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[data-issues], [aria-invalid="true"], .field-error')
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (target?.matches('input, select, textarea')) target.focus({ preventScroll: true })
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (readOnly) return
    const cleaned = cleanValue(node, value)
    let schema = SETTINGS[area].schema as unknown as z.ZodType
    if (partial && 'partial' in schema) schema = (schema as unknown as { partial: () => z.ZodType }).partial()
    const parsed = schema.safeParse(cleaned)
    if (!parsed.success) {
      showIssues(
        friendlyIssues(
          area,
          parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        )
      )
      return
    }
    setBusy(true)
    try {
      const res = await onSubmit(cleaned)
      if (res.ok) {
        setIssues({})
        setHostDetail(undefined)
        setBaseline(value)
        push('Saved')
        for (const n of res.notices ?? []) push(noticeCopy(n).message)
      } else {
        // The bridge's own issues are "path: message"; a plain error is shown whole, never split at a colon.
        showIssues(res.issues?.length ? friendlyIssues(area, res.issues) : { '': [res.error] }, res.hostDetail)
        push(res.error, 'error')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null)
  const fields = Editor ? (
    <Editor
      footerSlot={readOnly ? null : footerSlot}
      area={area}
      node={node}
      value={value}
      onChange={setValue}
      issues={issues}
      readOnly={readOnly}
      partial={partial}
      accountId={accountId}
      discord={discord}
      accounts={accounts}
      accountsUnavailable={accountsUnavailable}
      missingKey={missingKey}
    />
  ) : node.kind === 'object' ? (
    Object.entries(node.fields).map(([key, child]) => {
      if (matchesAny(options.hidden, key)) return null
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      return (
        <SettingRow key={key} path={key} node={child}>
          <SchemaField path={key} node={child} value={obj[key]} onChange={next => setValue({ ...obj, [key]: next })} issues={issues} readOnly={readOnly} />
        </SettingRow>
      )
    })
  ) : (
    <div className="setting-row-stacked">
      <SchemaField path="" node={node} value={value} onChange={setValue} issues={issues} readOnly={readOnly} />
    </div>
  )

  return (
    <FormContext.Provider value={{ area, options, add, discord }}>
      <form ref={formRef} onSubmit={submit} className="card">
        {loose.length > 0 && (
          <div className="grid gap-2 border-b border-border p-4 sm:px-5" data-issues role="alert">
            {loose.map(([p, messages]) =>
              messages.map((m, i) => (
                <p key={`${p}-${i}`} className="flash flash-error !mt-0">
                  {issueLine(area, p, m, { value, itemTitle: options.itemTitle })}
                </p>
              ))
            )}
            <HostDetail detail={hostDetail} />
          </div>
        )}
        <div className="row-list">
          {!Editor && node.kind === 'object' && Object.keys(node.fields).length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Nothing to set here.</p>
          ) : (
            fields
          )}
        </div>
        {!readOnly && (
          <div className="setting-footer">
            <div className="group/footer flex min-w-0 items-center gap-3">
              {/* Editors can portal a button here (e.g. Add account), next to the save status. */}
              <div ref={setFooterSlot} className="contents" />
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground max-sm:group-has-[button]/footer:sr-only" aria-live="polite">
                {dirty ? (
                  <>
                    <span className="dot" style={{ background: 'hsl(var(--accent))' }} />
                    You have pending changes
                  </>
                ) : (
                  'No pending changes'
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    setValue(baseline)
                    setIssues({})
                    setHostDetail(undefined)
                  }}
                >
                  Discard
                </button>
              )}
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </form>
    </FormContext.Provider>
  )
}
