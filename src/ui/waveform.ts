/**
 * waveform.ts
 *
 * Renders an animated waveform inside an `igggy-status` code block.
 *
 * Three visual states:
 *   recording  — canvas driven by AnalyserNode (real mic frequency data)
 *   paused     — CSS div bars, flat and dimmed
 *   processing — CSS div bars, sine-wave rolling animation
 *
 * Lifecycle cleanup (rAF loops and setInterval timers) is handled via
 * MarkdownRenderChild instances registered with ctx.addChild(), which
 * Obsidian calls onunload() on when the block is unmounted.
 */

import { MarkdownRenderChild } from 'obsidian'
import type { MarkdownPostProcessorContext } from 'obsidian'
import type IgggyPlugin from '../main'

const BAR_COUNT = 28

// ── Lifecycle components ──────────────────────────────────────────────────────

class CanvasWaveformComponent extends MarkdownRenderChild {
  private rafId = 0

  constructor(containerEl: HTMLElement) {
    super(containerEl)
  }

  onunload(): void {
    cancelAnimationFrame(this.rafId)
  }

  setRafId(id: number): void {
    this.rafId = id
  }
}

class TimerComponent extends MarkdownRenderChild {
  private intervalId = 0

  constructor(containerEl: HTMLElement) {
    super(containerEl)
  }

  onunload(): void {
    clearInterval(this.intervalId)
  }

  setIntervalId(id: number): void {
    this.intervalId = id
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSec(totalSec: number): string {
  const sec = Math.floor(totalSec)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Renders an animated waveform block into the given element.
 * Called by the 'igggy-status' code block processor in main.ts.
 */
export function renderWaveform(
  state: 'recording' | 'paused' | 'processing',
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: IgggyPlugin
): void {
  el.empty()
  const container = el.createDiv({ cls: `igggy-waveform ${state}` })

  if (state === 'recording') {
    renderCanvas(container, ctx, plugin)
  } else {
    renderCssBars(container, state)
  }

  renderFooter(container, state, ctx, plugin)
}

// ── Canvas rendering (recording state) ───────────────────────────────────────

function renderCanvas(
  container: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: IgggyPlugin
): void {
  const analyser = plugin.activeRecording?.getAnalyserNode() ?? null

  // Fallback: analyser unavailable (session stopped, stale block, or plugin reloaded)
  if (!analyser) {
    const barsDiv = container.createDiv({ cls: 'igggy-bars' })
    for (let i = 0; i < BAR_COUNT; i++) barsDiv.createDiv({ cls: 'bar' })
    return
  }

  const canvas = container.createEl('canvas', { cls: 'igggy-canvas' })
  canvas.width = BAR_COUNT * 5   // 5px per bar slot (3px bar + 2px gap)
  canvas.height = 36

  const canvasCtx = canvas.getContext('2d')!

  // Capture as a typed non-null const so TypeScript preserves the type inside closures
  // (TypeScript doesn't carry narrowed union types across function boundaries)
  const safeAnalyser: AnalyserNode = analyser
  const freqData = new Uint8Array(safeAnalyser.frequencyBinCount)

  // Read the accent colour from the Obsidian theme at render time
  const accentColor =
    getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim() ||
    '#7c6df0'

  const component = new CanvasWaveformComponent(container)
  ctx.addChild(component)

  // roundRect check: use typeof cast to avoid TypeScript narrowing canvasCtx to never
  // in the else branch (which happens when the DOM lib declares roundRect on the type)
  const hasRoundRect = typeof (canvasCtx as unknown as { roundRect?: unknown }).roundRect === 'function'

  function draw(): void {
    const rafId = requestAnimationFrame(draw)
    component.setRafId(rafId)

    safeAnalyser.getByteFrequencyData(freqData)
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < BAR_COUNT; i++) {
      // Map frequency bins across the bar count (low-mid range looks most musical)
      const binIndex = Math.floor((i / BAR_COUNT) * freqData.length)
      const normalized = freqData[binIndex] / 255              // 0–1
      const height = Math.max(3, Math.sqrt(normalized) * 32)  // sqrt for perceptual spread; 3–32px
      const x = i * 5
      const y = (canvas.height - height) / 2                  // vertically centred

      canvasCtx.fillStyle = accentColor
      canvasCtx.beginPath()

      // roundRect adds rounded corners — fall back to rect on older Electron builds
      if (hasRoundRect) {
        ;(canvasCtx as unknown as {
          roundRect(x: number, y: number, w: number, h: number, r: number): void
        }).roundRect(x, y, 3, height, 2)
      } else {
        canvasCtx.rect(x, y, 3, height)
      }

      canvasCtx.fill()
    }
  }

  draw()
}

// ── CSS bar rendering (paused + processing states) ────────────────────────────

function renderCssBars(container: HTMLElement, state: 'paused' | 'processing'): void {
  const barsDiv = container.createDiv({ cls: 'igggy-bars' })

  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = barsDiv.createDiv({ cls: 'bar' })
    if (state === 'processing') {
      // Distribute delays so bars animate as a rolling sine wave
      // Range: 0s (first bar) → -1.4s (last bar), matching the 1.4s animation duration
      const delay = -(i / (BAR_COUNT - 1)) * 1.4
      bar.style.setProperty('--wave-delay', `${delay.toFixed(3)}s`)
    }
  }
}

// ── Footer (timer + label) ────────────────────────────────────────────────────

function renderFooter(
  container: HTMLElement,
  state: 'recording' | 'paused' | 'processing',
  ctx: MarkdownPostProcessorContext,
  plugin: IgggyPlugin
): void {
  const footer = container.createDiv({ cls: 'igggy-waveform-footer' })

  // Timer — shown during recording and paused; hidden during processing
  if (state !== 'processing') {
    const timerEl = footer.createSpan({ cls: 'igggy-timer' })
    timerEl.textContent = formatSec(plugin.activeRecording?.getElapsedSec() ?? 0)

    const timerComponent = new TimerComponent(footer)
    ctx.addChild(timerComponent)

    // Update every 250ms; getElapsedSec() automatically freezes while paused
    const id = window.setInterval(() => {
      timerEl.textContent = formatSec(plugin.activeRecording?.getElapsedSec() ?? 0)
    }, 250)
    timerComponent.setIntervalId(id as number)
  }

  const labelText =
    state === 'recording' ? '\u25CF Recording'
    : state === 'paused'  ? '\u23F8 Paused'
    :                       '\u27F3 Processing\u2026'

  footer.createSpan({ cls: 'igggy-waveform-label', text: labelText })
}
