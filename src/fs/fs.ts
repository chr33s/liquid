import type { OperationOptions } from '../util/operation'

export interface FileReadOptions extends OperationOptions {
  tenant?: string
  sourceByteLimit?: number
  sourceCodeUnitLimit?: number
}

export interface FS {
  exists: (filepath: string, options?: OperationOptions) => boolean | Promise<boolean>
  readFile: (filepath: string, options?: FileReadOptions) => string | Promise<string>
  resolve: (dir: string, file: string, ext: string) => string
  contains?: (root: string, file: string, options?: OperationOptions) => boolean | Promise<boolean>
  sep?: string
  dirname?: (file: string) => string
  fallback?: (file: string) => string | undefined
}

export function isMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
