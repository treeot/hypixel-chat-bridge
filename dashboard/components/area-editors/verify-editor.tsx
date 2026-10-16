'use client'

import { SchemaField, SettingRow } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { fieldCopy } from '@/lib/settings-copy'
import { nicknamePreview } from '@/lib/template-preview'
import { asObj, fieldNode, GenericRow } from './rows'

/** Verify: the role, and the nickname template with a live preview for a player called Steve. */
export function VerifyEditor(props: AreaEditorProps) {
  const { node, value, onChange, issues, readOnly } = props
  const obj = asObj(value)
  const nick = fieldNode(node, 'nicknameTemplate')
  const template = typeof obj.nicknameTemplate === 'string' ? obj.nicknameTemplate : ''
  const preview = template.trim() ? nicknamePreview(template) : null
  return (
    <>
      <GenericRow field="roleId" {...props} />
      {nick && (
        <SettingRow path="nicknameTemplate" node={nick}>
          <SchemaField
            path="nicknameTemplate"
            node={nick}
            value={obj.nicknameTemplate}
            onChange={next => onChange({ ...obj, nicknameTemplate: next })}
            issues={issues}
            readOnly={readOnly}
          />
          <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
            {preview
              ? `Preview: ${preview}`
              : `Leave blank to keep members' nicknames as they are. For example ${fieldCopy('verify', 'nicknameTemplate')?.placeholder ?? '{ign}'} gives ${nicknamePreview(fieldCopy('verify', 'nicknameTemplate')?.placeholder)}.`}
          </p>
        </SettingRow>
      )}
    </>
  )
}
