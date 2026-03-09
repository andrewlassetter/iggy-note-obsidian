/**
 * RecordingSession
 *
 * Wraps getUserMedia + MediaRecorder + a Web Audio AnalyserNode.
 * The analyser node reads real microphone frequency data so the waveform
 * renderer can display bars that actually respond to the user's voice.
 *
 * Usage:
 *   const session = await RecordingSession.create()
 *   session.start()
 *   // later:
 *   const blob = await session.stop()
 */

export type RecordingState = 'recording' | 'paused' | 'inactive'

export class RecordingSession {
  private readonly mediaRecorder: MediaRecorder
  private readonly stream: MediaStream
  private readonly audioContext: AudioContext
  private readonly analyser: AnalyserNode
  private readonly chunks: Blob[] = []

  private startTime = 0
  private pausedMs = 0
  private pauseStart: number | null = null

  private constructor(
    stream: MediaStream,
    audioContext: AudioContext,
    analyser: AnalyserNode,
    mediaRecorder: MediaRecorder
  ) {
    this.stream = stream
    this.audioContext = audioContext
    this.analyser = analyser
    this.mediaRecorder = mediaRecorder

    mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
  }

  /**
   * Request microphone access, build the audio graph, and return a session
   * ready to call start() on. Throws if the user denies permission or has
   * no microphone (NotAllowedError / NotFoundError).
   */
  static async create(): Promise<RecordingSession> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 64                // 32 frequency bins — plenty for 28 bars
    analyser.smoothingTimeConstant = 0.75 // responsive but not jittery
    analyser.minDecibels = -85
    analyser.maxDecibels = -10

    // Connect source → analyser only (NOT to destination — no playback)
    source.connect(analyser)

    const mimeType = RecordingSession.pickMimeType()
    const mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)

    return new RecordingSession(stream, audioContext, analyser, mediaRecorder)
  }

  /** Begin recording. Call after createRecordingPlaceholder() has opened the note. */
  start(): void {
    this.startTime = Date.now()
    this.mediaRecorder.start(100) // 100ms timeslices keep chunk sizes small
  }

  pause(): void {
    this.pauseStart = Date.now()
    this.mediaRecorder.pause()
  }

  resume(): void {
    if (this.pauseStart !== null) {
      this.pausedMs += Date.now() - this.pauseStart
      this.pauseStart = null
    }
    this.mediaRecorder.resume()
  }

  /** Stop recording, release microphone and AudioContext, return the audio blob. */
  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType })
        this.stream.getTracks().forEach((t) => t.stop())
        void this.audioContext.close()
        resolve(blob)
      }
      this.mediaRecorder.stop()
    })
  }

  getState(): RecordingState {
    switch (this.mediaRecorder.state) {
      case 'recording': return 'recording'
      case 'paused':    return 'paused'
      default:          return 'inactive'
    }
  }

  // ── Mute / unmute ──────────────────────────────────────────────────────────

  /** Mute the microphone without stopping the recording (track enabled = false). */
  mute(): void {
    this.stream.getAudioTracks().forEach(t => { t.enabled = false })
  }

  /** Restore microphone audio after muting. */
  unmute(): void {
    this.stream.getAudioTracks().forEach(t => { t.enabled = true })
  }

  /** Returns true when at least one audio track is muted. */
  isMuted(): boolean {
    const tracks = this.stream.getAudioTracks()
    return tracks.length > 0 && !tracks[0].enabled
  }

  /** Elapsed wall-clock seconds, paused time excluded. */
  getElapsedSec(): number {
    const now = Date.now()
    const activePausedMs = this.pauseStart !== null ? now - this.pauseStart : 0
    return Math.max(0, (now - this.startTime - this.pausedMs - activePausedMs) / 1000)
  }

  /** The AnalyserNode — used by the waveform canvas to read live frequency data. */
  getAnalyserNode(): AnalyserNode {
    return this.analyser
  }

  // ── Static helpers ──────────────────────────────────────────────────────────

  /** Returns the best supported MIME type for recording, or empty string for browser default. */
  static pickMimeType(): string {
    const candidates = ['audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type
    }
    return ''
  }

  /** Maps a MIME type string to a file extension for the saved blob. */
  static getExtension(mimeType: string): string {
    if (mimeType.includes('webm')) return 'webm'
    if (mimeType.includes('ogg'))  return 'ogg'
    if (mimeType.includes('mp4'))  return 'mp4'
    return 'audio'
  }
}
