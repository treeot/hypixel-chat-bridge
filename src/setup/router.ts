import { ComponentType, MessageFlags, type MessageComponentInteraction, type ModalSubmitInteraction } from 'discord.js'
import type { AreaId } from '../settings/registry'
import { SettingsValidationError } from '../settings/store'
import { isAreaId, SETUP_AREAS } from './areas'
import { notSavedMessage, runEffectSafe, type SetupServices } from './effects'
import { handleHome, homeView } from './home'
import { decodeId, SETUP_PREFIX } from './ids'
import { handleImportButton } from './importFlow'
import type { ModalView, Outcome, PanelView, SetupInput, SetupState } from './types'
import { toModalBuilder, withNotice } from './ui'

export const NOT_OWNER = 'Only the bot owner can change these settings.'
const STALE = 'This panel is out of date. Run /setup panel again.'
const FAILED = '❌ Something went wrong. Nothing else was changed.'
const NO_MENTIONS = { parse: [] as [] }

type Target = AreaId | 'home'
type Result = { view: PanelView } | { error: string }

export type Prepared =
  { kind: 'ignore' } | { kind: 'reply'; content: string } | { kind: 'modal'; modal: ModalView } | { kind: 'update'; run(): Promise<Result> }

function render(target: Target, state: SetupState, scope: string, notice?: string): PanelView {
  return withNotice(target === 'home' ? homeView(state) : SETUP_AREAS[target].view(state, scope), notice)
}

async function execute(
  outcome: Exclude<Outcome, { kind: 'modal' } | { kind: 'error' }>,
  target: Target,
  scope: string,
  state: SetupState,
  services: SetupServices
): Promise<Result> {
  if (outcome.kind === 'view') {
    const next = outcome.area ?? target
    const nextState = next === target ? state : await services.loadState(next)
    return { view: render(next, nextState, outcome.scope ?? scope, outcome.notice) }
  }

  const notices: string[] = []
  if (outcome.kind === 'save') {
    try {
      await services.write(outcome.area, outcome.value, outcome.accountId)
    } catch (error) {
      if (error instanceof SettingsValidationError) return { error: notSavedMessage(error) }
      throw error
    }
    if (outcome.notice) notices.push(outcome.notice)
    for (const effect of outcome.effects ?? []) notices.push(await runEffectSafe(services, effect))
  } else {
    notices.push(await runEffectSafe(services, outcome.effect))
  }
  const fresh = await services.loadState(target)
  return { view: render(target, fresh, outcome.scope ?? scope, notices.join('\n')) }
}

/** The owner gate runs before the id is decoded, so no forged or stale `setup:` id reads or writes anything for anyone else. */
export async function prepareSetup(userId: string, customId: string, input: SetupInput, services: SetupServices): Promise<Prepared> {
  if (!customId.startsWith(`${SETUP_PREFIX}:`)) return { kind: 'ignore' }
  if (!services.ownerId || userId !== services.ownerId) return { kind: 'reply', content: NOT_OWNER }
  const id = decodeId(customId)
  if (!id) return { kind: 'reply', content: STALE }
  if (id.area === 'import') return { kind: 'update', run: () => handleImportButton(id, services) }

  const target: Target | null = id.area === 'home' ? 'home' : isAreaId(id.area) ? id.area : null
  if (!target) return { kind: 'reply', content: STALE }

  const state = await services.loadState(target)
  const outcome = target === 'home' ? handleHome(id, input) : SETUP_AREAS[target].handle(state, id, input)
  if (outcome.kind === 'modal') return { kind: 'modal', modal: outcome.modal }
  if (outcome.kind === 'error') return { kind: 'reply', content: `❌ ${outcome.message}` }
  return { kind: 'update', run: () => execute(outcome, target, id.scope, state, services) }
}

export type SetupInteraction = MessageComponentInteraction | ModalSubmitInteraction

export function toInput(interaction: SetupInteraction): SetupInput {
  if (interaction.isModalSubmit()) {
    const fields: Record<string, string> = {}
    for (const [id, data] of interaction.fields.fields) if (data.type === ComponentType.TextInput) fields[id] = data.value
    return { kind: 'modal', fields }
  }
  if (interaction.isAnySelectMenu()) return { kind: 'select', values: [...interaction.values] }
  return { kind: 'button' }
}

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS }) as const

/** A slow prepare can miss Discord's 3 s first-response window; that rejection must be logged, never left unhandled. */
export async function handleSetupInteraction(interaction: SetupInteraction, services: SetupServices): Promise<void> {
  let prepared: Prepared
  try {
    prepared = await prepareSetup(interaction.user.id, interaction.customId, toInput(interaction), services)
  } catch (error) {
    services.log.error('Setup action failed', error)
    await interaction.reply(ephemeral(FAILED)).catch(() => undefined)
    return
  }
  if (prepared.kind === 'ignore') return
  try {
    switch (prepared.kind) {
      case 'reply':
        await interaction.reply(ephemeral(prepared.content))
        return
      case 'modal':
        // A modal submit cannot open another modal; answer instead of leaving the interaction hanging.
        if (interaction.isModalSubmit()) await interaction.reply(ephemeral(STALE))
        else await interaction.showModal(toModalBuilder(prepared.modal))
        return
      case 'update':
        // Not acknowledged → nothing runs: the owner saw "interaction failed" and expects no change.
        await interaction.deferUpdate()
    }
  } catch (error) {
    services.log.error('Setup response failed', error)
    return
  }
  try {
    const result = await prepared.run()
    if ('error' in result) await interaction.followUp(ephemeral(result.error))
    else await interaction.editReply({ embeds: result.view.embeds, components: result.view.components, allowedMentions: NO_MENTIONS })
  } catch (error) {
    services.log.error('Setup action failed', error)
    await interaction.followUp(ephemeral(FAILED)).catch(() => undefined)
  }
}
