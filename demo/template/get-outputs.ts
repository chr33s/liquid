import { Output, Tag, toPromise } from '@chr33s/liquid'
import type { Template } from '@chr33s/liquid'
import { isLayoutTag, isIfTag, isUnlessTag, isLiquidTag, isCaseTag, isCaptureTag, isTablerowTag, isForTag } from './type-guards.ts'

/**
 * iterate over all `{{ output }}`
 */
export async function * getOutputs (templates: Template[]): AsyncGenerator<Output, void> {
  for (const template of templates) {
    if (template instanceof Tag) {
      if (isIfTag(template) || isUnlessTag(template) || isCaseTag(template)) {
        for (const branch of template.branches) {
          yield * getOutputs(branch.templates)
        }
        yield * getOutputs(template.elseTemplates ?? [])
      } else if (isForTag(template)) {
        yield * getOutputs(template.templates)
        yield * getOutputs(template.elseTemplates ?? [])
      } else if (isLayoutTag(template)) {
        yield * getOutputs(await toPromise(template.children(false)))
      } else if (isLiquidTag(template) || isCaptureTag(template) || isTablerowTag(template)) {
        yield * getOutputs(template.templates)
      }
    } else if (template instanceof Output) {
      yield template
    }
  }
}
