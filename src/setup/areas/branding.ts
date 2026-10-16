import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const brandingArea = flatArea({
  id: 'branding',
  label: 'Branding',
  emoji: '🎨',
  description: 'How the web dashboard looks: name, tagline, logo, accent colour and login text.',
  specs: (): FieldSpec[] => [
    { kind: 'text', key: 'name', label: 'Dashboard name', maxLength: 40, optional: true, placeholder: 'Bridge Dashboard' },
    { kind: 'text', key: 'tagline', label: 'Tagline', maxLength: 80, optional: true },
    { kind: 'text', key: 'logoUrl', label: 'Logo URL (https)', maxLength: 500, optional: true, placeholder: 'https://…/logo.png' },
    { kind: 'text', key: 'accent', label: 'Accent colour (hex)', maxLength: 7, optional: true, placeholder: '#8b5cf6' },
    { kind: 'text', key: 'loginText', label: 'Login page text', maxLength: 300, optional: true, paragraph: true }
  ]
})
