import { readFileSync, writeFileSync } from 'node:fs'
import { renderCommandsMd } from './docs/commands'
import { renderConfigurationMd, renderEnvExample } from './docs/configuration'

export interface GeneratedFile {
  path: string
  render: () => string
}

export const GENERATED: GeneratedFile[] = [
  { path: 'docs/configuration.md', render: renderConfigurationMd },
  { path: '.env.example', render: renderEnvExample },
  { path: 'docs/commands.md', render: renderCommandsMd }
]

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

export function staleFiles(): string[] {
  return GENERATED.filter(f => read(f.path) !== f.render()).map(f => f.path)
}

function main(): void {
  if (process.argv.includes('--check')) {
    const stale = staleFiles()
    if (stale.length > 0) {
      console.error(`Generated docs are out of date: ${stale.join(', ')}\nRun: npm run docs:gen`)
      process.exit(1)
    }
    console.log('Generated docs are up to date.')
    return
  }
  for (const f of GENERATED) writeFileSync(f.path, f.render())
  console.log(`Wrote ${GENERATED.map(f => f.path).join(', ')}`)
}

if (require.main === module) {
  main()
}
