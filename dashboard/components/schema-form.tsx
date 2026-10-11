'use client'

import { useState } from 'react'
import type { z } from 'zod'
import { SETTINGS, type AreaId } from '@bridge/settings/registry'
import { Switch } from '@/components/switch'
import { useToast } from '@/components/toast'
import { cleanValue, issuesByPath, triFromValue, triToValue, type FieldNode } from '@/lib/schema-form'

type Result = { ok: true; notices?: string[] } | { ok: false; error: string; issues?: string[] }

const humanize = (key: string) => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
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

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key))

function Errors({ path, issues }: { path: string; issues: Record<string, string[]> }) {
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

function Field({
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
  switch (node.kind) {
    case 'boolean':
      if (node.optional)
        return (
          <div>
            <select className="input" name={path} value={triFromValue(value)} disabled={readOnly} onChange={e => onChange(triToValue(e.target.value))}>
              <option value="">Inherit</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
            <Errors path={path} issues={issues} />
          </div>
        )
      return (
        <div>
          <Switch name={path} label={humanize(path.split('.').pop() ?? path)} checked={value === true} disabled={readOnly} onChange={onChange} />
          <Errors path={path} issues={issues} />
        </div>
      )
    case 'string':
      return (
        <div>
          <input
            className="input"
            name={path}
            value={typeof value === 'string' ? value : ''}
            maxLength={node.maxLength}
            pattern={node.pattern}
            disabled={readOnly}
            onChange={e => onChange(e.target.value)}
          />
          <Errors path={path} issues={issues} />
        </div>
      )
    case 'number':
      return (
        <div>
          <input
            className="input"
            type="number"
            name={path}
            value={typeof value === 'number' ? value : ''}
            step={node.int ? 1 : 'any'}
            min={node.min}
            max={node.max}
            disabled={readOnly}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <Errors path={path} issues={issues} />
        </div>
      )
    case 'enum':
      return (
        <div>
          <select className="input" name={path} value={typeof value === 'string' ? value : ''} disabled={readOnly} onChange={e => onChange(e.target.value)}>
            {node.optional && <option value="">(unset)</option>}
            {node.options.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <Errors path={path} issues={issues} />
        </div>
      )
    case 'object': {
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
      return (
        <fieldset className="grid gap-4 rounded-md border border-border p-4">
          {Object.entries(node.fields).map(([key, child]) => (
            <div key={key} className="grid gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{humanize(key)}</span>
              <Field
                path={join(path, key)}
                node={child}
                value={obj[key]}
                onChange={next => onChange({ ...obj, [key]: next })}
                issues={issues}
                readOnly={readOnly}
              />
            </div>
          ))}
          <Errors path={path} issues={issues} />
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
                <Field
                  path={join(path, i)}
                  node={node.item}
                  value={item}
                  onChange={next => onChange(list.map((x, j) => (j === i ? next : x)))}
                  issues={issues}
                  readOnly={readOnly}
                />
              </div>
              {!readOnly && (
                <button type="button" className="btn-ghost" onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {!readOnly && (node.max === undefined || list.length < node.max) && (
            <div>
              <button type="button" className="btn-ghost" onClick={() => onChange([...list, defaultFor(node.item)])}>
                Add
              </button>
            </div>
          )}
          <Errors path={path} issues={issues} />
        </div>
      )
    }
    case 'record':
      return <RecordField path={path} node={node} value={value} onChange={onChange} issues={issues} readOnly={readOnly} />
    case 'json':
      return <JsonField path={path} value={value} onChange={onChange} issues={issues} readOnly={readOnly} />
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
  const rec = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const entries = Object.entries(rec)
  const rename = (from: string, to: string) => onChange(Object.fromEntries(entries.map(([k, v]) => [k === from ? to : k, v])))
  return (
    <div className="grid gap-2">
      {entries.map(([key, v], i) => (
        <div key={i} className="flex items-start gap-2">
          <input className="input !w-40 shrink-0" aria-label="Key" value={key} disabled={readOnly} onChange={e => rename(key, e.target.value)} />
          <div className="min-w-0 flex-1">
            <Field
              path={join(path, key)}
              node={node.value}
              value={v}
              onChange={next => onChange({ ...rec, [key]: next })}
              issues={issues}
              readOnly={readOnly}
            />
          </div>
          {!readOnly && (
            <button type="button" className="btn-ghost" onClick={() => onChange(Object.fromEntries(entries.filter(([k]) => k !== key)))}>
              Remove
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              let n = entries.length + 1
              while (`key${n}` in rec) n++
              onChange({ ...rec, [`key${n}`]: defaultFor(node.value) })
            }}
          >
            Add
          </button>
        </div>
      )}
      <Errors path={path} issues={issues} />
    </div>
  )
}

function JsonField({
  path,
  value,
  onChange,
  issues,
  readOnly
}: {
  path: string
  value: unknown
  onChange: (next: unknown) => void
  issues: Record<string, string[]>
  readOnly: boolean
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <textarea
        className="input font-mono"
        name={path}
        value={text}
        disabled={readOnly}
        onChange={e => {
          setText(e.target.value)
          try {
            onChange(JSON.parse(e.target.value))
            setError(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON')
          }
        }}
      />
      {error && <p className="field-error">{error}</p>}
      <Errors path={path} issues={issues} />
    </div>
  )
}

export function SchemaForm({
  area,
  node,
  initial,
  issues: initialIssues = [],
  readOnly = false,
  partial = false,
  onSubmit
}: {
  area: AreaId
  node: FieldNode
  initial: unknown
  issues?: readonly string[]
  readOnly?: boolean
  /** Validate against the partial schema (per-account overrides). */
  partial?: boolean
  onSubmit: (value: unknown) => Promise<Result>
}) {
  const [value, setValue] = useState<unknown>(initial)
  const [issues, setIssues] = useState<Record<string, string[]>>(() => issuesByPath(initialIssues))
  const [busy, setBusy] = useState(false)
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
  const loose = Object.entries(issues).filter(([p]) => p === '' || !rendered.has(p))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (readOnly) return
    const cleaned = cleanValue(node, value)
    let schema = SETTINGS[area].schema as unknown as z.ZodType
    if (partial && 'partial' in schema) schema = (schema as unknown as { partial: () => z.ZodType }).partial()
    const parsed = schema.safeParse(cleaned)
    if (!parsed.success) {
      setIssues(issuesByPath(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)))
      return
    }
    setBusy(true)
    try {
      const res = await onSubmit(cleaned)
      if (res.ok) {
        setIssues({})
        push('Saved')
        for (const n of res.notices ?? []) push(n)
      } else {
        setIssues(issuesByPath(res.issues?.length ? res.issues : [res.error]))
        push(res.error, 'error')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {loose.map(([p, messages]) =>
        messages.map((m, i) => (
          <p key={`${p}-${i}`} className="flash flash-error">
            {p ? `${p}: ` : ''}
            {m}
          </p>
        ))
      )}
      <Field path="" node={node} value={value} onChange={setValue} issues={issues} readOnly={readOnly} />
      {!readOnly && (
        <div>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'saving…' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}
