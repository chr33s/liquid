import { defineConfig } from 'rolldown'
import replace from '@rollup/plugin-replace'
import { createRequire } from 'module'

const pkg = createRequire(import.meta.url)('./package.json')
const version = process.env.VERSION || pkg.version
const sourcemap = true
const banner = `/*
 * liquidjs@${version}, https://github.com/harttle/liquidjs
 * (c) 2016-${new Date().getFullYear()} harttle
 * Released under the MIT License.
 */`
const treeshake = {
  propertyReadSideEffects: false
}
const transform = {
  target: 'es2020'
}
const input = './src/index.ts'
const versionInjection = replace({
  include: './src/index.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: {
    '[VI]{version}[/VI]': version
  }
})
const browserFS = {
  include: './src/liquid-options.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: {
    './fs/fs-impl': './build/fs-impl-browser'
  }
}
const browserBase64 = {
  include: './src/filters/base64.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: {
    './base64-impl': '../build/base64-impl-browser'
  }
}
const browserCrypto = {
  include: './src/filters/crypto.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: {
    './crypto-impl': '../build/crypto-impl-browser'
  }
}
const browserStream = {
  include: './src/emitters/index.ts',
  delimiters: ['', ''],
  preventAssignment: true,
  values: {
    './streamed-emitter': '../build/streamed-emitter-browser'
  }
}
const browserShims = [replace(browserFS), replace(browserBase64), replace(browserCrypto), replace(browserStream)]

const nodeEsm = {
  output: {
    file: 'dist/liquid.node.mjs',
    format: 'esm',
    banner
  },
  external: ['path', 'fs', 'stream', 'crypto', 'module'],
  plugins: [versionInjection],
  transform,
  treeshake,
  input
}

const browserEsm = {
  output: {
    file: 'dist/liquid.browser.mjs',
    format: 'esm',
    banner
  },
  external: ['path', 'fs'],
  plugins: [versionInjection, ...browserShims],
  transform,
  treeshake,
  input
}

const browserUmd = {
  output: {
    file: 'dist/liquid.browser.umd.js',
    name: 'liquidjs',
    format: 'umd',
    sourcemap,
    banner
  },
  plugins: [versionInjection, ...browserShims],
  transform,
  treeshake,
  input
}

const browserMin = {
  output: {
    file: 'dist/liquid.browser.min.js',
    name: 'liquidjs',
    format: 'umd',
    sourcemap,
    banner,
    minify: true
  },
  plugins: [versionInjection, ...browserShims],
  transform,
  treeshake,
  input
}

const cli = {
  output: {
    file: 'dist/liquid.cli.mjs',
    format: 'esm',
    banner: `#!/usr/bin/env node\n${banner}`,
    paths: id => (/(^|\/)index$/.test(id) ? './liquid.node.mjs' : id)
  },
  external: id => id === './index' || id === 'commander' || id === 'fs/promises',
  transform,
  treeshake,
  input: './src/cli.ts'
}

const bundles = []
const env = process.env.BUNDLES || ''
if (env.includes('esm')) bundles.push(nodeEsm, browserEsm)
if (env.includes('umd')) bundles.push(browserUmd)
if (env.includes('min')) bundles.push(browserMin)
if (env.includes('cli')) bundles.push(cli)
if (bundles.length === 0) bundles.push(nodeEsm, browserEsm, browserUmd, browserMin, cli)

export default defineConfig(bundles)
