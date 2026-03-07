import { Menu, Notice, SuggestModal, TFile } from 'obsidian'
import type IgggyPlugin from './main'
import { preprocessAudio } from './audio/preprocessor'
import { OpenAIWhisperProvider } from './audio/providers/openai'
import { DeepgramProvider } from './audio/providers/deepgram'
import { ClaudeProvider } from './ai/providers/claude'
import { OpenAIGPT4oProvider } from './ai/providers/openai'
import {
  createPlaceholder,
  updatePlaceholderStage,
  setPlaceholderError,
  finalizePlaceholder,
} from './notes/writer'

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'wav', 'webm', 'ogg', 'flac', 'aac', 'mp4'])

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function processAudioFile(plugin: IgggyPlugin, file: TFile): Promise<void> {
  const { settings, app } = plugin

  // Validate required keys before starting — keep Notice for pre-pipeline failures
  if (settings.transcriptionProvider === 'openai' && !settings.openaiKey) {
    new Notice('Igggy: OpenAI API key required. Open plugin settings to add it.', 6000)
    return
  }
  if (settings.transcriptionProvider === 'deepgram' && !settings.deepgramKey) {
    new Notice('Igggy: Deepgram API key required. Open plugin settings to add it.', 6000)
    return
  }
  if (settings.summarizationProvider === 'anthropic' && !settings.anthropicKey) {
    new Notice('Igggy: Anthropic API key required. Open plugin settings to add it.', 6000)
    return
  }
  if (settings.summarizationProvider === 'openai' && !settings.openaiKey) {
    new Notice('Igggy: OpenAI API key required. Open plugin settings to add it.', 6000)
    return
  }

  // Create placeholder note immediately and open it in the active pane.
  // If this fails (e.g. vault write error), fall back to a Notice.
  let placeholderFile: TFile
  try {
    placeholderFile = await createPlaceholder(app, file, settings.outputFolder)
    await app.workspace.getLeaf(false).openFile(placeholderFile)
  } catch (err) {
    console.error('[Igggy] Failed to create placeholder note:', err)
    new Notice('Igggy: Failed to create note file. Check your output folder setting.', 6000)
    return
  }

  const date = new Date().toISOString().slice(0, 10)
  let step = 'reading file'
  // audioLine is built after preprocessing and reused in subsequent stage updates
  let audioLine = '\uD83D\uDD0A Audio ready \u2713'

  try {
    // ── Read ────────────────────────────────────────────────────────────────
    const rawBuffer = await app.vault.readBinary(file)

    // ── Pre-process ─────────────────────────────────────────────────────────
    step = 'pre-processing audio'
    await updatePlaceholderStage(app, placeholderFile, [
      '\uD83D\uDCC2 Reading audio \u2713',
      '\uD83D\uDD0A Pre-processing audio\u2026',
    ])
    const processed = await preprocessAudio(rawBuffer, file.name)
    audioLine = processed.wasCompressed
      ? `\uD83D\uDD0A Compressed: ${formatBytes(rawBuffer.byteLength)} \u2192 ${formatBytes(processed.buffer.byteLength)} \u2713`
      : '\uD83D\uDD0A Audio ready \u2713'

    // ── Transcribe ──────────────────────────────────────────────────────────
    step = 'transcribing'
    await updatePlaceholderStage(app, placeholderFile, [
      '\uD83D\uDCC2 Reading audio \u2713',
      audioLine,
      '\uD83C\uDF99\uFE0F Transcribing\u2026',
    ])
    const transcriptionProvider =
      settings.transcriptionProvider === 'deepgram'
        ? new DeepgramProvider(settings.deepgramKey)
        : new OpenAIWhisperProvider(settings.openaiKey)

    const { transcript, durationSec } = await transcriptionProvider.transcribe(
      processed.buffer,
      processed.filename
    )

    // ── Summarize ───────────────────────────────────────────────────────────
    step = 'generating note'
    await updatePlaceholderStage(app, placeholderFile, [
      '\uD83D\uDCC2 Reading audio \u2713',
      audioLine,
      '\uD83C\uDF99\uFE0F Transcript ready \u2713',
      '\u2728 Generating note\u2026',
    ])
    const summarizationProvider =
      settings.summarizationProvider === 'anthropic'
        ? new ClaudeProvider(settings.anthropicKey)
        : new OpenAIGPT4oProvider(settings.openaiKey)

    const meta = {
      durationSec,
      capturedAt: new Date(file.stat.ctime),
    }
    const noteContent = await summarizationProvider.summarize(transcript, meta)

    // ── Finalize ────────────────────────────────────────────────────────────
    step = 'writing note'
    await finalizePlaceholder(app, placeholderFile, noteContent, {
      date,
      transcript,
      durationSec,
      audioPath: settings.embedAudio ? file.path : undefined,
      embedAudio: settings.embedAudio,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const friendlyMessage = friendlyError(message, step)
    console.error(`[Igggy] Error during "${step}":`, err)
    await setPlaceholderError(app, placeholderFile, step, friendlyMessage)
  }
}

// ── File Picker Modal ─────────────────────────────────────────────────────────

class AudioFileSuggestModal extends SuggestModal<TFile> {
  constructor(
    private plugin: IgggyPlugin
  ) {
    super(plugin.app)
    this.setPlaceholder('Type to filter audio files\u2026')
  }

  getSuggestions(query: string): TFile[] {
    return this.plugin.app.vault.getFiles().filter((f) => {
      const ext = f.extension.toLowerCase()
      if (!AUDIO_EXTENSIONS.has(ext)) return false
      if (!query) return true
      return (
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.path.toLowerCase().includes(query.toLowerCase())
      )
    })
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.createEl('div', { text: file.name })
    el.createEl('small', { text: file.parent?.path ?? '', cls: 'igggy-file-path' })
  }

  onChooseSuggestion(file: TFile): void {
    processAudioFile(this.plugin, file)
  }
}

// ── Ribbon / Menu Entry Points ────────────────────────────────────────────────

export function openAudioFilePicker(plugin: IgggyPlugin): void {
  new AudioFileSuggestModal(plugin).open()
}

export function registerMenus(plugin: IgggyPlugin): void {
  // File explorer context menu — only shown for audio files
  plugin.registerEvent(
    plugin.app.workspace.on('file-menu', (menu: Menu, file) => {
      if (!(file instanceof TFile)) return
      if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return
      menu.addItem((item) =>
        item
          .setTitle('Process with Igggy')
          .setIcon('mic')
          .onClick(() => processAudioFile(plugin, file))
      )
    })
  )

  // Editor context menu — only shown when the active file is an audio file
  plugin.registerEvent(
    plugin.app.workspace.on('editor-menu', (menu: Menu, _editor, view) => {
      const file = view.file
      if (!file) return
      if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return
      menu.addItem((item) =>
        item
          .setTitle('Process with Igggy')
          .setIcon('mic')
          .onClick(() => processAudioFile(plugin, file))
      )
    })
  )
}

// ── Command Registration ──────────────────────────────────────────────────────

export function registerCommands(plugin: IgggyPlugin): void {
  // Process the currently focused audio file
  plugin.addCommand({
    id: 'process-active-file',
    name: 'Process active audio file',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile()
      if (!file) return false
      if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) return false
      if (!checking) processAudioFile(plugin, file)
      return true
    },
  })

  // Pick any audio file from the vault via modal
  plugin.addCommand({
    id: 'process-audio-file',
    name: 'Process audio file\u2026',
    callback: () => {
      new AudioFileSuggestModal(plugin).open()
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function friendlyError(message: string, step: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid_api_key')) {
    return 'invalid API key \u2014 check your key in plugin settings'
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return 'API rate limit or quota exceeded \u2014 try again shortly'
  }
  if (lower.includes('413') || lower.includes('too large') || lower.includes('file size')) {
    return 'audio file is too large for the API \u2014 try a shorter recording'
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return step === 'reading file'
      ? 'could not read file \u2014 ensure it is fully synced and not stored only in iCloud'
      : 'network request failed \u2014 check your internet connection'
  }
  if (lower.includes('could not decode') || lower.includes('decodeaudiodata') || lower.includes('dom exception')) {
    return 'could not decode audio \u2014 the file format may not be supported'
  }

  return message
}
