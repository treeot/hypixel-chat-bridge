import { z } from 'zod'
import { objectModel } from './schema'

/** How the web dashboard looks. Every field is optional; the dashboard falls back to its defaults. */
const schema = z.strictObject({
  name: z.string().trim().min(1).max(40).optional(),
  tagline: z.string().trim().min(1).max(80).optional(),
  logoUrl: z
    .string()
    .url()
    .max(500)
    .refine(url => url.startsWith('https://'), 'must be an https URL')
    .optional(),
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'use a hex colour like #8b5cf6')
    .optional(),
  loginText: z.string().trim().min(1).max(300).optional()
})
export type BrandingSettings = z.infer<typeof schema>
export const brandingSettings = objectModel<BrandingSettings>('branding', schema, {})
