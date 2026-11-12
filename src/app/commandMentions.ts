const commandIds = new Map<string, string>()

/** Records the ids Discord gave the published slash commands, so messages can mention them. */
export function rememberCommandIds(commands: Iterable<{ id: string; name: string }>): void {
  commandIds.clear()
  for (const { id, name } of commands) commandIds.set(name, id)
}

/** A clickable `</verify:id>` mention once the command is published; plain `/verify` until then. */
export function commandMention(name: string): string {
  const id = commandIds.get(name)
  return id ? `</${name}:${id}>` : `\`/${name}\``
}
