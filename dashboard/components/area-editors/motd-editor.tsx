'use client'

import { useRef } from 'react'
import { MC_COLORS } from '@bridge/discord/renderers/minecraft-text'
import { MOTD_LINE_MAX, MOTD_MAX_LINES, motdCommands } from '@bridge/settings/motd'
import { IconPlus } from '@/components/icons'
import { FieldErrors } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { insertToken } from '@/lib/template-preview'
import { MC_COLOR_NAMES, MC_FORMATS, McLine, stripAmpCodes } from './minecraft-text'
import { asObj } from './rows'
import { Studio } from './studio'

// Hypixel frames guild messages with a blue struck-through rule.
const RULE = '&9&m-----------------------------------------------------'

/** The editable lines of the stored text; always at least one box. */
export function linesOf(message: unknown): string[] {
  const lines = typeof message === 'string' ? message.split('\n') : []
  return lines.length ? lines : ['']
}

/** Back to the stored text; all-blank means nothing set (inherit on an account tab). */
export function messageOf(lines: readonly string[]): string | undefined {
  const text = lines.join('\n')
  return text.trim() ? text : undefined
}

/**
 * Message of the day, the way it is set in game: one box per `/g motd add` line (up to 5), & colour and
 * format codes from a toolbar, an in-game preview in Minecraft's font, and the exact commands the bot runs.
 */
export function MotdEditor({ value, onChange, issues, readOnly, partial }: AreaEditorProps) {
  const obj = asObj(value)
  const lines = linesOf(obj.message)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const focused = useRef(0)
  const set = (next: string[]) => {
    const out = { ...obj }
    const message = messageOf(next)
    if (message === undefined) delete out.message
    else out.message = message
    onChange(out)
  }
  const setLine = (i: number, text: string) => set(lines.map((l, j) => (j === i ? text : l)))
  const insert = (code: string) => {
    const i = Math.min(focused.current, lines.length - 1)
    const el = inputs.current[i]
    const { text, caret } = insertToken(lines[i], el?.selectionStart ?? null, el?.selectionEnd ?? null, code)
    setLine(i, text)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }
  const commands = motdCommands(messageOf(lines))
  const shown = lines.filter(l => l.trim())

  const form = (
    <div className="grid gap-4">
      <p className="setting-help !mt-0">
        Like typing <span className="font-mono">/g motd add</span> in game: one box per line, up to {MOTD_MAX_LINES}. Use &amp; codes for colour and style, or
        the buttons below.
        {partial && ' Leave every line blank to use the All accounts message.'}
      </p>
      {!readOnly && (
        <div className="grid gap-2" role="toolbar" aria-label="Minecraft colours and formats">
          <div className="flex flex-wrap gap-1">
            {Object.entries(MC_COLORS).map(([code, hex]) => (
              <button
                key={code}
                type="button"
                className="size-6 rounded border border-border"
                style={{ background: hex }}
                title={`${MC_COLOR_NAMES[code]} (&${code})`}
                aria-label={`${MC_COLOR_NAMES[code]} (&${code})`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`&${code}`)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(MC_FORMATS).map(([code, name]) => (
              <button
                key={code}
                type="button"
                className="btn-ghost btn-sm font-mono"
                title={`${name} (&${code})`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => insert(`&${code}`)}
              >
                <span
                  style={{
                    fontWeight: code === 'l' ? 700 : undefined,
                    fontStyle: code === 'o' ? 'italic' : undefined,
                    textDecoration: code === 'n' ? 'underline' : code === 'm' ? 'line-through' : undefined
                  }}
                >
                  {name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3">
        {lines.map((line, i) => {
          const visible = stripAmpCodes(line).length
          return (
            <div key={i} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[13px] font-medium" htmlFor={`motd-line-${i}`}>
                  Line {i + 1}
                </label>
                <span className={`text-xs ${line.length > MOTD_LINE_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {visible} shown · {line.length}/{MOTD_LINE_MAX}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`motd-line-${i}`}
                  ref={el => {
                    inputs.current[i] = el
                  }}
                  className="input font-mono text-[13px]"
                  maxLength={MOTD_LINE_MAX}
                  placeholder={i === 0 ? '&6&lWelcome to the guild!' : ''}
                  value={line}
                  disabled={readOnly}
                  onFocus={() => (focused.current = i)}
                  onChange={e => setLine(i, e.target.value.replace(/\n/g, ' '))}
                />
                {!readOnly && lines.length > 1 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => set(lines.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {!readOnly && lines.length < MOTD_MAX_LINES && (
          <div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                set([...lines, ''])
                requestAnimationFrame(() => inputs.current[lines.length]?.focus())
              }}
            >
              <IconPlus size={14} aria-hidden="true" />
              Add line
            </button>
          </div>
        )}
        <FieldErrors path="message" issues={issues} />
      </div>
      {commands.length > 0 && (
        <div className="grid gap-1.5 border-t border-border pt-4">
          <p className="text-[13px] font-medium">What the bot types when you push</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{commands.join('\n')}</pre>
        </div>
      )}
    </div>
  )

  const preview = (
    <div className="rounded-md p-1" style={{ background: 'linear-gradient(#7cb5ff, #b3d4ff)' }}>
      <div
        className="grid gap-0.5 rounded-sm px-2 py-2 text-[13px] leading-[1.35]"
        style={{ background: 'rgba(0,0,0,0.5)', fontFamily: "'Monocraft', monospace" }}
      >
        <McLine line={RULE} />
        {shown.length ? (
          shown.map((line, i) => <McLine key={i} line={line} />)
        ) : (
          <McLine line={partial ? '&7(uses the All accounts message)' : '&7(no message yet)'} />
        )}
        <McLine line={RULE} />
      </div>
    </div>
  )

  return <Studio form={form} preview={preview} previewLabel="Preview in game" />
}
