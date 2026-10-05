import {
  emptyOverrides,
  mergeOverride,
  OVERRIDABLE_AREAS,
  overrideDocId,
  overrideSchema,
  readOverride,
  type OverridableArea,
  type OverrideOf,
  type Overrides
} from './overrides'
import { AREA_IDS, SETTINGS, type AllSettings, type AreaId, type SettingsOf } from './registry'
import { formatIssues, type SettingsModel } from './schema'

/** The slice of `InfoRepository` the store needs. `set()` must invalidate the read cache. */
export interface InfoLike {
  get(type: string): Promise<Record<string, unknown> | null>
  set(type: string, value: Record<string, unknown>): Promise<void>
}

export class SettingsValidationError extends Error {
  constructor(
    readonly area: AreaId,
    readonly issues: string[]
  ) {
    super(`Invalid ${area} settings: ${issues.join('; ')}`)
    this.name = 'SettingsValidationError'
  }
}

function model<K extends AreaId>(area: K): SettingsModel<SettingsOf<K>> {
  return SETTINGS[area] as unknown as SettingsModel<SettingsOf<K>>
}

/** Every write passes the area's strict zod schema; reads are tolerant. */
export class SettingsStore {
  constructor(private readonly info: InfoLike) {}

  async read<K extends AreaId>(area: K): Promise<SettingsOf<K>> {
    const m = model(area)
    return m.read(await this.info.get(m.doc))
  }

  async readAll(): Promise<AllSettings> {
    const entries = await Promise.all(AREA_IDS.map(async id => [id, await this.read(id)] as const))
    return Object.fromEntries(entries) as AllSettings
  }

  validate<K extends AreaId>(area: K, value: unknown): { ok: true; value: SettingsOf<K> } | { ok: false; issues: string[] } {
    const parsed = model(area).schema.safeParse(value)
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: formatIssues(parsed.error) }
  }

  async write<K extends AreaId>(area: K, value: unknown): Promise<SettingsOf<K>> {
    const result = this.validate(area, value)
    if (!result.ok) throw new SettingsValidationError(area, result.issues)
    const m = model(area)
    await this.info.set(m.doc, m.toDoc ? m.toDoc(result.value) : (result.value as Record<string, unknown>))
    return result.value
  }

  async writeMany(settings: Partial<AllSettings>): Promise<AreaId[]> {
    const areas = AREA_IDS.filter(id => settings[id] !== undefined)
    for (const area of areas) {
      const result = this.validate(area, settings[area])
      if (!result.ok) throw new SettingsValidationError(area, result.issues)
    }
    for (const area of areas) await this.write(area, settings[area])
    return areas
  }

  async readOverride<K extends OverridableArea>(area: K, accountId: number): Promise<OverrideOf<K>> {
    return readOverride(area, await this.info.get(overrideDocId(area, accountId)))
  }

  async readOverrides(accountIds: readonly number[]): Promise<Overrides> {
    const out = emptyOverrides()
    for (const area of OVERRIDABLE_AREAS) {
      for (const id of accountIds) {
        const override = await this.readOverride(area, id)
        if (Object.keys(override).length) (out[area] as Record<string, unknown>)[String(id)] = override
      }
    }
    return out
  }

  async readEffective<K extends OverridableArea>(area: K, accountId: number): Promise<SettingsOf<K>> {
    return mergeOverride(await this.read(area), await this.readOverride(area, accountId))
  }

  /** Replace one account's override doc; `{}` means "use the shared settings". */
  async writeOverride<K extends OverridableArea>(area: K, accountId: number, value: unknown): Promise<OverrideOf<K>> {
    const parsed = overrideSchema(area).safeParse(value)
    if (!parsed.success) throw new SettingsValidationError(area, formatIssues(parsed.error))
    await this.info.set(overrideDocId(area, accountId), parsed.data as Record<string, unknown>)
    return parsed.data
  }
}
