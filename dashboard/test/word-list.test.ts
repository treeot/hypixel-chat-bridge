import { describe, expect, it } from 'vitest'
import { addWords } from '@/lib/word-list'

describe('addWords', () => {
  it('adds a trimmed word', () => expect(addWords(['a'], '  bad ')).toEqual(['a', 'bad']))
  it('splits pasted lists on commas and new lines', () => expect(addWords([], 'one, two\nthree')).toEqual(['one', 'two', 'three']))
  it('skips blanks and words already there, ignoring case', () => expect(addWords(['Spam'], 'spam, ,eggs, EGGS')).toEqual(['Spam', 'eggs']))
  it('keeps phrases with inner spaces', () => expect(addWords([], 'free coins')).toEqual(['free coins']))
})
