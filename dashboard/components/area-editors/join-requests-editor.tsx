'use client'

import { RULE_HINTS, RULE_LABELS, RULE_MAX, RULE_TYPES, type RuleType } from '@bridge/settings/joinRequests'
import { IconPlus } from '@/components/icons'
import { FieldErrors } from '@/components/schema-form'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { EDITOR_KEYS } from '@/lib/area-editor-keys'
import { formatAmount, withCommas } from '@/lib/amount'
import { accountName } from '@/lib/labels'
import { fieldCopy } from '@/lib/settings-copy'
import type { DiscordDirectory } from '@/lib/types'
import { AmountInput } from './amount-input'
import { asObj, GenericRow, NEEDS_KEY_TAG } from './rows'

type Rule = { type?: unknown; min?: unknown }
const isRuleType = (v: unknown): v is RuleType => typeof v === 'string' && (RULE_TYPES as readonly string[]).includes(v)

function channelName(discord: DiscordDirectory | null, id: string): string {
  const channel = discord?.channels.find(c => c.id === id)
  return channel ? `#${channel.name}` : 'a channel the bot can’t see'
}

/** Requirement rules: a requirement each, with a minimum that reads 1.5b / 100k / 2.5m and its cap. */
function RulesRow({
  value,
  onChange,
  issues,
  readOnly,
  partial,
  locked
}: {
  value: unknown
  onChange: (next: Rule[] | undefined) => void
  issues: Record<string, string[]>
  readOnly: boolean
  partial: boolean
  /** The bot has no Hypixel key, so rules can't be checked: greyed and read-only. */
  locked: boolean
}) {
  const copy = fieldCopy('joinRequests', 'rules')
  const inherited = partial && value === undefined
  const rules = (Array.isArray(value) ? value : []) as Rule[]
  const used = rules.map(r => r.type)
  const free = RULE_TYPES.find(t => !used.includes(t))
  const set = (i: number, next: Rule) => onChange(rules.map((r, j) => (j === i ? next : r)))
  return (
    <div className={`setting-row-stacked${locked ? ' opacity-55' : ''}`}>
      <div>
        <p className="setting-label">{copy?.label ?? 'Rules'}</p>
        <p className="setting-help">{copy?.help} Minimums can be written short, like 100k, 2.5m or 1.5b.</p>
        {locked && NEEDS_KEY_TAG}
      </div>
      {inherited ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted-foreground">Uses the All accounts rules.</p>
          {!readOnly && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([])}>
              Set rules for this account
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {rules.length === 0 && <p className="text-[13px] text-muted-foreground">No rules yet, so every applicant qualifies.</p>}
          {rules.map((rule, i) => {
            const type = isRuleType(rule.type) ? rule.type : undefined
            const name = type ? RULE_LABELS[type] : 'Requirement'
            const minPath = `rules.${i}.min`
            const big = typeof rule.min === 'number' && rule.min >= 1000
            return (
              <div key={i} className="setting-item !gap-2">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                  <label className="grid gap-1">
                    <span className="text-[13px] font-medium">{fieldCopy('joinRequests', 'rules.*.type')?.label ?? 'Requirement'}</span>
                    <select
                      className="input"
                      name={`rules.${i}.type`}
                      value={type ?? ''}
                      disabled={readOnly}
                      onChange={e => set(i, { ...rule, type: e.target.value })}
                    >
                      {!type && (
                        <option value="" disabled>
                          Choose…
                        </option>
                      )}
                      {RULE_TYPES.map(t => (
                        <option key={t} value={t} disabled={t !== type && used.includes(t)}>
                          {RULE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <FieldErrors path={`rules.${i}.type`} issues={issues} />
                  </label>
                  <div className="grid gap-1">
                    <span className="text-[13px] font-medium">{fieldCopy('joinRequests', 'rules.*.min')?.label ?? 'Minimum'}</span>
                    <AmountInput
                      name={minPath}
                      label={`Minimum ${name.toLowerCase()}`}
                      value={rule.min}
                      placeholder={type ? RULE_HINTS[type] : undefined}
                      disabled={readOnly}
                      invalid={(issues[minPath]?.length ?? 0) > 0}
                      onChange={min => set(i, { ...rule, min })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {big && `${withCommas(rule.min as number)}. `}
                      {type && `Up to ${formatAmount(RULE_MAX[type])}.`}
                    </p>
                    <FieldErrors path={minPath} issues={issues} />
                  </div>
                  {!readOnly && (
                    <button type="button" className="btn-ghost btn-sm sm:mt-6" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                      Remove rule
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {free && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...rules, { type: free, min: '' }])}>
                  <IconPlus size={14} />
                  Add rule
                </button>
              )}
              {partial && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(undefined)}>
                  Use the All accounts rules
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <FieldErrors path="rules" issues={issues} />
    </div>
  )
}

/** Where this account's Apply button is, read-only; the message id fields themselves stay hidden. */
function ApplyStatus({
  value,
  discord,
  partial,
  account,
  noKey
}: {
  value: Record<string, unknown>
  discord: DiscordDirectory | null
  partial: boolean
  /** No Hypixel key: the bot can't post the button. */
  noKey: boolean
  /** The open account tab's name; undefined on the All accounts tab. */
  account?: string
}) {
  const messageId = typeof value.applyMessageId === 'string' ? value.applyMessageId : undefined
  const postedIn = typeof value.applyPostedIn === 'string' ? value.applyPostedIn : typeof value.applyChannelId === 'string' ? value.applyChannelId : undefined
  const status = messageId
    ? `Posted in ${postedIn ? channelName(discord, postedIn) : 'the Apply button channel'}.`
    : partial
      ? 'Not posted yet.'
      : 'Each account posts its own. Open an account’s tab to see where its button is.'
  return (
    <div className={`setting-row${noKey ? ' opacity-55' : ''}`}>
      <div>
        <p className="setting-label">Apply button</p>
        <p className="setting-help">
          {account
            ? `Use Post Apply button for ${account} at the top of the page to post or replace it.`
            : 'Post Apply button at the top of the page posts it for the account it names, the one picked in the top bar.'}
        </p>
      </div>
      {noKey ? <div>{NEEDS_KEY_TAG}</div> : <p className="text-sm md:pt-0.5">{status}</p>}
    </div>
  )
}

// Without a Hypixel key these can't work; On and Auto-deny still run the blacklist and GuildLB checks.
const NEEDS_HYPIXEL = new Set(['mode', 'autoAccept', 'capacity', 'waitlist', 'kickUnqualifiedOnJoin', 'ranks', 'applyChannelId', 'waitlistNotifyChannelId'])

// The generic rows, in EDITOR_KEYS order, either side of the rules editor.
const ROWS: readonly string[] = EDITOR_KEYS.joinRequests.rendered
const TOP = ROWS.slice(0, ROWS.indexOf('rules'))
const AFTER_RULES = ROWS.slice(ROWS.indexOf('rules') + 1)

/** Join requests: the generic fields, a rules editor that reads short amounts, and the Apply button's status instead of its ids. */
export function JoinRequestsEditor(props: AreaEditorProps) {
  const { value, onChange, issues, readOnly, partial, discord, accountId, accounts, missingKey } = props
  const noKey = Boolean(missingKey)
  const obj = asObj(value)
  const tabAccount = accountId === undefined ? undefined : accounts.find(a => a.id === accountId)
  const row = (field: string) => <GenericRow key={field} field={field} {...props} locked={noKey && NEEDS_HYPIXEL.has(field)} />
  return (
    <>
      {TOP.map(row)}
      <RulesRow
        value={obj.rules}
        issues={issues}
        readOnly={readOnly || noKey}
        partial={partial}
        locked={noKey}
        onChange={rules => {
          const next = { ...obj, rules }
          if (rules === undefined) delete next.rules
          onChange(next)
        }}
      />
      {AFTER_RULES.map(row)}
      <ApplyStatus value={obj} discord={discord} partial={partial} account={tabAccount ? accountName(tabAccount, accounts) : undefined} noKey={noKey} />
    </>
  )
}
