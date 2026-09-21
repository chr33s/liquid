import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.local/wiki')
const src = path.join(root, 'docs/source')
const sections = ['tutorials', 'filters', 'tags']
const required = [
  'Home.md',
  '_Sidebar.md',
  'Document.Tutorials.md',
  'Document.Tags.md',
  'Document.Filters.md',
  'Document.CHANGELOG.md'
]
const unsafeInPageName = /[<>#?[\]\\:*|"]/
const errors: string[] = []

function fail(message: string) {
  errors.push(message)
}

if (!fs.existsSync(out)) {
  fail(`missing output directory ${path.relative(root, out)}; run "npm run build:apidoc" first`)
} else {
  const pages = fs.readdirSync(out).filter(name => name.endsWith('.md'))

  for (const name of required) {
    if (!pages.includes(name)) fail(`missing expected page ${name}`)
  }

  const byLowerCase = new Map<string, string[]>()
  for (const name of pages) {
    const key = name.toLowerCase()
    byLowerCase.set(key, [...(byLowerCase.get(key) ?? []), name])
    if (unsafeInPageName.test(name)) fail(`page name is not wiki safe: ${name}`)
  }
  for (const [, names] of byLowerCase) {
    if (names.length > 1) fail(`page names collide on a case-insensitive wiki: ${names.join(', ')}`)
  }

  const headings = new Map<string, Set<string>>()
  const contents = new Map<string, string>()
  for (const name of pages) {
    const text = fs.readFileSync(path.join(out, name), 'utf8')
    contents.set(name, text)
    const anchors = new Set<string>()
    for (const line of stripFences(text)) {
      const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line)
      if (heading) anchors.add(slug(heading[1]))
    }
    for (const explicit of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(explicit[1].toLowerCase())
    headings.set(name, anchors)
  }

  for (const [name, text] of contents) {
    for (const link of text.matchAll(/\]\(\.\.\/wiki\/([^)]*)\)/g)) {
      const [target, anchor] = link[1].split('#')
      if (!target) {
        fail(`${name}: link has no target page: ../wiki/${link[1]}`)
        continue
      }
      const page = `${decodeURI(target)}.md`
      if (!pages.includes(page)) {
        fail(`${name}: link to unknown page ${target}`)
        continue
      }
      if (anchor && !headings.get(page)!.has(anchor)) fail(`${name}: link to unknown anchor ${target}#${anchor}`)
    }
    for (const link of text.matchAll(/<a\s+href="#([^"]+)"/g)) {
      if (!headings.get(name)!.has(link[1])) fail(`${name}: same page link to unknown anchor #${link[1]}`)
    }
    for (const link of text.matchAll(/\]\((?!https?:|\.\.\/wiki\/|#)([^)]+)\)/g)) {
      fail(`${name}: link was not rewritten for the wiki: ${link[1]}`)
    }
  }

  const pointers = fs.readFileSync(path.join(root, 'docs/llms.txt'), 'utf8')
  for (const pointer of pointers.matchAll(/https:\/\/github\.com\/chr33s\/liquid\/wiki\/([^)\s]+)/g)) {
    if (!pages.includes(`${pointer[1]}.md`)) fail(`docs/llms.txt: points at unknown wiki page ${pointer[1]}`)
  }

  const documents = pages.filter(name => /(^|\.)Document\./.test(name)).length
  const authored = sections.reduce(
    (total, dir) => total + fs.readdirSync(path.join(src, dir)).filter(n => n.endsWith('.md')).length,
    0
  )
  if (documents !== authored + 1) {
    fail(`rendered ${documents} documents but docs/source holds ${authored} and CHANGELOG.md adds one more`)
  }
}

for (const dir of sections) {
  for (const name of fs.readdirSync(path.join(src, dir))) {
    if (!name.endsWith('.md')) continue
    const file = `${dir}/${name}`
    const lines = stripFences(fs.readFileSync(path.join(src, dir, name), 'utf8'))
    lines.forEach((line, index) => {
      const at = `${file}:${index + 1}`
      if (/\{%-?\s*(note|endnote|since|endsince)\b/.test(line)) fail(`${at}: unconverted Hexo tag`)
      if (/\{%-?\s*raw\s*-?%\}.*\{%-?\s*endraw\s*-?%\}/.test(line)) fail(`${at}: Hexo raw wrapper in prose`)
      if (/\]\((?!https?:)[^)]*\.html[)#]/.test(line)) fail(`${at}: link to a generated HTML page`)
    })
  }
}

if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`)
  console.error(`check:docs found ${errors.length} problem(s)`)
  process.exit(1)
}
console.log('check:docs passed')

function stripFences(text: string) {
  const lines = text.split('\n')
  const kept: string[] = []
  let fence: string | null = null
  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (marker && line.trim().startsWith(fence)) fence = null
      kept.push('')
      continue
    }
    if (marker) {
      fence = marker[1]
      kept.push('')
      continue
    }
    kept.push(line)
  }
  return kept
}

function slug(heading: string) {
  return heading
    .replace(/<[^>]*>/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}
