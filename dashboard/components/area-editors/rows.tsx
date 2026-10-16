'use client'

import { SchemaField, SettingRow } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import type { FieldNode } from '@/lib/schema-form'

export type Obj = Record<string, unknown>
export const asObj = (value: unknown): Obj => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {})

/** `obj` with `key` set, or removed when `next` is undefined. */
export function withKey<T extends Obj>(obj: T, key: string, next: unknown): T {
  const out: Obj = { ...obj }
  if (next === undefined) delete out[key]
  else out[key] = next
  return out as T
}

/** The node of one top-level field of an object area. */
export const fieldNode = (node: FieldNode, key: string): FieldNode | undefined => (node.kind === 'object' ? node.fields[key] : undefined)

/** A short explanation at the top of a settings card. */
export function AreaNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="text-[13px] leading-5 text-muted-foreground">{children}</p>
    </div>
  )
}

type RowProps = Pick<AreaEditorProps, 'node' | 'value' | 'onChange' | 'issues' | 'readOnly'>

/** Shown under a field's label when it needs a key the bot lacks; the row is greyed and read-only. */
export const NEEDS_KEY_TAG = <span className="badge badge-warning mt-1.5 w-fit">Needs a Hypixel API key</span>

/** One top-level field rendered the generic way: a labelled card row with its control. `locked` greys it with NEEDS_KEY_TAG. */
export function GenericRow({ field, node, value, onChange, issues, readOnly, locked = false }: RowProps & { field: string; locked?: boolean }) {
  const child = fieldNode(node, field)
  if (!child) return null
  const obj = asObj(value)
  return (
    <SettingRow path={field} node={child} {...(locked ? { note: NEEDS_KEY_TAG, dimmed: true } : {})}>
      <SchemaField
        path={field}
        node={child}
        value={obj[field]}
        onChange={next => onChange({ ...obj, [field]: next })}
        issues={issues}
        readOnly={readOnly || locked}
      />
    </SettingRow>
  )
}

/** Every top-level field of the area, the generic way, after `note`. For areas that only need an explanation on top. */
export function NotedRows(props: RowProps & { note: React.ReactNode }) {
  const { note, ...rest } = props
  const keys = props.node.kind === 'object' ? Object.keys(props.node.fields) : []
  return (
    <>
      <AreaNote>{note}</AreaNote>
      {keys.map(key => (
        <GenericRow key={key} field={key} {...rest} />
      ))}
    </>
  )
}
