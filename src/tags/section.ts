import { Liquid, Tag, Emitter, TagToken, TopLevelToken, Context, Template, evalToken } from '..'
import { Parser } from '../parser'
import { assert, stringify, toValue } from '../util'
import { escape } from '../filters/html'
import { isHosted, type SectionDefinition, type SectionGroup, type ThemeBlock } from '../theme'
import { ValueToken } from '../tokens'
import Schema from './schema'
import type { Arguments } from '../template'

/**
 * `{% section 'name' %}` renders a section file with its own identity and
 * settings, in an isolated scope, inside the wrapper the platform emits.
 */
export default class extends Tag {
  private target: ValueToken
  private currentFile?: string

  constructor(tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(tagToken, remainTokens, liquid)
    assert(isHosted(liquid.options.profile), 'section is only available in the shopify_theme profile')
    const name = this.tokenizer.readValue()
    assert(name, () => `illegal tag: ${tagToken.getText()}`)
    this.target = name!
    this.currentFile = tagToken.file
  }

  *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const type = stringify(toValue(yield evalToken(this.target, ctx)))
    yield* renderSection(this.liquid, ctx, emitter, { type, id: type }, this.currentFile)
  }

  public *arguments(): Arguments {
    yield this.target
  }
}

export function* renderSection(
  liquid: Liquid,
  ctx: Context,
  emitter: Emitter,
  definition: SectionDefinition,
  currentFile?: string
): Generator<unknown, void, unknown> {
  if (definition.disabled) return
  ctx.depthLimit.use(1)
  try {
    const id = definition.id ?? definition.type
    const templates = (yield liquid._parsePartialFile(
      `sections/${definition.type}`,

      currentFile,
      ctx.operationOptions
    )) as Template[]

    const schema = schemaOf(templates)
    const blockSchemas = Array.isArray(schema.blocks) ? (schema.blocks as Record<string, unknown>[]) : []
    const childCtx = ctx.spawn()
    childCtx.theme = { ...ctx.theme, blocks: definition.blocks ?? [] }
    const section = {
      id,
      type: definition.type,
      settings: { ...settingDefaults(schema.settings), ...definition.settings },
      blocks: (definition.blocks ?? []).map((block, index) =>
        toBlockObject(block, index, settingDefaults(blockSchemas.find(({ type }) => type === block.type)?.settings))
      ),
      location: 'template'
    }
    childCtx.globals = Object.create(Object.getPrototypeOf(childCtx.globals), {
      ...Object.getOwnPropertyDescriptors(childCtx.globals),
      section: { value: section, enumerable: true, configurable: true, writable: true }
    })
    yield emitter.write(`<div id="shopify-section-${escape.call(undefined as never, id)}" class="shopify-section">`)
    try {
      yield liquid.renderer.renderTemplates(templates, childCtx, emitter)
    } finally {
      yield emitter.write('</div>')
    }
  } finally {
    ctx.depthLimit.release(1)
  }
}

export function toBlockObject(
  block: ThemeBlock,
  index = 0,
  defaults: Record<string, unknown> = {}
): Record<string, unknown> {
  const id = block.id ?? `${block.type}-${index}`
  return {
    id,
    type: block.type,
    settings: { ...defaults, ...block.settings },
    blocks: (block.blocks ?? []).map((child, i) => toBlockObject(child, i)),
    shopify_attributes: `data-block-id="${escape.call(undefined as never, id)}"`
  }
}

/** The `{% schema %}` of a section or block file. */
export function schemaOf(templates: Template[]): Record<string, unknown> {
  return templates.find((template): template is Schema => template instanceof Schema)?.schema ?? {}
}

/** A setting the platform does not set takes the `default` its schema declares. */
export function settingDefaults(settings: unknown): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const setting of Array.isArray(settings) ? settings : []) {
    if (typeof setting?.id === 'string' && 'default' in setting) defaults[setting.id] = setting.default
  }
  return defaults
}

export function groupOrder(group: SectionGroup): string[] {
  if (group.order) return group.order
  return Object.keys(group.sections ?? {})
}
