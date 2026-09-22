/**
 * Liquid passes keyword arguments as `[key, value]` pairs among the positional
 * ones. Filters that take only keywords read them through here, so a stray
 * positional argument is ignored rather than crashing the render.
 */
export function keywords(args: unknown[]): Map<string, unknown> {
  return new Map(args.filter(arg => Array.isArray(arg) && arg.length === 2) as Array<[string, unknown]>)
}
