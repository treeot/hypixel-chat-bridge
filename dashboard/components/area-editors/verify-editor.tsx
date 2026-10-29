'use client'

import { FieldErrors, FieldLabel, SchemaField, SettingRow } from '@/components/schema-form'
import { IconPlus } from '@/components/icons'
import type { AreaEditorProps } from '@/lib/area-editor-types'
import { fieldCopy } from '@/lib/settings-copy'
import { nicknamePreview } from '@/lib/template-preview'
import { asObj, fieldNode, GenericRow, withKey } from './rows'

const MAX_RANK_ROLES = 25

type RankRole = { rank?: string; roleId?: string }

/** Verify: the role, the nickname template with a live preview for a player called Steve, and the rank → role map. */
export function VerifyEditor(props: AreaEditorProps) {
  const { node, value, onChange, issues, readOnly } = props
  const obj = asObj(value)
  const nick = fieldNode(node, 'nicknameTemplate')
  const template = typeof obj.nicknameTemplate === 'string' ? obj.nicknameTemplate : ''
  const preview = template.trim() ? nicknamePreview(template) : null

  const rankRolesNode = fieldNode(node, 'rankRoles')
  const rankRoleItem = rankRolesNode?.kind === 'array' && rankRolesNode.item.kind === 'object' ? rankRolesNode.item : null
  const rankRoles: RankRole[] = Array.isArray(obj.rankRoles) ? (obj.rankRoles as RankRole[]) : []
  const setRankRoles = (list: RankRole[]) => onChange(withKey(obj, 'rankRoles', list.length ? list : undefined))

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
      {rankRolesNode && rankRoleItem && (
        <SettingRow path="rankRoles" node={rankRolesNode}>
          <div className="grid gap-4">
            {rankRoles.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                Maps each guild rank to a Discord role, given to a verified member alongside the verified role. Add a rank role to start.
              </p>
            )}
            {rankRoles.map((entry, i) => {
              const base = `rankRoles.${i}`
              const set = (key: keyof RankRole, next: unknown) => setRankRoles(rankRoles.map((r, j) => (j === i ? { ...r, [key]: next } : r)))
              return (
                <fieldset key={i} className="setting-item" aria-label={entry.rank?.trim() ? `Rank role ${entry.rank}` : `Rank role ${i + 1}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] font-medium text-muted-foreground">{entry.rank?.trim() || `Rank role ${i + 1}`}</p>
                    {!readOnly && (
                      <button type="button" className="btn-ghost btn-sm -mr-2" onClick={() => setRankRoles(rankRoles.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid content-start gap-2">
                      <FieldLabel path={`${base}.rank`} small />
                      {rankRoleItem.fields.rank && (
                        <SchemaField
                          path={`${base}.rank`}
                          node={rankRoleItem.fields.rank}
                          value={entry.rank}
                          onChange={next => set('rank', next)}
                          issues={issues}
                          readOnly={readOnly}
                        />
                      )}
                    </div>
                    <div className="grid content-start gap-2">
                      <FieldLabel path={`${base}.roleId`} small />
                      {rankRoleItem.fields.roleId && (
                        <SchemaField
                          path={`${base}.roleId`}
                          node={rankRoleItem.fields.roleId}
                          value={entry.roleId}
                          onChange={next => set('roleId', next)}
                          issues={issues}
                          readOnly={readOnly}
                        />
                      )}
                    </div>
                  </div>
                  <FieldErrors path={base} issues={issues} />
                </fieldset>
              )
            })}
            <FieldErrors path="rankRoles" issues={issues} />
            {!readOnly && rankRoles.length < MAX_RANK_ROLES && (
              <div>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setRankRoles([...rankRoles, { rank: '', roleId: '' }])}>
                  <IconPlus size={14} />
                  Add rank role
                </button>
              </div>
            )}
          </div>
        </SettingRow>
      )}
    </>
  )
}
