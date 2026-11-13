import { checkHypixelKey } from './hypixel'

export type HypixelKeyType = 'personal' | 'guild'

type Classifier = (key: string) => ReturnType<typeof checkHypixelKey>

/** Remembers whether each Hypixel API key is a personal or guild-scoped key. Keys Hypixel rejects are not recorded. */
export class HypixelKeyRegistry {
  private readonly types = new Map<string, HypixelKeyType>()
  private readonly reasons = new Map<string, string>()

  constructor(private readonly classifier: Classifier = checkHypixelKey) {}

  /** Probes each key once and records the type of those that work. */
  async classify(keys: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(keys)].map(async key => {
        const result = await this.classifier(key)
        if (result.ok) this.types.set(key, result.type)
        else this.reasons.set(key, result.reason)
      })
    )
  }

  typeOf(key: string): HypixelKeyType | undefined {
    return this.types.get(key)
  }

  /** Why the key was rejected (never contains the key itself). */
  reasonOf(key: string): string | undefined {
    return this.reasons.get(key)
  }

  firstPersonalKey(): string | undefined {
    for (const [key, type] of this.types) if (type === 'personal') return key
    return undefined
  }
}
