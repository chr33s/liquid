import { FilterImpl } from '../template'
import { isNil, stringify, toValue } from '../util/underscore'

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escape(this: FilterImpl, str: string) {
  // nil stays nil, so `{% if value | escape %}` stays falsy, as in the reference
  if (isNil(toValue(str))) return str
  str = stringify(str)
  return str.replace(/&|<|>|"|'/g, m => escapeMap[m])
}

export function h(this: FilterImpl, str: string) {
  return escape.call(this, str)
}

export function escape_once(this: FilterImpl, str: string) {
  // escape everything, then restore entities that were already escaped
  return escape.call(this, stringify(str)).replace(/&amp;([a-zA-Z]+|#\d+);/g, '&$1;')
}

export function newline_to_br(this: FilterImpl, v: string) {
  const str = stringify(v)
  return str.replace(/\r?\n/gm, '<br />\n')
}

// The reference removes script, comment and style blocks, then any '<...>'
// that remains; a regex equivalent is O(n^2) in V8 on unclosed openers.
export function strip_html(this: FilterImpl, v: string) {
  const blocks = removeSpans(stringify(v), [
    ['<script', '</script>'],
    ['<!--', '-->'],
    ['<style', '</style>']
  ])
  return removeSpans(blocks, [['<', '>']])
}

/** Remove each leftmost `opener...closer` span, trying the pairs in order. */
function removeSpans(str: string, pairs: [string, string][]) {
  const open = new Map(pairs)
  let out = ''
  let i = 0
  while (i < str.length) {
    const lt = str.indexOf('<', i)
    if (lt < 0) break
    let end = -1
    for (const [opener, closer] of open) {
      if (!str.startsWith(opener, lt)) continue
      const e = str.indexOf(closer, lt + opener.length)
      if (e >= 0) {
        end = e + closer.length
        break
      }
      // no closer after here means none after any later opener either
      open.delete(opener)
    }
    out += str.slice(i, end < 0 ? lt + 1 : lt)
    i = end < 0 ? lt + 1 : end
  }
  return out + str.slice(i)
}
