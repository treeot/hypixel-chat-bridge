import {
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type APIButtonComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed
} from 'discord.js'
import { encodeId } from './ids'
import type { ModalView, PanelView, Row } from './types'

export const PANEL_COLOR = 0x5865f2
/** Discord rejects a message whose embeds total more than this many characters. */
export const MESSAGE_EMBED_LIMIT = 6000
const NOTICE_COLOR = 0x57f287
const WARNING_COLOR = 0xfee75c

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function panelEmbed(title: string, lines: readonly string[]): APIEmbed {
  return { title: clip(title, 256), description: clip(lines.join('\n') || '​', 4000), color: PANEL_COLOR }
}

export function button(customId: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, disabled = false): APIButtonComponent {
  return new ButtonBuilder().setCustomId(customId).setLabel(clip(label, 80)).setStyle(style).setDisabled(disabled).toJSON()
}

export function row(component: APIComponentInMessageActionRow): Row {
  return { type: ComponentType.ActionRow, components: [component] }
}

export function buttonRow(buttons: readonly APIButtonComponent[]): Row {
  if (buttons.length < 1 || buttons.length > 5) throw new Error(`A button row needs 1-5 buttons, got ${buttons.length}`)
  return { type: ComponentType.ActionRow, components: [...buttons] }
}

export function homeButton(): APIButtonComponent {
  return button(encodeId('home', 'open'), '🏠 Home')
}

function embedChars(embed: APIEmbed): number {
  const fields = (embed.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0)
  return (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0) + (embed.author?.name.length ?? 0) + fields
}

export function withNotice(view: PanelView, notice?: string): PanelView {
  if (!notice) return view
  const color = notice.includes('⚠️') || notice.includes('❌') ? WARNING_COLOR : NOTICE_COLOR
  const room = Math.max(1, MESSAGE_EMBED_LIMIT - view.embeds.reduce((n, e) => n + embedChars(e), 0))
  return { ...view, embeds: [{ description: clip(notice, Math.min(4000, room)), color }, ...view.embeds].slice(0, 10) }
}

export function toModalBuilder(view: ModalView): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(view.customId).setTitle(clip(view.title, 45))
  for (const field of view.fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required)
      .setMaxLength(field.maxLength)
    if (field.value) input.setValue(field.value.slice(0, field.maxLength))
    if (field.placeholder) input.setPlaceholder(clip(field.placeholder, 100))
    modal.addLabelComponents(new LabelBuilder().setLabel(clip(field.label, 45)).setTextInputComponent(input))
  }
  return modal
}
