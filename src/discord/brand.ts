export const PROJECT_NAME = 'Hypixel Chat Bridge'
export const PROJECT_URL = 'https://github.com/treeot/hypixel-chat-bridge'

export function footer(text?: string): { text: string } {
  return { text: text ?? PROJECT_NAME }
}
