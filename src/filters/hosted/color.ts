import { isNil, stringify, toValue } from '../../util'
import {
  brightness,
  clamp,
  hslaToRgba,
  luminance,
  parseColor,
  rgbaToHsla,
  round,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  type Rgba
} from './color-space'

/** An unreadable color yields an empty string, as the hosted filters do. */
function withColor<T>(input: unknown, fn: (color: Rgba) => T): T | string {
  const color = parseColor(input)
  return color === undefined ? '' : fn(color)
}

export const color_to_hex = (v: unknown) => withColor(v, toHex)
export const color_to_rgb = (v: unknown) => withColor(v, toRgbString)
export const color_to_hsl = (v: unknown) => withColor(v, toHslString)
export const color_to_oklch = (v: unknown) => withColor(v, toOklchString)

export function color_extract(v: unknown, key: unknown) {
  return withColor(v, color => {
    const hsl = rgbaToHsla(color)
    switch (stringify(key)) {
      case 'red':
        return color.r
      case 'green':
        return color.g
      case 'blue':
        return color.b
      case 'alpha':
        return round(color.a, 2)
      case 'hue':
        return Math.round(hsl.h)
      case 'saturation':
        return Math.round(hsl.s * 100)
      case 'lightness':
        return Math.round(hsl.l * 100)
      default:
        return ''
    }
  })
}

export function color_modify(v: unknown, key: unknown, value: unknown) {
  const amount = numericArgument(value)
  if (amount === undefined) return ''
  return withColor(v, color => {
    const hsl = rgbaToHsla(color)
    switch (stringify(key)) {
      case 'red':
        return format({ ...color, r: clamp(Math.round(amount), 0, 255) })
      case 'green':
        return format({ ...color, g: clamp(Math.round(amount), 0, 255) })
      case 'blue':
        return format({ ...color, b: clamp(Math.round(amount), 0, 255) })
      case 'alpha':
        return format({ ...color, a: clamp(amount, 0, 1) })
      case 'hue':
        return format(hslaToRgba({ ...hsl, h: amount }))
      case 'saturation':
        return format(hslaToRgba({ ...hsl, s: clamp(amount / 100, 0, 1) }))
      case 'lightness':
        return format(hslaToRgba({ ...hsl, l: clamp(amount / 100, 0, 1) }))
      default:
        return ''
    }
  })
}

export const color_brightness = (v: unknown) => withColor(v, color => round(brightness(color), 2))

export function color_lighten(v: unknown, amount: unknown) {
  const by = numericArgument(amount)
  return by === undefined ? '' : shiftLightness(v, by / 100)
}

export function color_darken(v: unknown, amount: unknown) {
  const by = numericArgument(amount)
  return by === undefined ? '' : shiftLightness(v, -by / 100)
}

export function color_saturate(v: unknown, amount: unknown) {
  const by = numericArgument(amount)
  return by === undefined ? '' : shiftSaturation(v, by / 100)
}

export function color_desaturate(v: unknown, amount: unknown) {
  const by = numericArgument(amount)
  return by === undefined ? '' : shiftSaturation(v, -by / 100)
}

export function color_mix(v: unknown, other: unknown, weight: unknown) {
  const a = parseColor(v)
  const b = parseColor(other)
  const amount = numericArgument(weight)
  if (!a || !b || amount === undefined) return ''
  const w = clamp(amount / 100, 0, 1)
  return format({
    r: Math.round(a.r * (1 - w) + b.r * w),
    g: Math.round(a.g * (1 - w) + b.g * w),
    b: Math.round(a.b * (1 - w) + b.b * w),
    a: a.a * (1 - w) + b.a * w
  })
}

export function color_contrast(v: unknown, other: unknown) {
  const a = parseColor(v)
  const b = parseColor(other)
  if (!a || !b) return ''
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return round((light + 0.05) / (dark + 0.05), 2)
}

export function color_difference(v: unknown, other: unknown) {
  const a = parseColor(v)
  const b = parseColor(other)
  if (!a || !b) return ''
  return (
    Math.max(a.r, b.r) -
    Math.min(a.r, b.r) +
    (Math.max(a.g, b.g) - Math.min(a.g, b.g)) +
    (Math.max(a.b, b.b) - Math.min(a.b, b.b))
  )
}

export function brightness_difference(v: unknown, other: unknown) {
  const a = parseColor(v)
  const b = parseColor(other)
  if (!a || !b) return ''
  return round(Math.abs(brightness(a) - brightness(b)), 2)
}

export function hex_to_rgba(v: unknown, alpha: unknown) {
  const given = alpha === undefined || alpha === null ? undefined : numericArgument(alpha)
  if (alpha !== undefined && alpha !== null && given === undefined) return ''
  return withColor(v, color => toRgbString({ ...color, a: given === undefined ? color.a : clamp(given, 0, 1) }))
}

/**
 * A colour filter's numeric argument, or undefined when it is absent or not a
 * number, in which case the filter reports nothing like every other failure.
 */
function numericArgument(value: unknown): number | undefined {
  const resolved = toValue(value)
  if (isNil(resolved)) return undefined
  const num = Number(stringify(resolved))
  return Number.isFinite(num) ? num : undefined
}

function shiftLightness(v: unknown, delta: number) {
  return withColor(v, color => {
    const hsl = rgbaToHsla(color)
    return format(hslaToRgba({ ...hsl, l: clamp(hsl.l + delta, 0, 1) }))
  })
}

function shiftSaturation(v: unknown, delta: number) {
  return withColor(v, color => {
    const hsl = rgbaToHsla(color)
    return format(hslaToRgba({ ...hsl, s: clamp(hsl.s + delta, 0, 1) }))
  })
}

/** Opaque results are written as hex, translucent ones as rgba. */
function format(color: Rgba): string {
  return color.a < 1 ? toRgbString(color) : toHex(color)
}
