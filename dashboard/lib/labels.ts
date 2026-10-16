/** One shared vocabulary for naming things to staff. */

type Named = { id: number; label?: string | null }

/**
 * An account's name as staff know it: its label ("Main"), or "G<id>" when it has none.
 * " (#<id>)" is added only when another account in `all` has the same name, so two "Main"s stay apart.
 */
export function accountName(account: Named, all: readonly Named[] = []): string {
  const base = (a: Named) => a.label?.trim() || `G${a.id}`
  const name = base(account)
  const clash = all.some(a => a.id !== account.id && base(a).toLowerCase() === name.toLowerCase())
  return clash ? `${name} (#${account.id})` : name
}
