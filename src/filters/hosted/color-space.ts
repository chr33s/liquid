export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export interface Hsla {
  h: number
  s: number
  l: number
  a: number
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080'
}

/** Parse a hex, rgb(a), hsl(a) or basic named color. Returns undefined when unreadable. */
export function parseColor(input: unknown): Rgba | undefined {
  if (typeof input !== 'string') return undefined
  const value = input.trim().toLowerCase()
  if (!value) return undefined
  const named = NAMED[value]
  if (named) return parseColor(named)

  const hex = /^#?([0-9a-f]{3,8})$/.exec(value)
  if (hex) return parseHex(hex[1])

  const fn = /^(rgba?|hsla?)\s*\(([^)]*)\)$/.exec(value)
  if (!fn) return undefined
  const parts = fn[2].split(/[,/\s]+/).filter(Boolean)
  if (parts.length < 3) return undefined
  const alpha = parts.length > 3 ? clamp(parseNumber(parts[3]), 0, 1) : 1
  if (fn[1].startsWith('rgb')) {
    return {
      r: clamp(Math.round(channel(parts[0], 255)), 0, 255),
      g: clamp(Math.round(channel(parts[1], 255)), 0, 255),
      b: clamp(Math.round(channel(parts[2], 255)), 0, 255),
      a: alpha
    }
  }
  return hslaToRgba({
    h: ((parseNumber(parts[0]) % 360) + 360) % 360,
    s: clamp(channel(parts[1], 100) / 100, 0, 1),
    l: clamp(channel(parts[2], 100) / 100, 0, 1),
    a: alpha
  })
}

function parseHex(digits: string): Rgba | undefined {
  const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16)
  if (digits.length === 3 || digits.length === 4) {
    return {
      r: expand(digits[0]),
      g: expand(digits[1]),
      b: expand(digits[2]),
      a: digits.length === 4 ? expand(digits[3]) / 255 : 1
    }
  }
  if (digits.length === 6 || digits.length === 8) {
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    }
  }
  return undefined
}

function parseNumber(value: string): number {
  const num = parseFloat(value)
  return Number.isNaN(num) ? 0 : num
}

function channel(value: string, full: number): number {
  return value.endsWith('%') ? (parseNumber(value) / 100) * full : parseNumber(value)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function rgbaToHsla({ r, g, b, a }: Rgba): Hsla {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l, a }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return { h, s, l, a }
}

export function hslaToRgba({ h, s, l, a }: Hsla): Rgba {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v, a }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (((h % 360) + 360) % 360) / 360
  return {
    r: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hue) * 255),
    b: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
    a
  }
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function toHex({ r, g, b }: Rgba): string {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
}

export function toRgbString(color: Rgba): string {
  const { r, g, b, a } = color
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(a, 2)})` : `rgb(${r}, ${g}, ${b})`
}

export function toHslString(color: Rgba): string {
  const { h, s, l, a } = rgbaToHsla(color)
  const base = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`
  return a < 1 ? `hsla(${base}, ${round(a, 2)})` : `hsl(${base})`
}

/** Perceived brightness on the 0..255 scale the hosted filters document. */
export function brightness({ r, g, b }: Rgba): number {
  return (r * 299 + g * 587 + b * 114) / 1000
}

/** Relative luminance, per WCAG, used by the contrast ratio. */
export function luminance({ r, g, b }: Rgba): number {
  const channelLuminance = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function round(value: number, digits: number): number {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}

export function toOklchString(color: Rgba): string {
  const toLinear = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const r = toLinear(color.r)
  const g = toLinear(color.g)
  const b = toLinear(color.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.sqrt(A * A + B * B)
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  const base = `oklch(${round(L, 4)} ${round(chroma, 4)} ${round(hue, 2)}`
  return color.a < 1 ? `${base} / ${round(color.a, 2)})` : `${base})`
}
