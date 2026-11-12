import { z } from 'zod'

/** Discord's embed limits (https://discord.com/developers/docs/resources/message#embed-object-embed-limits). */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  total: 6000,
  url: 2048,
  buttonLabel: 80
} as const

/** Room kept in the description for the line about the Apply button. */
export const APPLY_HOW_TO_ROOM = 300

const notBlank = (t: string) => t.trim().length > 0
const text = (max: number) => z.string().max(max, `at most ${max} characters`).refine(notBlank, 'cannot be blank')
const httpsUrl = z
  .string()
  .max(EMBED_LIMITS.url)
  .refine(v => /^https:\/\/\S+$/.test(v), 'must be an https:// link')

const fieldSchema = z.strictObject({
  name: text(EMBED_LIMITS.fieldName),
  value: text(EMBED_LIMITS.fieldValue),
  inline: z.boolean().optional()
})

/** The guild's own Apply message: every part of a Discord embed, all optional. Flat so forms map one key to one input. */
export const applyEmbedSchema = z
  .strictObject({
    authorName: text(EMBED_LIMITS.author).optional(),
    authorIconUrl: httpsUrl.optional(),
    authorUrl: httpsUrl.optional(),
    title: text(EMBED_LIMITS.title).optional(),
    url: httpsUrl.optional(),
    description: text(EMBED_LIMITS.description - APPLY_HOW_TO_ROOM).optional(),
    color: z.number().int().min(0).max(0xffffff).optional(),
    fields: z.array(fieldSchema).max(EMBED_LIMITS.fields, `at most ${EMBED_LIMITS.fields} fields`).optional(),
    imageUrl: httpsUrl.optional(),
    thumbnailUrl: httpsUrl.optional(),
    footerText: text(EMBED_LIMITS.footer).optional(),
    footerIconUrl: httpsUrl.optional(),
    /** The "Press Apply… link with /verify" line under the description. On unless set to false. */
    showHowTo: z.boolean().optional()
  })
  .refine(e => embedLength(e) <= EMBED_LIMITS.total - APPLY_HOW_TO_ROOM, `the whole embed must stay under ${EMBED_LIMITS.total} characters`)

export type ApplyEmbed = z.infer<typeof applyEmbedSchema>

/** Characters Discord counts toward its 6000 total. */
export function embedLength(e: {
  authorName?: string
  title?: string
  description?: string
  footerText?: string
  fields?: ReadonlyArray<{ name: string; value: string }>
}): number {
  const fields = (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0)
  return (e.authorName?.length ?? 0) + (e.title?.length ?? 0) + (e.description?.length ?? 0) + (e.footerText?.length ?? 0) + fields
}
