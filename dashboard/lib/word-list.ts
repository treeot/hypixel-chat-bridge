/** Adds typed or pasted words (split on commas and new lines) to a word list, skipping blanks and case-insensitive repeats. */
export function addWords(list: readonly string[], input: string): string[] {
  const out = [...list]
  const seen = new Set(list.map(w => w.toLowerCase()))
  for (const raw of input.split(/[,\n]/)) {
    const word = raw.trim()
    if (!word || seen.has(word.toLowerCase())) continue
    seen.add(word.toLowerCase())
    out.push(word)
  }
  return out
}
