import { requestUrl } from 'obsidian'
import type { TranscriptionProvider, TranscriptionResult } from './types'

/**
 * Encode a multipart/form-data body as an ArrayBuffer.
 *
 * Obsidian's requestUrl does not accept FormData, so we construct the body
 * manually with a randomly-generated boundary string.
 */
function buildMultipartBody(
  fields: Record<string, string>,
  fileBuffer: ArrayBuffer,
  filename: string,
  mimeType: string
): { body: ArrayBuffer; boundary: string } {
  const boundary = `----IgggyBoundary${Math.random().toString(36).slice(2)}`
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []

  // Text fields
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
    )
  }

  // File field
  parts.push(
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    )
  )
  parts.push(new Uint8Array(fileBuffer))
  parts.push(enc.encode(`\r\n--${boundary}--\r\n`))

  // Concatenate all parts into a single Uint8Array
  const totalLength = parts.reduce((sum, p) => sum + p.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }

  return { body: result.buffer, boundary }
}

export class OpenAIWhisperProvider implements TranscriptionProvider {
  constructor(private apiKey: string) {}

  async transcribe(audioBuffer: ArrayBuffer, filename: string): Promise<TranscriptionResult> {
    const { body, boundary } = buildMultipartBody(
      { model: 'whisper-1', response_format: 'verbose_json' },
      audioBuffer,
      filename,
      'audio/mpeg'
    )

    const res = await requestUrl({
      url: 'https://api.openai.com/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
      throw: false,
    })

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Whisper API error ${res.status}: ${res.text}`)
    }

    const data = res.json

    return {
      transcript: data.text ?? '',
      durationSec: data.duration ? Math.round(data.duration) : undefined,
      speakersDetected: false,  // Whisper doesn't do diarization
    }
  }
}
