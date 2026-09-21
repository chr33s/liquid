import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.local/wiki')
const checkout = path.join(root, '.local/wiki-checkout')
const manifestName = '.generated-pages.json'
const dryRun = process.argv.includes('--dry-run')

const remote = process.env.WIKI_REMOTE ?? 'https://github.com/chr33s/liquid.wiki.git'
const sha = process.env.GITHUB_SHA ?? git(root, 'rev-parse', 'HEAD')
const authenticated = process.env.GITHUB_TOKEN
  ? remote.replace('https://', `https://x-access-token:${process.env.GITHUB_TOKEN}@`)
  : remote

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
}

if (!fs.existsSync(out)) {
  console.error('error: nothing to publish; run "npm run build:docs" first')
  process.exit(1)
}

const generated = fs
  .readdirSync(out)
  .filter(name => fs.statSync(path.join(out, name)).isFile())
  .sort()

fs.rmSync(checkout, { recursive: true, force: true })
git(root, 'clone', '--depth', '1', authenticated, checkout)

const branch = git(checkout, 'symbolic-ref', '--short', 'HEAD')
const owned: string[] = fs.existsSync(path.join(checkout, manifestName))
  ? JSON.parse(fs.readFileSync(path.join(checkout, manifestName), 'utf8'))
  : []

const collisions = generated.filter(name => !owned.includes(name) && fs.existsSync(path.join(checkout, name)))
if (collisions.length) {
  console.error(`error: the wiki already holds pages this build does not own: ${collisions.join(', ')}`)
  console.error('error: import or rename them before publishing')
  process.exit(1)
}

for (const name of owned) {
  if (!generated.includes(name)) fs.rmSync(path.join(checkout, name), { force: true })
}
for (const name of generated) {
  fs.copyFileSync(path.join(out, name), path.join(checkout, name))
}
fs.writeFileSync(path.join(checkout, manifestName), JSON.stringify(generated, null, 2) + '\n')

git(checkout, 'add', '--all')
const pending = git(checkout, 'status', '--porcelain')
if (!pending) {
  console.log(`wiki already matches ${sha}; nothing to publish`)
  process.exit(0)
}

if (dryRun) {
  console.log(`would publish ${generated.length} pages to ${remote} (${branch}):`)
  console.log(pending)
  process.exit(0)
}

git(
  checkout,
  '-c',
  'user.name=github-actions[bot]',
  '-c',
  'user.email=41898282+github-actions[bot]@users.noreply.github.com',
  '-c',
  'commit.gpgsign=false',
  'commit',
  '-m',
  `docs: publish wiki from ${sha}`
)
git(checkout, 'push', 'origin', `HEAD:${branch}`)
console.log(`published ${generated.length} pages to ${remote} (${branch}) from ${sha}`)
