export function base64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384))
  }
  return btoa(binary)
}

export function base64Decode(str: string): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(Uint8Array.from(atob(str), c => c.charCodeAt(0)))
}
