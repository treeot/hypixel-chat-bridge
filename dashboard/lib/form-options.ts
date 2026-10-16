/** Per-area tweaks for the generated settings form. Paths are dotted ("list.0.id"); `*` stands for any array index. */
export interface FormOptions {
  /** Fields that are not shown at all (and are kept as they are). */
  hidden?: string[]
  /** Fields shown as plain text instead of an input. */
  readOnly?: string[]
  /** Text for a read-only field. */
  format?: (path: string, value: unknown) => string
  /** Heading for an array row. */
  itemTitle?: (arrayPath: string, item: unknown) => string | undefined
  /** Builds a new array row. `value` is the whole form value with any other fields updated; null means adding is not possible. */
  newItem?: (arrayPath: string, value: unknown) => { item: unknown; value: unknown } | null
}

export function pathMatches(pattern: string, path: string): boolean {
  const p = pattern.split('.')
  const q = path.split('.')
  return p.length === q.length && p.every((seg, i) => seg === '*' || seg === q[i])
}

export const matchesAny = (patterns: readonly string[] | undefined, path: string): boolean => (patterns ?? []).some(p => pathMatches(p, path))

/** Appends `item` to the array at `arrayPath` inside `root`, returning a new root. */
export function appendAt(root: unknown, arrayPath: string, item: unknown): unknown {
  const put = (node: unknown, keys: string[]): unknown => {
    if (keys.length === 0) return [...(Array.isArray(node) ? node : []), item]
    const [head, ...rest] = keys
    if (Array.isArray(node)) return node.map((x, i) => (String(i) === head ? put(x, rest) : x))
    const obj = (node && typeof node === 'object' ? node : {}) as Record<string, unknown>
    return { ...obj, [head]: put(obj[head], rest) }
  }
  return put(root, arrayPath === '' ? [] : arrayPath.split('.'))
}

export const MAX_ACCOUNT_ROWS = 10

type AccountsValue = { nextId?: unknown; list?: unknown }
type Row = { id?: unknown; label?: unknown }

/**
 * The next account row: id = max(nextId, highest id + 1), and nextId moves past it. Null when the list is full or ids run out.
 * `reserved` are ids of accounts that exist outside the list (set in the bot's config); they count toward the limit and are skipped.
 */
export function newAccountItem(value: unknown, reserved: readonly number[] = []): { item: { id: number; enabled: true }; value: unknown } | null {
  const v = (value && typeof value === 'object' ? value : {}) as AccountsValue
  const list = (Array.isArray(v.list) ? v.list : []) as Row[]
  const ids = [...list.map(r => (typeof r?.id === 'number' ? r.id : 0)), ...reserved]
  if (new Set(ids).size >= MAX_ACCOUNT_ROWS) return null
  const id = Math.max(typeof v.nextId === 'number' ? v.nextId : 2, ...ids.map(i => i + 1))
  if (id > 99) return null
  return { item: { id, enabled: true }, value: { ...v, nextId: id + 1 } }
}

export const ACCOUNTS_FORM: FormOptions = {
  // The row heading already names the account, so its id is hidden (and kept as it is on save).
  hidden: ['nextId', 'list.*.id'],
  itemTitle: (arrayPath, item) => {
    if (arrayPath !== 'list' || !item || typeof item !== 'object') return undefined
    const { id, label } = item as Row
    return typeof label === 'string' && label ? `${label} (#${String(id)})` : `Account #${String(id)}`
  },
  newItem: (arrayPath, value) => (arrayPath === 'list' ? newAccountItem(value) : null)
}

export const FORM_OPTIONS: Partial<Record<string, FormOptions>> = { accounts: ACCOUNTS_FORM }
