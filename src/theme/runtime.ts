import type { Emitter } from '../emitters'
import type { Context } from '../context'
import type { Liquid } from '../liquid'
import type { Template } from '../template'
import { isHosted } from './profile'
import { isMissing } from '../fs/fs'

function selectsLayout(tpl: Template): boolean {
  return (tpl.token as { name?: string } | undefined)?.name === 'layout'
}

/** The layout a hosted theme uses when a template selects none itself. */
export const DEFAULT_THEME_LAYOUT = 'theme'

/**
 * In the hosted profile a template with no `{% layout %}` of its own renders
 * through the theme's default layout, reaching it as `content_for_layout`.
 */
export function* renderThemeTemplates(
  liquid: Liquid,
  templates: Template[],
  ctx: Context,
  emitter?: Emitter
): Generator<unknown, string, unknown> {
  if (!isHosted(ctx.opts.profile) || templates.some(selectsLayout)) {
    return (yield liquid.renderer.renderTemplates(templates, ctx, emitter)) as string
  }

  let layout: Template[]
  try {
    layout = (yield liquid._parseLayoutFile(DEFAULT_THEME_LAYOUT, undefined, ctx.operationOptions)) as Template[]
  } catch (e) {
    ctx.operation.check()
    // a theme that has no reachable default layout renders un-wrapped; a layout
    // that exists but does not parse is a real failure and must surface
    if (!isMissing(e)) throw e
    ctx.capabilities.record('layout.theme', 'provider_required', 'no default theme layout was found')
    return (yield liquid.renderer.renderTemplates(templates, ctx, emitter)) as string
  }

  const content = yield liquid.renderer.renderTemplates(templates, ctx)
  ctx.push({ content_for_layout: content })
  try {
    return (yield liquid.renderer.renderTemplates(layout, ctx, emitter)) as string
  } finally {
    ctx.pop()
  }
}
