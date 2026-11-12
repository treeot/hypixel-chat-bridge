'use client'

import { useRef, useState } from 'react'
import { APPLY_HOW_TO_ROOM, EMBED_LIMITS, embedLength, type ApplyEmbed } from '@bridge/settings/applyEmbed'
import { IconPlus } from '@/components/icons'
import { FieldErrors } from '@/components/schema-form'
import { Switch } from '@/components/switch'
import { colourToHex, hexToColour } from '@/lib/settings-editors'
import { insertToken } from '@/lib/template-preview'
import type { DiscordDirectory } from '@/lib/types'
import { DiscordMessage, type EmbedView } from './discord-embed'
import { Studio, StudioField, StudioSection } from './studio'

type Field = { name: string; value: string; inline?: boolean }
/** Half-typed values (blank field names, a colour being typed) are kept as is so they fail validation visibly. */
type Draft = Partial<Omit<ApplyEmbed, 'fields' | 'color'>> & { fields?: Field[]; color?: number | string }

// The bot appends this under the guild's text; the id only marks it as a command mention in the preview.
const HOW_TO = 'Press **Apply** to check the requirements and get an in-game invite. Link your Minecraft account first with </verify:00000000000000000>.'
const DEFAULT_COLOUR = 0x5865f2
const DESCRIPTION_MAX = EMBED_LIMITS.description - APPLY_HOW_TO_ROOM

const has = (...values: unknown[]) => values.some(v => v !== undefined && v !== '')

/** The embed shown in the preview: what the bot would post, with the same fallbacks. */
export function previewEmbed(draft: Draft, fallbackTitle: string): EmbedView {
  const description = [draft.description?.trim(), draft.showHowTo === false ? undefined : HOW_TO].filter(Boolean).join('\n\n')
  return {
    color: typeof draft.color === 'number' ? draft.color : DEFAULT_COLOUR,
    authorName: draft.authorName,
    authorIconUrl: draft.authorIconUrl,
    title: draft.title?.trim() || fallbackTitle,
    url: draft.url,
    description,
    fields: (draft.fields ?? []).filter(f => f.name.trim() || f.value.trim()),
    imageUrl: draft.imageUrl,
    thumbnailUrl: draft.thumbnailUrl,
    footerText: draft.footerText,
    footerIconUrl: draft.footerIconUrl
  }
}

function TextInput({
  id,
  value,
  max,
  placeholder,
  readOnly,
  onChange
}: {
  id: string
  value: string | undefined
  max: number
  placeholder?: string
  readOnly: boolean
  onChange: (next: string | undefined) => void
}) {
  return (
    <input
      id={id}
      className="input"
      maxLength={max}
      placeholder={placeholder}
      value={value ?? ''}
      disabled={readOnly}
      onChange={e => onChange(e.target.value || undefined)}
    />
  )
}

function ColourInput({
  value,
  readOnly,
  onChange
}: {
  value: number | string | undefined
  readOnly: boolean
  onChange: (next: number | string | undefined) => void
}) {
  const hex = typeof value === 'string' ? value : colourToHex(value)
  const parsed = hexToColour(hex)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed"
          aria-label="Embed colour picker"
          value={typeof parsed === 'number' ? colourToHex(parsed) : colourToHex(DEFAULT_COLOUR)}
          disabled={readOnly}
          onChange={e => onChange(hexToColour(e.target.value) ?? undefined)}
        />
        <input
          id="apply-colour"
          className="input font-mono"
          placeholder={colourToHex(DEFAULT_COLOUR)}
          maxLength={7}
          value={hex}
          disabled={readOnly}
          onChange={e => {
            const next = hexToColour(e.target.value)
            onChange(next === null ? e.target.value : next)
          }}
        />
      </div>
      {parsed === null && <p className="field-error">Enter a colour like #3498db, or leave it blank.</p>}
    </div>
  )
}

/**
 * The Apply message as a Discohook-style builder: every part of the embed plus the button, folded into
 * sections on the left, with a live preview on the right. Saved per guild; Post Apply button sends it.
 */
export function ApplyMessageEditor({
  embed,
  buttonLabel,
  fallbackTitle,
  discord,
  issues,
  readOnly,
  onChange
}: {
  embed: Draft | undefined
  buttonLabel: string | undefined
  /** The heading used when the title is blank. */
  fallbackTitle: string
  discord: DiscordDirectory | null
  issues: Record<string, string[]>
  readOnly: boolean
  onChange: (next: { applyEmbed?: Draft; applyButtonLabel?: string }) => void
}) {
  const draft: Draft = embed ?? {}
  const area = useRef<HTMLTextAreaElement>(null)
  const [openFields, setOpenFields] = useState(false)
  const setEmbed = (patch: Partial<Draft>) => {
    const next: Draft = { ...draft, ...patch }
    for (const key of Object.keys(next) as Array<keyof Draft>) if (next[key] === undefined || next[key] === '') delete next[key]
    if (next.fields && next.fields.length === 0) delete next.fields
    onChange({ applyEmbed: Object.keys(next).length ? next : undefined, applyButtonLabel: buttonLabel })
  }
  const insert = (token: string) => {
    const el = area.current
    const { text, caret } = insertToken(draft.description ?? '', el?.selectionStart ?? null, el?.selectionEnd ?? null, token)
    setEmbed({ description: text })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }
  const fields = draft.fields ?? []
  const setField = (i: number, patch: Partial<Field>) => setEmbed({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const errorsUnder = (prefix: string) => Object.keys(issues).some(k => k === prefix || k.startsWith(`${prefix}.`))
  const used = embedLength({ ...draft, fields })
  const total = EMBED_LIMITS.total - APPLY_HOW_TO_ROOM

  const form = (
    <div className="grid">
      <StudioSection title="Message" summary={buttonLabel ? `Button: ${buttonLabel}` : undefined} defaultOpen>
        <StudioField label="Button label (optional)" htmlFor="apply-button">
          <TextInput
            id="apply-button"
            value={buttonLabel}
            max={EMBED_LIMITS.buttonLabel}
            placeholder="Apply"
            readOnly={readOnly}
            onChange={next => onChange({ applyEmbed: embed, applyButtonLabel: next })}
          />
          <FieldErrors path="applyButtonLabel" issues={issues} />
        </StudioField>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium">Explain the Apply button</p>
            <p className="setting-help !mt-0">Adds “Press Apply… link your account with /verify” under your text.</p>
          </div>
          <Switch
            name="applyEmbed.showHowTo"
            label="Explain the Apply button"
            checked={draft.showHowTo !== false}
            disabled={readOnly}
            onChange={on => setEmbed({ showHowTo: on ? undefined : false })}
          />
        </div>
      </StudioSection>
      <StudioSection title="Author" summary={draft.authorName} forceOpen={errorsUnder('applyEmbed.authorName') || errorsUnder('applyEmbed.authorIconUrl')}>
        <StudioField label="Name" htmlFor="apply-author">
          <TextInput id="apply-author" value={draft.authorName} max={EMBED_LIMITS.author} readOnly={readOnly} onChange={v => setEmbed({ authorName: v })} />
          <FieldErrors path="applyEmbed.authorName" issues={issues} />
        </StudioField>
        <StudioField label="Icon link" help="An https:// image link, e.g. your guild logo." htmlFor="apply-author-icon">
          <TextInput
            id="apply-author-icon"
            value={draft.authorIconUrl}
            max={EMBED_LIMITS.url}
            placeholder="https://…"
            readOnly={readOnly}
            onChange={v => setEmbed({ authorIconUrl: v })}
          />
          <FieldErrors path="applyEmbed.authorIconUrl" issues={issues} />
        </StudioField>
        <StudioField label="Name link" htmlFor="apply-author-url">
          <TextInput
            id="apply-author-url"
            value={draft.authorUrl}
            max={EMBED_LIMITS.url}
            placeholder="https://…"
            readOnly={readOnly}
            onChange={v => setEmbed({ authorUrl: v })}
          />
          <FieldErrors path="applyEmbed.authorUrl" issues={issues} />
        </StudioField>
      </StudioSection>
      <StudioSection
        title="Body"
        summary={draft.title ?? fallbackTitle}
        defaultOpen
        forceOpen={['title', 'url', 'description', 'color'].some(k => errorsUnder(`applyEmbed.${k}`))}
      >
        <StudioField label="Title" htmlFor="apply-title">
          <TextInput
            id="apply-title"
            value={draft.title}
            max={EMBED_LIMITS.title}
            placeholder={fallbackTitle}
            readOnly={readOnly}
            onChange={v => setEmbed({ title: v })}
          />
          <FieldErrors path="applyEmbed.title" issues={issues} />
        </StudioField>
        <StudioField label="Title link" htmlFor="apply-url">
          <TextInput id="apply-url" value={draft.url} max={EMBED_LIMITS.url} placeholder="https://…" readOnly={readOnly} onChange={v => setEmbed({ url: v })} />
          <FieldErrors path="applyEmbed.url" issues={issues} />
        </StudioField>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[13px] font-medium" htmlFor="apply-description">
              Description
            </label>
            {discord && !readOnly && (
              <div className="flex flex-wrap gap-2">
                <select
                  className="input input-sm w-auto"
                  aria-label="Insert a channel"
                  value=""
                  onChange={e => e.target.value && insert(`<#${e.target.value}>`)}
                >
                  <option value="">Insert channel…</option>
                  {discord.channels.map(c => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
                <select className="input input-sm w-auto" aria-label="Insert a role" value="" onChange={e => e.target.value && insert(`<@&${e.target.value}>`)}>
                  <option value="">Insert role…</option>
                  {discord.roles.map(r => (
                    <option key={r.id} value={r.id}>
                      @{r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="setting-help !mt-0">Discord formatting works: **bold**, *italic*, # headings, - lists, &gt; quotes. Mentions show but never ping.</p>
          <textarea
            id="apply-description"
            ref={area}
            className="input min-h-40 font-mono text-[13px]"
            maxLength={DESCRIPTION_MAX}
            placeholder={'# Our requirements\nSkyBlock level 280\n\n- Member: level 280\n- Elite: level 320'}
            value={draft.description ?? ''}
            disabled={readOnly}
            onChange={e => setEmbed({ description: e.target.value })}
          />
          <FieldErrors path="applyEmbed.description" issues={issues} />
        </div>
        <StudioField label="Colour" htmlFor="apply-colour">
          <ColourInput value={draft.color} readOnly={readOnly} onChange={v => setEmbed({ color: v })} />
          <FieldErrors path="applyEmbed.color" issues={issues} />
        </StudioField>
      </StudioSection>
      <StudioSection
        title="Fields"
        summary={fields.length ? `${fields.length} field${fields.length === 1 ? '' : 's'}` : undefined}
        defaultOpen={openFields}
        forceOpen={errorsUnder('applyEmbed.fields')}
      >
        <p className="setting-help !mt-0">Name and value pairs. Inline fields sit side by side, up to three per row.</p>
        {fields.map((f, i) => (
          <div key={i} className="setting-item">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-muted-foreground">{f.name.trim() || `Field ${i + 1}`}</p>
              {!readOnly && (
                <button type="button" className="btn-ghost btn-sm -mr-2" onClick={() => setEmbed({ fields: fields.filter((_, j) => j !== i) })}>
                  Remove field
                </button>
              )}
            </div>
            <StudioField label="Name" htmlFor={`apply-field-${i}-name`}>
              <TextInput
                id={`apply-field-${i}-name`}
                value={f.name}
                max={EMBED_LIMITS.fieldName}
                readOnly={readOnly}
                onChange={v => setField(i, { name: v ?? '' })}
              />
              <FieldErrors path={`applyEmbed.fields.${i}.name`} issues={issues} />
            </StudioField>
            <StudioField label="Value" htmlFor={`apply-field-${i}-value`}>
              <textarea
                id={`apply-field-${i}-value`}
                className="input min-h-16 text-[13px]"
                maxLength={EMBED_LIMITS.fieldValue}
                value={f.value}
                disabled={readOnly}
                onChange={e => setField(i, { value: e.target.value })}
              />
              <FieldErrors path={`applyEmbed.fields.${i}.value`} issues={issues} />
            </StudioField>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[13px]">Inline</span>
              <Switch
                name={`applyEmbed.fields.${i}.inline`}
                label={`Field ${i + 1} inline`}
                checked={f.inline === true}
                disabled={readOnly}
                onChange={on => setField(i, { inline: on || undefined })}
              />
            </div>
          </div>
        ))}
        <FieldErrors path="applyEmbed.fields" issues={issues} />
        {!readOnly && fields.length < EMBED_LIMITS.fields && (
          <div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setOpenFields(true)
                setEmbed({ fields: [...fields, { name: '', value: '' }] })
              }}
            >
              <IconPlus size={14} aria-hidden="true" />
              Add field
            </button>
          </div>
        )}
      </StudioSection>
      <StudioSection
        title="Images"
        summary={
          has(draft.imageUrl, draft.thumbnailUrl) ? [draft.imageUrl && 'image', draft.thumbnailUrl && 'thumbnail'].filter(Boolean).join(', ') : undefined
        }
        forceOpen={errorsUnder('applyEmbed.imageUrl') || errorsUnder('applyEmbed.thumbnailUrl')}
      >
        <StudioField label="Image link" help="A large image under the text, e.g. a banner." htmlFor="apply-image">
          <TextInput
            id="apply-image"
            value={draft.imageUrl}
            max={EMBED_LIMITS.url}
            placeholder="https://…"
            readOnly={readOnly}
            onChange={v => setEmbed({ imageUrl: v })}
          />
          <FieldErrors path="applyEmbed.imageUrl" issues={issues} />
        </StudioField>
        <StudioField label="Thumbnail link" help="A small image in the top right." htmlFor="apply-thumbnail">
          <TextInput
            id="apply-thumbnail"
            value={draft.thumbnailUrl}
            max={EMBED_LIMITS.url}
            placeholder="https://…"
            readOnly={readOnly}
            onChange={v => setEmbed({ thumbnailUrl: v })}
          />
          <FieldErrors path="applyEmbed.thumbnailUrl" issues={issues} />
        </StudioField>
      </StudioSection>
      <StudioSection title="Footer" summary={draft.footerText} forceOpen={errorsUnder('applyEmbed.footerText') || errorsUnder('applyEmbed.footerIconUrl')}>
        <StudioField label="Text" htmlFor="apply-footer">
          <TextInput id="apply-footer" value={draft.footerText} max={EMBED_LIMITS.footer} readOnly={readOnly} onChange={v => setEmbed({ footerText: v })} />
          <FieldErrors path="applyEmbed.footerText" issues={issues} />
        </StudioField>
        <StudioField label="Icon link" htmlFor="apply-footer-icon">
          <TextInput
            id="apply-footer-icon"
            value={draft.footerIconUrl}
            max={EMBED_LIMITS.url}
            placeholder="https://…"
            readOnly={readOnly}
            onChange={v => setEmbed({ footerIconUrl: v })}
          />
          <FieldErrors path="applyEmbed.footerIconUrl" issues={issues} />
        </StudioField>
      </StudioSection>
      <FieldErrors path="applyEmbed" issues={issues} />
      <p className={`pt-3 text-xs ${used > total ? 'text-destructive' : 'text-muted-foreground'}`}>
        {used.toLocaleString()} / {total.toLocaleString()} characters
      </p>
    </div>
  )

  return (
    <div className="setting-row-stacked !p-0">
      <div className="px-4 pt-4 sm:px-5">
        <p className="setting-label">Apply message</p>
        <p className="setting-help">
          What Post Apply button sends: your guild&apos;s requirements, ranks and contacts in one embed, so you don&apos;t need a separate info message. Press
          Post Apply button again after saving to update the posted message.
        </p>
      </div>
      <Studio
        form={form}
        preview={
          <DiscordMessage
            botName="Bridge"
            embed={previewEmbed({ ...draft, fields }, fallbackTitle)}
            buttons={[{ label: buttonLabel?.trim() || 'Apply' }]}
            discord={discord}
          />
        }
      />
    </div>
  )
}
