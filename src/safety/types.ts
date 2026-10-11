export type Category = 'slurs' | 'profanity' | 'links' | 'advertising' | 'personalInfo'
export type BlockReason = Category | 'custom'

export interface SafetySettings {
  categories: Record<Category, boolean>
  blockedWords: string[]
  allowedWords: string[]
}

export const DEFAULT_SAFETY: SafetySettings = {
  categories: { slurs: true, profanity: true, links: true, advertising: true, personalInfo: true },
  blockedWords: [],
  allowedWords: []
}
