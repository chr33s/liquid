const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
])
const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]
const CHUNK_START = 1
const CHUNK_END = 2
const PARENT = 4
const ROOT = 8
const BLOCK_LEN = 64
const CHUNK_LEN = 1024

interface Output {
  cv: Uint32Array
  block: Uint32Array
  counter: number
  blockLen: number
  flags: number
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

function g(s: Uint32Array, a: number, b: number, c: number, d: number, mx: number, my: number): void {
  s[a] = (s[a] + s[b] + mx) >>> 0
  s[d] = rotr(s[d] ^ s[a], 16)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] = rotr(s[b] ^ s[c], 12)
  s[a] = (s[a] + s[b] + my) >>> 0
  s[d] = rotr(s[d] ^ s[a], 8)
  s[c] = (s[c] + s[d]) >>> 0
  s[b] = rotr(s[b] ^ s[c], 7)
}

function compress(cv: Uint32Array, block: Uint32Array, counter: number, blockLen: number, flags: number): Uint32Array {
  const s = new Uint32Array(16)
  s.set(cv.subarray(0, 8), 0)
  s.set(IV.subarray(0, 4), 8)
  s[12] = (counter % 0x100000000) >>> 0
  s[13] = Math.floor(counter / 0x100000000) >>> 0
  s[14] = blockLen
  s[15] = flags
  let m = block
  for (let r = 0; r < 7; r++) {
    g(s, 0, 4, 8, 12, m[0], m[1])
    g(s, 1, 5, 9, 13, m[2], m[3])
    g(s, 2, 6, 10, 14, m[4], m[5])
    g(s, 3, 7, 11, 15, m[6], m[7])
    g(s, 0, 5, 10, 15, m[8], m[9])
    g(s, 1, 6, 11, 12, m[10], m[11])
    g(s, 2, 7, 8, 13, m[12], m[13])
    g(s, 3, 4, 9, 14, m[14], m[15])
    if (r < 6) {
      const permuted = new Uint32Array(16)
      for (let i = 0; i < 16; i++) permuted[i] = m[MSG_PERMUTATION[i]]
      m = permuted
    }
  }
  const out = new Uint32Array(16)
  for (let i = 0; i < 8; i++) {
    out[i] = (s[i] ^ s[i + 8]) >>> 0
    out[i + 8] = (s[i + 8] ^ cv[i]) >>> 0
  }
  return out
}

function chainingValue(output: Output): Uint32Array {
  return new Uint32Array(
    compress(output.cv, output.block, output.counter, output.blockLen, output.flags).subarray(0, 8)
  )
}

function blockWords(bytes: Uint8Array, offset: number, length: number): Uint32Array {
  const words = new Uint32Array(16)
  for (let i = 0; i < length; i++) {
    words[i >> 2] |= bytes[offset + i] << ((i & 3) * 8)
  }
  return words
}

function parentOutput(left: Uint32Array, right: Uint32Array): Output {
  const block = new Uint32Array(16)
  block.set(left, 0)
  block.set(right, 8)
  return { cv: new Uint32Array(IV), block, counter: 0, blockLen: BLOCK_LEN, flags: PARENT }
}

/** BLAKE3 of `bytes`, in the default 32-byte unkeyed mode. */
export function blake3(bytes: Uint8Array): Uint8Array {
  const chunkCount = Math.max(1, Math.ceil(bytes.length / CHUNK_LEN))
  const stack: Uint32Array[] = []
  let output: Output | undefined

  for (let ci = 0; ci < chunkCount; ci++) {
    const start = ci * CHUNK_LEN
    const chunkLen = Math.min(CHUNK_LEN, bytes.length - start)
    const blockCount = Math.max(1, Math.ceil(chunkLen / BLOCK_LEN))
    let cv: Uint32Array = new Uint32Array(IV)
    const isLastChunk = ci === chunkCount - 1
    for (let bi = 0; bi < blockCount; bi++) {
      const offset = start + bi * BLOCK_LEN
      const blockLen = Math.max(0, Math.min(BLOCK_LEN, chunkLen - bi * BLOCK_LEN))
      const block = blockWords(bytes, offset, blockLen)
      let flags = 0
      if (bi === 0) flags |= CHUNK_START
      if (bi === blockCount - 1) flags |= CHUNK_END
      if (isLastChunk && bi === blockCount - 1) {
        output = { cv, block, counter: ci, blockLen, flags }
      } else {
        cv = new Uint32Array(compress(cv, block, ci, blockLen, flags).subarray(0, 8))
      }
    }
    if (isLastChunk) break
    let node = cv
    let total = ci + 1
    while ((total & 1) === 0) {
      node = chainingValue(parentOutput(stack.pop()!, node))
      total >>= 1
    }
    stack.push(node)
  }

  while (stack.length) {
    output = parentOutput(stack.pop()!, chainingValue(output!))
  }

  const root = compress(output!.cv, output!.block, output!.counter, output!.blockLen, output!.flags | ROOT)
  const digest = new Uint8Array(32)
  for (let i = 0; i < 8; i++) {
    digest[i * 4] = root[i] & 0xff
    digest[i * 4 + 1] = (root[i] >>> 8) & 0xff
    digest[i * 4 + 2] = (root[i] >>> 16) & 0xff
    digest[i * 4 + 3] = (root[i] >>> 24) & 0xff
  }
  return digest
}
