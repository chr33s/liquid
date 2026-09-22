import { FilterImpl } from '../template'
import { stringify } from '../util/underscore'

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;'
}
const unescapeMap: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#34;': '"',
  '&#39;': "'"
}

export function escape(this: FilterImpl, str: string) {
  str = stringify(str)
  return str.replace(/&|<|>|"|'/g, m => escapeMap[m])
}

export function xml_escape(this: FilterImpl, str: string) {
  return escape.call(this, str)
}

function unescape(this: FilterImpl, str: string) {
  str = stringify(str)
  return str.replace(/&(amp|lt|gt|#34|#39);/g, m => unescapeMap[m])
}

export function escape_once(this: FilterImpl, str: string) {
  return escape.call(this, unescape.call(this, str))
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
