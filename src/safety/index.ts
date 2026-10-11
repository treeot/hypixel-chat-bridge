import { z } from 'zod'
import { containsProfanity, containsSlur, normalize } from './profanity'
import { DEFAULT_SAFETY, type BlockReason, type SafetySettings } from './types'
export { DEFAULT_SAFETY, type BlockReason, type Category, type SafetySettings } from './types'

const flag = z.boolean().catch(true)
const schema = z.object({
  categories: z.object({ slurs: flag, profanity: flag, links: flag, advertising: flag, personalInfo: flag }).catch(DEFAULT_SAFETY.categories),
  blockedWords: z.array(z.string()).catch([]),
  allowedWords: z.array(z.string()).catch([])
})

export function parseSafetySettings(doc: unknown): SafetySettings {
  const parsed = schema.safeParse(doc ?? {})
  if (!parsed.success) return DEFAULT_SAFETY
  return { categories: parsed.data.categories, blockedWords: parsed.data.blockedWords, allowedWords: parsed.data.allowedWords }
}

export type Verdict = { ok: true; text: string } | { ok: false; reason: BlockReason }

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRegex = (word: string) => new RegExp(`(?<![a-z0-9])${escapeRegex(word)}(?![a-z0-9])`, 'gi')

const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i
// Separators: `.` (spaces allowed), `-` attached on the left, ` - ` spaced on both sides, or whitespace.
// A `-` with space before and a digit right after is a sign (`100 64 -200`), so it ends the run.
const DIGIT_RUN = /\+?\d+(?:(?:\s*\.\s*|-\s*|\s+-\s+|\s+)\d+)+/g
// `[dot]`, `( dot )`, `{.}`, `<dot>`: any bracket pair around `dot` or `.`.
const DOT_TOKEN = String.raw`[\[({<]\s*(?:dot|\.)\s*[\])}>]`
const IPV4 = new RegExp(String.raw`\b(?:\d{1,3}\s*(?:\.|\bdot\b|${DOT_TOKEN})\s*){3}\d{1,3}\b`, 'i')
const IPV6 = /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/i

const PAYMENT = /\b(paypal|cash ?app|venmo|zelle|crypto|bitcoin|btc)\b/
const RMT = /\b(sell|selling|buy|buying)\b.{0,40}\b(coins?|mil|bil)\b/
// Checked on the un-folded text: `normalize` turns `$` into `s`.
const MONEY = /[$€£]|\b(usd|eur|gbp|irl|dollars?)\b/i
const FREE_STUFF = /\bfree\s+(rank|mvp\+*|vip\+*|coins|nitro)\b/
const SERVER_AD = /\b(join|play on|come to)\s+(my|our)\s+(server|smp|network)\b/
const GIVEAWAY = /\bgiveaway\b.{0,40}\b(dm|message|add)\b/

const BARE_DOT = new RegExp(DOT_TOKEN, 'gi')
const URL_RE = /\b(?:https?:\/\/(?:www\.)?[a-z0-9-]+|(?:www\.)?[a-z0-9-]{2,})(?:\.[a-z]{2,}){1,2}(?:\/\S*)?/gi
const DISCORD_INVITE = /discord\s*(?:\.|dot)\s*gg\/?\S*/gi
const OBFUSCATED_DOMAIN = new RegExp(String.raw`\b[a-z0-9-]{2,}\s*(?:${DOT_TOKEN}|\s+dot\s+)\s*[a-z]{2,}\b`, 'gi')

function isAdvertising(scan: string): boolean {
  const n = normalize(scan)
  if (PAYMENT.test(n) || FREE_STUFF.test(n) || SERVER_AD.test(n) || GIVEAWAY.test(n)) return true
  return RMT.test(n) && MONEY.test(scan)
}

/** Thousands grouping (`1.000.000`) is exempt, but a leading `+` dial code never is. */
function hasPhoneNumber(text: string): boolean {
  for (const [run] of text.matchAll(DIGIT_RUN)) {
    const groups = run.replace('+', '').split(/\s*[.-]\s*|\s+/)
    if (groups.join('').length < 7) continue
    const thousands = !run.startsWith('+') && groups[0].length <= 3 && groups.slice(1).every(g => g.length === 3)
    if (!thousands) return true
  }
  return false
}

function findBlock(text: string, s: SafetySettings): BlockReason | null {
  const on = s.categories
  if (on.slurs && containsSlur(text)) return 'slurs'

  let scan = text
  for (const w of s.allowedWords) if (w.trim()) scan = scan.replace(wordRegex(w.trim()), ' ')

  const folded = normalize(text)
  for (const w of s.blockedWords) {
    const word = normalize(w.trim())
    if (word && wordRegex(word).test(folded)) return 'custom'
  }

  if (on.profanity && containsProfanity(scan)) return 'profanity'
  if (on.personalInfo && (EMAIL.test(text) || hasPhoneNumber(text) || IPV4.test(text) || IPV6.test(text))) return 'personalInfo'
  if (on.advertising && isAdvertising(scan)) return 'advertising'
  return null
}

// Marks where a link was removed; regexes treat it like whitespace.
const CUT = ' \uE000 '
const CUT_RE = /\s*\uE000\s*/g

function stripLinks(text: string): string {
  return text.replace(DISCORD_INVITE, CUT).replace(OBFUSCATED_DOMAIN, CUT).replace(BARE_DOT, CUT).replace(URL_RE, CUT)
}

export function checkOutbound(text: string, s: SafetySettings = DEFAULT_SAFETY): Verdict {
  const before = findBlock(text, s)
  if (before) return { ok: false, reason: before }

  let result = text.trim()
  if (s.categories.links) {
    let marked = result
    // Strip until stable: removing a link can expose another one.
    for (let i = 0; i < 5; i++) {
      const next = stripLinks(marked)
      if (next === marked) break
      marked = next
    }
    result = marked.replace(CUT_RE, ' ').replace(/\s+/g, ' ').trim()
    if (!result && text.trim()) return { ok: false, reason: 'links' }
    // Stripping can splice fragments into a slur ("n <link> igger", "nig [dot] ger"):
    // check the text with each removed link glued shut.
    if (s.categories.slurs && containsSlur(marked.replace(CUT_RE, ''))) return { ok: false, reason: 'slurs' }
    const after = findBlock(result, s)
    if (after) return { ok: false, reason: after }
  }
  return { ok: true, text: result }
}

const CHAT_HEAD =
  /^\s*(\/(?:(?:g|guild|p|party)\s+(?:chat|officerchat)|gchat|ochat|achat|pchat|gc|oc|pc|ac|reply|shout|message|whisper|msg|tell|r|w))(?=\s|$)\s*(.*)$/is
const TARGETED = new Set(['/msg', '/w', '/tell', '/message', '/whisper'])

export function isChatCommand(command: string): boolean {
  return !command.trimStart().startsWith('/') || CHAT_HEAD.test(command)
}

type Guard = { ok: true; command: string } | { ok: false; reason: BlockReason }

export function stripMinecraftUnsafe(text: string): string {
  return text.replace(/§[0-9a-fk-orx]?/gi, '').replace(/\p{Cc}+/gu, ' ')
}

export function guardCommand(raw: string, s: SafetySettings = DEFAULT_SAFETY): Guard {
  // Defense in depth: Discord text is already cleaned, but every line (commands too) loses § codes and control characters here.
  const command = stripMinecraftUnsafe(raw)
  if (!command.trimStart().startsWith('/')) {
    const v = checkOutbound(command, s)
    return v.ok ? { ok: true, command: v.text } : v
  }

  const m = CHAT_HEAD.exec(command)
  if (m) {
    let head = m[1].replace(/\s+/g, ' ')
    let payload = m[2]
    if (TARGETED.has(head.toLowerCase())) {
      const t = /^(\S+)\s*(.*)$/s.exec(payload)
      if (!t) return { ok: true, command: command.trim() }
      const target = checkOutbound(t[1], s)
      if (!target.ok) return target
      if (target.text !== t[1]) return { ok: false, reason: 'links' }
      head += ` ${t[1]}`
      payload = t[2]
    }
    if (!payload.trim()) return { ok: true, command: command.trim() }
    const v = checkOutbound(payload, s)
    return v.ok ? { ok: true, command: `${head} ${v.text}` } : v
  }

  const words = command.trim().split(/\s+/)
  const name = words[0].toLowerCase()
  const sub = words[1]?.toLowerCase() ?? ''
  const guild = name === '/g' || name === '/guild'
  const party = name === '/p' || name === '/party'

  // `/g kick <ign> <reason>`: only the reason is free text.
  if (guild && sub === 'kick') return checkArgs(command, /^\s*\S+\s+\S+\s+\S+\s*(.*)$/s.exec(command)?.[1] ?? '', s)

  const argOnly = ARG_ONLY.has(name) || (guild && GUILD_ARG_ONLY.has(sub)) || (party && PARTY_ARG_ONLY.has(sub))
  // IGN/rank/duration arguments are never content-scanned; anything that doesn't look like one falls through.
  if (argOnly && ARG_SHAPE.test(words.slice(1).join(' '))) return { ok: true, command }

  // `/g motd|tag|description …` and unknown commands: fail closed on the whole tail.
  return checkArgs(command, /^\s*\/\S+\s*(.*)$/s.exec(command)?.[1] ?? '', s)
}

const ARG_ONLY = new Set(['/locraw', '/limbo', '/lobby', '/l', '/hub', '/rejoin'])
const GUILD_ARG_ONLY = new Set([
  'accept',
  'invite',
  'promote',
  'demote',
  'setrank',
  'mute',
  'unmute',
  'online',
  'list',
  'members',
  'log',
  'top',
  'info',
  'history',
  'transfer'
])
const PARTY_ARG_ONLY = new Set(['invite', 'kick', 'transfer', 'promote', 'demote', 'warp', 'disband', 'list', 'leave', 'accept'])
const ARG_SHAPE = /^[\w\s]*$/

/** Non-chat argument text: blocked if the filter would block OR rewrite it (non-chat commands are never rewritten). */
function checkArgs(command: string, rest: string, s: SafetySettings): Guard {
  if (!rest.trim()) return { ok: true, command }
  const v = checkOutbound(rest, s)
  if (!v.ok) return v
  if (v.text.replace(/\s+/g, ' ') !== rest.replace(/\s+/g, ' ').trim()) return { ok: false, reason: 'links' }
  return { ok: true, command }
}

export function collapseRepeats(text: string, max = 3): string {
  max = Math.max(1, Math.floor(max))
  const re = new RegExp(`(.)\\1{${max},}`, 'gs')
  return text.replace(re, (_, c: string) => c.repeat(max))
}

export function parseMuteExpiry(line: string, now: number): number | null {
  if (!/mute will expire in/i.test(line)) return null
  const units = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 } as const
  let total = 0
  let found = false
  for (const [, n, u] of line.matchAll(/(\d+)\s*([dhms])\b/gi)) {
    total += Number(n) * units[u.toLowerCase() as keyof typeof units]
    found = true
  }
  return found ? now + total : null
}

/** True when a mute line announces a new mute (expiry drifts by seconds on repeats of the same one). */
export function isNewMute(until: number | null, current: number | null): boolean {
  if (until === null || current === null) return true
  return Math.abs(until - current) >= 60_000
}
