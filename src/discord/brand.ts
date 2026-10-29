import { repository, version } from '../../package.json'

export const PROJECT_NAME = 'Hypixel Chat Bridge'
export const PROJECT_VERSION = version

/** Normalize package.json's `repository.url` (e.g. "git+https://…/repo.git") to a browsable https URL. */
function repoUrl(): string {
  const raw = typeof repository === 'string' ? repository : (repository?.url ?? '')
  const https = raw
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
  return https || 'https://github.com/treeot/hypixel-chat-bridge'
}

/** Single source of truth: derived from package.json so a fork only updates one place. */
export const PROJECT_URL = repoUrl()

export function footer(text?: string): { text: string } {
  return { text: text ?? PROJECT_NAME }
}
