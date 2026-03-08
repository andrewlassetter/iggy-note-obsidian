import { App, PluginSettingTab, Setting } from 'obsidian'
import type IgggyPlugin from './main'

export class IgggySettingsTab extends PluginSettingTab {
  plugin: IgggyPlugin

  constructor(app: App, plugin: IgggyPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    // ── Transcription ──────────────────────────────────────────────
    new Setting(containerEl).setName('Transcription').setHeading()

    new Setting(containerEl)
      .setName('Provider')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('OpenAI Whisper works with just an OpenAI key. Deepgram adds speaker diarization.')
      .addDropdown((dd) =>
        dd
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('openai', 'OpenAI Whisper')
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('deepgram', 'Deepgram Nova-3')
          .setValue(this.plugin.settings.transcriptionProvider)
          .onChange(async (value) => {
            this.plugin.settings.transcriptionProvider = value as 'openai' | 'deepgram'
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setName('OpenAI API key')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Used for Whisper transcription and/or GPT-4o summarization.')
      .addText((text) =>
        text
          .setPlaceholder('Paste your key')
          .setValue(this.plugin.settings.openaiKey)
          .onChange(async (value) => {
            this.plugin.settings.openaiKey = value.trim()
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Deepgram API key')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Required when using Deepgram as the transcription provider.')
      .addText((text) =>
        text
          .setPlaceholder('Paste your key')
          .setValue(this.plugin.settings.deepgramKey)
          .onChange(async (value) => {
            this.plugin.settings.deepgramKey = value.trim()
            await this.plugin.saveSettings()
          })
      )

    // ── Summarization ──────────────────────────────────────────────
    new Setting(containerEl).setName('Summarization').setHeading()

    new Setting(containerEl)
      .setName('Provider')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('GPT-4o Mini works with your OpenAI key. Claude Sonnet delivers higher quality notes.')
      .addDropdown((dd) =>
        dd
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('openai', 'GPT-4o Mini')
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .addOption('anthropic', 'Claude Sonnet')
          .setValue(this.plugin.settings.summarizationProvider)
          .onChange(async (value) => {
            this.plugin.settings.summarizationProvider = value as 'openai' | 'anthropic'
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Anthropic API key')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('Required when using Claude as the summarization provider.')
      .addText((text) =>
        text
          .setPlaceholder('Paste your key')
          .setValue(this.plugin.settings.anthropicKey)
          .onChange(async (value) => {
            this.plugin.settings.anthropicKey = value.trim()
            await this.plugin.saveSettings()
          })
      )

    // ── Output ──────────────────────────────────────────────────────
    new Setting(containerEl).setName('Output').setHeading()

    new Setting(containerEl)
      .setName('Output folder')
      .setDesc("Vault folder where notes are created. Will be created automatically if it doesn't exist.")
      .addText((text) =>
        text
          .setPlaceholder('Igggy')
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || 'Igggy'
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName('Embed audio link in note')
      .setDesc('Adds ![[recording.m4a]] at the top of each generated note.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.embedAudio).onChange(async (value) => {
          this.plugin.settings.embedAudio = value
          await this.plugin.saveSettings()
        })
      )

  }
}
