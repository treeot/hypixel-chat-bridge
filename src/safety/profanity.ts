/** Multi-char tricks (e.g. `|<` for `k`) are intentionally omitted. */
const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '8': 'b',
  '(': 'c',
  '<': 'c',
  '{': 'c',
  '3': 'e',
  '6': 'g',
  '9': 'g',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '0': 'o',
  $: 's',
  '5': 's',
  '7': 't',
  '+': 't'
}

/** NFKD does not fold these. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  в: 'b',
  с: 'c',
  ԁ: 'd',
  е: 'e',
  ё: 'e',
  һ: 'h',
  і: 'i',
  ї: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  ԛ: 'q',
  ѕ: 's',
  т: 't',
  у: 'y',
  х: 'x',
  ɡ: 'g',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  γ: 'y'
}

export function stripInvisible(text: string): string {
  return text.replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '')
}

export function normalize(text: string): string {
  return foldChars(text)
    .map(c => c.folded)
    .join('')
}

function foldChars(text: string): Array<{ raw: string; folded: string }> {
  const stripped = stripInvisible(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return [...stripped].map(raw => ({ raw, folded: LEET_MAP[raw] ?? HOMOGLYPHS[raw] ?? raw }))
}

/** LONG stems have no innocent superstring, so they match anywhere inside a token. */
const HARD_LONG = ['nigger', 'nigga', 'faggot', 'tranny', 'kike', 'pedophile']

/** SHORT stems live inside innocent words (spicy, grapefruit), so whole tokens only, with a per-stem suffix allow-list. */
const GENERIC_SUFFIXES = ['s', 'es', 'ed', 'ing', 'er', 'ers', 'y', 'z', 'zz']
const HARD_SHORT: Record<string, string[]> = {
  fag: GENERIC_SUFFIXES,
  coon: GENERIC_SUFFIXES,
  spic: ['s', 'z', 'zz'], // spicy, spices, spiced are words
  rape: [...GENERIC_SUFFIXES, 'd'],
  rapist: ['s', 'z', 'zz'],
  pedo: GENERIC_SUFFIXES,
  kys: [],
  nazi: GENERIC_SUFFIXES,
  retard: GENERIC_SUFFIXES,
  chink: ['s', 'z', 'zz']
}

/** Word-boundary matching so `ass` does not fire inside `class`. */
const SWEAR = ['fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'dick', 'cock', 'pussy', 'bastard', 'asshole', 'dumbass', 'jackass', 'ass']

/** Normalized substrings that trip a SWEAR match but are legitimate (Scunthorpe). */
const WHITELIST = [
  'class',
  'classic',
  'pass',
  'passed',
  'passing',
  'password',
  'bypass',
  'assassin',
  'assess',
  'assign',
  'assist',
  'assume',
  'assemble',
  'embarrass',
  'grass',
  'brass',
  'glass',
  'mass',
  'massive',
  'compass',
  'harass',
  'cockpit',
  'cocktail',
  'peacock',
  'scunthorpe',
  'shitake',
  'analysis',
  'canal'
]

function repeatBody(word: string): string {
  return word
    .split('')
    .map(c => `${escapeRegex(c)}+`)
    .join('')
}

function boundedRepeatRegex(word: string): RegExp {
  const body = word
    .split('')
    .map(c => `${escapeRegex(c)}+`)
    .join('')
  return new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, 'i')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const suffixGroup = (suffixes: string[]) => (suffixes.length ? `(?:${suffixes.map(repeatBody).join('|')})?` : '')
const LONG_PATTERNS = HARD_LONG.map(w => new RegExp(repeatBody(w)))
// Two joined tokens must be exactly a long stem (+ suffix), never merely contain one (`wiki keeps`).
const LONG_PAIR_PATTERNS = HARD_LONG.map(w => new RegExp(`^${repeatBody(w)}${suffixGroup(GENERIC_SUFFIXES)}$`))
const SHORT_PATTERNS = Object.entries(HARD_SHORT).map(([stem, suffixes]) => new RegExp(`^${repeatBody(stem)}${suffixGroup(suffixes)}$`))
const SWEAR_PATTERNS = SWEAR.map(boundedRepeatRegex)

interface Token {
  text: string
  /** True when the token was all digits before folding (`1994`), so it is never paired. */
  digits: boolean
}

/** Separators join only single-character chunks; two multi-letter words never join. */
function tokens(chars: Array<{ raw: string; folded: string }>): Token[] {
  const words: Array<{ raw: string; folded: string }> = []
  let cur = { raw: '', folded: '' }
  for (const c of chars) {
    if (/[a-z0-9]/.test(c.folded)) {
      cur.raw += c.raw
      cur.folded += c.folded
    } else if (cur.folded) {
      words.push(cur)
      cur = { raw: '', folded: '' }
    }
  }
  if (cur.folded) words.push(cur)

  const out: Token[] = []
  let run = { raw: '', folded: '' }
  const flush = () => {
    if (run.folded) out.push({ text: run.folded, digits: /^\d+$/.test(run.raw) })
    run = { raw: '', folded: '' }
  }
  for (const w of words) {
    if (w.folded.length === 1) {
      run.raw += w.raw
      run.folded += w.folded
      continue
    }
    flush()
    out.push({ text: w.folded, digits: /^\d+$/.test(w.raw) })
  }
  flush()
  return out
}

// `q` stands in for `g` (niqqer, faqqot) — only for long stems, so `faq` is not `fag`.
const qToG = (s: string) => s.replace(/q/g, 'g')

function hasSlur(list: Token[]): boolean {
  if (list.some(t => SHORT_PATTERNS.some(re => re.test(t.text)))) return true
  if (list.some(t => LONG_PATTERNS.some(re => re.test(qToG(t.text))))) return true
  // Long stems split by one separator (`n igger`, `nig ger`, `fa ggot`): each adjacent non-numeric pair joined.
  for (let i = 0; i + 1 < list.length; i++) {
    if (list[i].digits || list[i + 1].digits) continue
    const joined = qToG(list[i].text + list[i + 1].text)
    if (LONG_PAIR_PATTERNS.some(re => re.test(joined))) return true
  }
  return false
}

/** Checked with leet folded and with symbols as separators, so trailing leet punctuation (`kys!`) cannot hide a word. */
export function containsSlur(content: string): boolean {
  const visible = stripInvisible(content)
  const symbolsFolded = foldChars(visible)
  const symbolsSplit = foldChars(visible.replace(/[^\p{L}\p{N}]/gu, ' '))
  return [symbolsFolded, symbolsSplit].some(chars => hasSlur(tokens(chars)))
}

export function containsProfanity(content: string): boolean {
  const normalized = normalize(content)

  const swearHit = SWEAR_PATTERNS.some(re => re.test(normalized))
  if (!swearHit) return false

  // A swear stem fired. If the collapsed message is entirely explained by
  // whitelisted words, treat it as a false positive (Scunthorpe guard).
  const collapsed = normalized.replace(/[^a-z0-9]/g, '')
  for (const safe of WHITELIST) {
    if (collapsed.includes(safe)) {
      // Re-check with the whitelisted spans removed; block only if a swear
      // survives outside them.
      const scrubbed = WHITELIST.reduce((acc, w) => acc.split(w).join(' '), collapsed)
      return SWEAR_PATTERNS.some(re => re.test(scrubbed))
    }
  }

  return true
}
