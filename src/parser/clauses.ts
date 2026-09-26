import { assert, assertEmpty } from '../util'
import type { Template } from '../template'
import type { TagToken, TopLevelToken } from '../tokens'
import type { Parser } from './parser'

export interface ClauseParser {
  parser: Parser
  remainTokens: TopLevelToken[]
  tagToken: TagToken
  end: string
  strictEnd?: boolean
  initial: () => Template[]
  branch?: {
    name: string
    afterElse: 'reject' | 'drop'
    open: (token: TagToken) => Template[]
  }
  else?: {
    policy: 'reject' | 'switch' | 'first'
    strict?: boolean
    open: (token: TagToken) => Template[]
  }
}

export function parseClauses(spec: ClauseParser) {
  let bucket: Template[] = []
  let elseCount = 0
  const stream = spec.parser.parseStream(spec.remainTokens)
  stream.on('start', () => {
    bucket = spec.initial()
  })
  if (spec.branch) {
    const branch = spec.branch
    stream.on(`tag:${branch.name}`, (token: TagToken) => {
      if (elseCount > 0) {
        if (branch.afterElse === 'reject') assert(false, `unexpected ${branch.name} after else`)
        bucket = []
        return
      }
      bucket = branch.open(token)
    })
  }
  if (spec.else) {
    const clause = spec.else
    stream.on('tag:else', (token: TagToken) => {
      if (clause.strict) assertEmpty(token.args)
      elseCount++
      if (clause.policy === 'reject') {
        assert(elseCount === 1, 'duplicated else')
        bucket = clause.open(token)
        return
      }
      if (clause.policy === 'switch' || elseCount === 1) bucket = clause.open(token)
    })
  }
  stream.on(`tag:${spec.end}`, (token: TagToken) => {
    if (spec.strictEnd) assertEmpty(token.args)
    stream.stop()
  })
  stream.on('template', (template: Template) => {
    if (spec.else?.policy === 'first' && elseCount > 1) return
    bucket.push(template)
  })
  stream.on('end', () => {
    throw new Error(`tag ${spec.tagToken.getText()} not closed`)
  })
  stream.start()
}
