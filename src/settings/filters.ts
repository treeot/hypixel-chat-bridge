import { z } from 'zod'
import { DEFAULT_SAFETY, type Category, type SafetySettings } from '../safety'
import { objectModel, wordList } from './schema'

export const FILTER_CATEGORIES = ['slurs', 'profanity', 'links', 'advertising', 'personalInfo'] as const satisfies readonly Category[]

export const FILTER_LABELS: Record<Category, string> = {
  slurs: 'Block slurs',
  profanity: 'Block profanity',
  links: 'Strip links',
  advertising: 'Block advertising',
  personalInfo: 'Block personal info'
}

const schema = z.strictObject({
  categories: z.strictObject({
    slurs: z.boolean(),
    profanity: z.boolean(),
    links: z.boolean(),
    advertising: z.boolean(),
    personalInfo: z.boolean()
  }),
  blockedWords: wordList,
  allowedWords: wordList
})
export type FiltersSettings = SafetySettings
export const filtersSettings = objectModel<FiltersSettings>('filters', schema, DEFAULT_SAFETY)
