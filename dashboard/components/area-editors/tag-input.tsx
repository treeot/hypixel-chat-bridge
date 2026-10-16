'use client'

import { useId, useState } from 'react'
import { addWords } from '@/lib/word-list'

/** A word list as chips: type a word and press Enter (or paste a comma-separated list); × removes one. */
export function TagInput({
  name,
  label,
  words,
  onChange,
  readOnly,
  issues,
  max = 100
}: {
  name: string
  label: string
  words: string[]
  onChange: (next: string[]) => void
  readOnly: boolean
  issues: Record<string, string[]>
  max?: number
}) {
  const [draft, setDraft] = useState('')
  const countId = useId()
  const commit = () => {
    if (!draft.trim()) return
    onChange(addWords(words, draft))
    setDraft('')
  }
  return (
    <div className="grid gap-2">
      {words.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {words.map((word, i) => {
            const bad = (issues[`${name}.${i}`]?.length ?? 0) > 0
            return (
              <li
                key={`${word}-${i}`}
                className={`badge h-6 gap-1 text-[12px] ${bad ? 'badge-danger' : 'text-foreground'}`}
                title={issues[`${name}.${i}`]?.join(' ')}
              >
                {word}
                {!readOnly && (
                  <button
                    type="button"
                    className="-mr-0.5 rounded px-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${word}`}
                    onClick={() => onChange(words.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!readOnly && (
        <input
          className="input"
          name={`${name}-new`}
          aria-label={`Add to ${label.toLowerCase()}`}
          aria-describedby={countId}
          placeholder="Type a word and press Enter"
          value={draft}
          disabled={words.length >= max}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Backspace' && draft === '' && words.length) onChange(words.slice(0, -1))
          }}
        />
      )}
      <p id={countId} className="text-xs text-muted-foreground">
        {words.length === 0 && readOnly ? 'None.' : `${words.length} of ${max} words.`}
      </p>
    </div>
  )
}
