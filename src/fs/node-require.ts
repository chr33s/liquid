import { createRequire } from 'module'

export function requireResolve(file: string): string {
  const require = createRequire(process.cwd() + '/')
  return require.resolve(file)
}
