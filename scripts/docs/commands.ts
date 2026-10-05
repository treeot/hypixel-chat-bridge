import { ApplicationCommandOptionType, type ApplicationCommandOptionData } from 'discord.js'
import { slashCommands } from '../../src/app/commands'
import { chatCommands } from '../../src/app/chat'
import type { ChatCommand, SlashCommand } from '../../src/app/context'
import { ACCOUNT_SCOPED_COMMANDS } from '../../src/app/accountScope'
import { GENERATED_NOTE } from './configuration'

export interface SlashRow {
  usage: string
  description: string
  permission: string
  accountOption: boolean
}

export interface ChatRow {
  usage: string
  aliases: string
  toggle: string
  description: string
}

type Opt = ApplicationCommandOptionData & { options?: readonly Opt[]; required?: boolean }

const PERMISSION: Record<SlashCommand['permission'], string> = { all: 'Everyone', staff: 'Staff', owner: 'Owner' }
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const args = (options: readonly Opt[] = []) => options.map(o => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ')
const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

const ownerPerm = (ownerOnly: ReadonlySet<string>, path: string) => (ownerOnly.has(path) ? { permission: PERMISSION.owner } : {})

export function slashRows(commands: readonly SlashCommand[], accountScoped: Iterable<string>): SlashRow[] {
  const scoped = new Set(accountScoped)
  const rows: SlashRow[] = []
  for (const c of [...commands].sort((a, b) => a.name.localeCompare(b.name))) {
    const base = { permission: PERMISSION[c.permission], accountOption: scoped.has(c.name) }
    const ownerOnly = c.ownerOnlySubcommands ?? new Set<string>()
    const options = (c.options ?? []) as readonly Opt[]
    const subs = options.filter(o => o.type === ApplicationCommandOptionType.Subcommand || o.type === ApplicationCommandOptionType.SubcommandGroup)
    if (subs.length === 0) {
      rows.push({ usage: join(`/${c.name}`, args(options)), description: c.description, ...base })
      continue
    }
    for (const s of subs) {
      if (s.type === ApplicationCommandOptionType.SubcommandGroup) {
        for (const leaf of s.options ?? []) rows.push({ usage: join(`/${c.name}`, s.name, leaf.name, args(leaf.options)), description: leaf.description, ...base, ...ownerPerm(ownerOnly, `${s.name} ${leaf.name}`) })
      } else {
        rows.push({ usage: join(`/${c.name}`, s.name, args(s.options)), description: s.description, ...base, ...ownerPerm(ownerOnly, s.name) })
      }
    }
  }
  return rows
}

export function chatRows(commands: readonly ChatCommand[]): ChatRow[] {
  return [...commands]
    .sort((a, b) => a.triggers[0].localeCompare(b.triggers[0]))
    .map(c => ({
      usage: join(`!${c.triggers[0]}`, c.usage),
      aliases: c.triggers
        .slice(1)
        .map(t => `\`!${t}\``)
        .join(', '),
      toggle: c.toggle ? `\`${c.toggle}\`` : '—',
      description: c.description
    }))
}

export function renderCommandsMd(): string {
  const out = [
    GENERATED_NOTE,
    '',
    '# Commands',
    '',
    '`<x>` = required, `[x]` = optional. `ign` = Minecraft username (defaults to the sender for in-game commands).',
    '',
    '## Slash commands',
    '',
    'Permissions: **Everyone**; **Staff** = members with `STAFF_ROLE_ID` (owner-only when unset) plus the owner; **Owner** = `OWNER_ID`.',
    '† = takes an optional `account` option when more than one Minecraft account is configured (default: the account owning the channel, else account 1).',
    '',
    '| Command | Permission | Description |',
    '|---|---|---|'
  ]
  for (const r of slashRows(slashCommands, ACCOUNT_SCOPED_COMMANDS)) out.push(`| \`${cell(r.usage)}\`${r.accountOption ? ' †' : ''} | ${r.permission} | ${cell(r.description)} |`)
  out.push(
    '',
    '## In-game commands',
    '',
    'Anyone in guild or officer chat can run these. The default prefix is `!`. Each command can be switched off in `/setup` → Commands (the "Toggle" key).',
    'Replies go out through the account that saw the command, and pass the ban-safety filter (docs/safety-filter.md).',
    '',
    '| Command | Aliases | Toggle | Description |',
    '|---|---|---|---|'
  )
  for (const r of chatRows(chatCommands)) out.push(`| \`${cell(r.usage)}\` | ${r.aliases || '—'} | ${r.toggle} | ${cell(r.description)} |`)
  out.push('')
  return out.join('\n')
}
