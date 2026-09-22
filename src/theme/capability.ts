export type CapabilityStatus = 'implemented' | 'provider_required' | 'unsupported'

export interface CapabilityReport {
  name: string
  status: CapabilityStatus
  detail?: string
}

/**
 * Records what a render could and could not do. A capability backed by no
 * provider is reported here rather than quietly producing empty output.
 */
export class CapabilityLog {
  private readonly entries = new Map<string, CapabilityReport>()

  public record(name: string, status: CapabilityStatus, detail?: string): void {
    this.entries.set(`${name}:${status}`, { name, status, detail })
  }

  public get reports(): CapabilityReport[] {
    return [...this.entries.values()]
  }

  public get missing(): CapabilityReport[] {
    return this.reports.filter(report => report.status !== 'implemented')
  }
}

export class MissingCapabilityError extends Error {
  public readonly capability: string
  public constructor(capability: string, detail: string) {
    super(`unsupported capability "${capability}": ${detail}`)
    this.name = 'MissingCapabilityError'
    this.capability = capability
  }
}

export function requireProvider<T>(value: T | undefined, capability: string, detail: string, log?: CapabilityLog): T {
  if (value === undefined || value === null) {
    log?.record(capability, 'provider_required', detail)
    throw new MissingCapabilityError(capability, detail)
  }
  log?.record(capability, 'implemented')
  return value
}
