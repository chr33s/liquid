export async function drainStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let result = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return result
      result += value
    }
  } finally {
    reader.releaseLock()
  }
}
