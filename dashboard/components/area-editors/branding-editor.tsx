'use client'

import { IconBridge } from '@/components/icons'
import { FieldErrors, SettingRow } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { normalizeHex } from '@/lib/accent-colour'
import { fieldCopy } from '@/lib/settings-copy'
import { asObj, fieldNode, GenericRow, withKey } from './rows'

const DEFAULT_ACCENT = '#8b5cf6'

/** Branding: the text fields, an accent colour picker with a hex box, and a small preview of the top bar. */
export function BrandingEditor(props: AreaEditorProps) {
  const { node, value, onChange, issues, readOnly } = props
  const obj = asObj(value)
  const accentNode = fieldNode(node, 'accent')
  const accentText = typeof obj.accent === 'string' ? obj.accent : ''
  const accent = normalizeHex(accentText) ?? DEFAULT_ACCENT
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Bridge'
  const tagline = typeof obj.tagline === 'string' ? obj.tagline : ''
  const logo = typeof obj.logoUrl === 'string' && obj.logoUrl.startsWith('https://') ? obj.logoUrl : undefined
  const setAccent = (text: string) => onChange(withKey(obj, 'accent', text === '' ? undefined : text))
  const accentLabel = fieldCopy('branding', 'accent')?.label ?? 'Accent colour'
  return (
    <>
      <GenericRow field="name" {...props} />
      <GenericRow field="tagline" {...props} />
      <GenericRow field="logoUrl" {...props} />
      {accentNode && (
        <SettingRow path="accent" node={accentNode}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1 disabled:cursor-not-allowed"
              aria-label={`${accentLabel} picker`}
              value={accent}
              disabled={readOnly}
              onChange={e => setAccent(e.target.value)}
            />
            <input
              className="input font-mono"
              name="accent"
              aria-label={accentLabel}
              aria-invalid={(issues.accent?.length ?? 0) > 0 || undefined}
              placeholder={fieldCopy('branding', 'accent')?.placeholder}
              maxLength={7}
              value={accentText}
              disabled={readOnly}
              onChange={e => setAccent(e.target.value)}
              onBlur={() => {
                const hex = normalizeHex(accentText)
                if (hex && hex !== accentText) setAccent(hex)
              }}
            />
            {accentText && !readOnly && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAccent('')}>
                Use default
              </button>
            )}
          </div>
          <FieldErrors path="accent" issues={issues} />
        </SettingRow>
      )}
      <GenericRow field="loginText" {...props} />
      <div className="setting-row">
        <div>
          <p className="setting-label">Preview</p>
          <p className="setting-help">Roughly how the top bar looks after you save.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2.5" aria-hidden="true">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- an owner-supplied https link, as in the top bar
            <img src={logo} alt="" width={28} height={28} className="size-7 shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="brand-mark" style={{ background: accent }}>
              <IconBridge size={16} strokeWidth={2.25} />
            </span>
          )}
          <span className="brand min-w-0 truncate">{name}</span>
          {tagline && <span className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:inline">{tagline}</span>}
          <span className="ml-auto inline-flex h-5 w-9 shrink-0 rounded-full p-0.5" style={{ background: accent }}>
            <span className="ml-auto size-4 rounded-full bg-foreground" />
          </span>
        </div>
      </div>
    </>
  )
}
