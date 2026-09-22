import fs from 'fs'
import path from 'path'
import { buildCompatibilityManifest, unimplementedFilters } from '../dist/liquid.node.mjs'

const root = path.resolve(import.meta.dirname, '..')
const manifest = buildCompatibilityManifest()
const pending = unimplementedFilters()

const output = {
  generated_at: new Date().toISOString().slice(0, 10),
  package_version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  ...manifest,
  unresolved: {
    filters_without_implementation: pending,
    hosted_runtime_revision: manifest.sources.hosted.runtimeRevision,
    note: 'Provider-required names are implemented but answer only when the matching provider is configured. No hosted conformance run against a Shopify runtime is claimed.'
  }
}

fs.writeFileSync(path.join(root, 'liquid-compatibility-manifest.json'), JSON.stringify(output, null, 2) + '\n')
console.log(
  `compat manifest: ${manifest.counts.coreFilters} core filters, ${manifest.counts.hostedOnlyFilters} hosted-only, ` +
    `${manifest.counts.tags} tags, ${manifest.counts.providerRequired} provider-required, ${pending.length} unimplemented`
)
