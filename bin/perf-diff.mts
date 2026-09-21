import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const { name } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string }

const fileLocal = path.join(root, 'dist/liquid.node.mjs')
const cacheDir = path.join(root, '.local/perf')

function publishedVersion() {
  try {
    return execSync(`npm view ${name} version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

// Published bundle layout differs across major versions: ESM since v11, CJS before.
function download(version: string) {
  for (const [bundle, ext] of [
    ['liquid.node.mjs', 'mjs'],
    ['liquid.node.js', 'cjs']
  ]) {
    const file = path.join(cacheDir, `liquid.node.${version}.${ext}`)
    if (fs.existsSync(file)) return file
    const url = `https://unpkg.com/${name}@${version}/dist/${bundle}`
    try {
      execSync(`curl -fsSL -o "${file}" "${url}"`, { stdio: 'ignore' })
      return file
    } catch {
      fs.rmSync(file, { force: true })
    }
  }
  return ''
}

const version = publishedVersion()
if (!version) {
  console.log(`No published release of ${name} to compare against, skipping.`)
  process.exit(0)
}

fs.mkdirSync(cacheDir, { recursive: true })
console.log(`Downloading ${name}@${version}...`)
const fileLatest = download(version)
if (!fileLatest) {
  console.log(`Could not fetch a baseline bundle for ${name}@${version}, skipping.`)
  process.exit(0)
}

execSync(`node benchmark/diff.js "${fileLocal}" "${fileLatest}"`, { cwd: root, stdio: 'inherit' })
