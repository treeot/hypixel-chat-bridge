'use client'

import { FieldErrors, FieldLabel } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { fieldCopy } from '@/lib/settings-copy'
import { AreaNote, asObj, GenericRow } from './rows'
import { TagInput } from './tag-input'

const LISTS = ['blockedWords', 'allowedWords'] as const

/** Safety filters: what they do, the filter switches, and the word lists as chips. */
export function FiltersEditor(props: AreaEditorProps) {
  const { value, onChange, issues, readOnly } = props
  const obj = asObj(value)
  return (
    <>
      <AreaNote>Everything the bot says in game passes these filters; a blocked message isn&apos;t sent.</AreaNote>
      <GenericRow field="categories" {...props} />
      {LISTS.map(key => (
        <div key={key} className="setting-row-stacked">
          <FieldLabel path={key} />
          <TagInput
            name={key}
            label={fieldCopy('filters', key)?.label ?? key}
            words={Array.isArray(obj[key]) ? (obj[key] as unknown[]).filter((w): w is string => typeof w === 'string') : []}
            readOnly={readOnly}
            issues={issues}
            onChange={words => onChange({ ...obj, [key]: words })}
          />
          <FieldErrors path={key} issues={issues} />
        </div>
      ))}
    </>
  )
}
