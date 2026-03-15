import { describe, it, expect } from 'vitest'
import {
  extractMetadataBlock,
  parseAnalysis,
  extractSpeakersJson,
  parseDuration,
  parseAudioPath,
  extractTranscript,
  extractFrontmatter,
  parseIgggyId,
  parseDate,
} from '../parser'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_NOTE = `---
igggy_id: abc-123
title: "Test Note"
date: 2026-03-14
source: igggy
tags: [igggy, meeting]
---

## Summary

A test summary.

## Key Highlights

### Topic One
- Bullet one

## Tasks

- [ ] Do something

## Transcript

> [!note]- Transcript
> [Speaker 1]: Hello there.
> [Speaker 2]: Hi, how are you?
>
> [Speaker 1]: I'm doing well.

> [!info]- Igggy metadata
> type: MEETING
> duration_sec: 120
> audio: "Igggy/recording.m4a"
> speakers: '{"count":2,"speakers":[{"id":0,"label":"Speaker 1"},{"id":1,"label":"Speaker 2"}]}'
> analysis: '{"recordingType":"MEETING","speakerCount":2,"primaryFocus":"test"}'
`

const LEGACY_NOTE_WITH_DETAILS = `---
igggy_id: legacy-456
title: "Old Note"
date: 2026-01-01
source: igggy
duration_sec: 60
audio: "recordings/old.m4a"
igggy_analysis: '{"recordingType":"MEMO","speakerCount":1,"primaryFocus":"old test"}'
---

## Summary

Old summary.

## Transcript

<details>
<summary>Full transcript</summary>

This is the old transcript format.
It has multiple lines.

</details>
`

const BARE_TRANSCRIPT_NOTE = `---
igggy_id: bare-789
title: "Bare Note"
date: 2026-02-15
source: igggy
---

## Summary

Bare summary.

## Transcript

This is a bare transcript with no callout or details wrapper.
It continues on the next line.

> [!info]- Igggy metadata
> type: MEMO
`

// ── extractFrontmatter ───────────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  it('extracts YAML frontmatter without delimiters', () => {
    const fm = extractFrontmatter(SAMPLE_NOTE)
    expect(fm).toContain('igggy_id: abc-123')
    expect(fm).toContain('date: 2026-03-14')
    expect(fm).not.toContain('---')
  })

  it('returns empty string when no frontmatter', () => {
    expect(extractFrontmatter('# Just a heading')).toBe('')
  })
})

// ── parseIgggyId / parseDate ─────────────────────────────────────────────────

describe('parseIgggyId', () => {
  it('extracts igggy_id from frontmatter', () => {
    const fm = extractFrontmatter(SAMPLE_NOTE)
    expect(parseIgggyId(fm)).toBe('abc-123')
  })

  it('returns undefined when missing', () => {
    expect(parseIgggyId('title: "No ID"')).toBeUndefined()
  })
})

describe('parseDate', () => {
  it('extracts date from frontmatter', () => {
    const fm = extractFrontmatter(SAMPLE_NOTE)
    expect(parseDate(fm)).toBe('2026-03-14')
  })
})

// ── extractMetadataBlock ─────────────────────────────────────────────────────

describe('extractMetadataBlock', () => {
  it('extracts metadata callout block', () => {
    const block = extractMetadataBlock(SAMPLE_NOTE)
    expect(block).toContain('> type: MEETING')
    expect(block).toContain('> duration_sec: 120')
  })

  it('returns empty string when no metadata callout', () => {
    expect(extractMetadataBlock('# No metadata here')).toBe('')
  })

  it('handles collapsed callout (with dash)', () => {
    const note = '> [!info]- Igggy metadata\n> type: LECTURE\n'
    expect(extractMetadataBlock(note)).toContain('> type: LECTURE')
  })

  it('handles non-collapsed callout (without dash)', () => {
    const note = '> [!info] Igggy metadata\n> type: MEMO\n'
    expect(extractMetadataBlock(note)).toContain('> type: MEMO')
  })
})

// ── parseAnalysis ────────────────────────────────────────────────────────────

describe('parseAnalysis', () => {
  it('parses analysis from metadata callout', () => {
    const metaBlock = extractMetadataBlock(SAMPLE_NOTE)
    const analysis = parseAnalysis('', metaBlock)
    expect(analysis).toBeDefined()
    expect(analysis!.recordingType).toBe('MEETING')
    expect(analysis!.primaryFocus).toBe('test')
  })

  it('parses analysis from legacy frontmatter', () => {
    const fm = extractFrontmatter(LEGACY_NOTE_WITH_DETAILS)
    const analysis = parseAnalysis(fm, '')
    expect(analysis).toBeDefined()
    expect(analysis!.recordingType).toBe('MEMO')
  })

  it('prefers frontmatter over callout (legacy priority)', () => {
    const fm = "igggy_analysis: '{\"recordingType\":\"MEMO\"}'"
    const meta = "> analysis: '{\"recordingType\":\"MEETING\"}'"
    const analysis = parseAnalysis(fm, meta)
    expect(analysis!.recordingType).toBe('MEMO')
  })

  it('returns undefined when no analysis found', () => {
    expect(parseAnalysis('', '')).toBeUndefined()
  })

  it('returns undefined for malformed JSON', () => {
    const meta = "> analysis: 'not valid json'"
    expect(parseAnalysis('', meta)).toBeUndefined()
  })

  it('unescapes doubled single quotes', () => {
    const meta = "> analysis: '{\"primaryFocus\":\"it''s a test\"}'"
    const analysis = parseAnalysis('', meta)
    expect(analysis).toBeDefined()
    expect(analysis!.primaryFocus).toBe("it's a test")
  })
})

// ── extractSpeakersJson ──────────────────────────────────────────────────────

describe('extractSpeakersJson', () => {
  it('extracts speakers JSON from metadata block', () => {
    const metaBlock = extractMetadataBlock(SAMPLE_NOTE)
    const json = extractSpeakersJson(metaBlock)
    expect(json).toBeDefined()
    const parsed = JSON.parse(json!)
    expect(parsed.count).toBe(2)
    expect(parsed.speakers).toHaveLength(2)
  })

  it('returns undefined when no speakers line', () => {
    expect(extractSpeakersJson('> type: MEETING')).toBeUndefined()
  })

  it('unescapes doubled single quotes in speaker names', () => {
    const meta = "> speakers: '{\"count\":2,\"speakers\":[{\"id\":0,\"label\":\"Speaker 1\",\"name\":\"O''Brien\"}]}'"
    const json = extractSpeakersJson(meta)
    expect(json).toContain("O'Brien")
  })
})

// ── parseDuration ────────────────────────────────────────────────────────────

describe('parseDuration', () => {
  it('parses duration from metadata callout', () => {
    const metaBlock = extractMetadataBlock(SAMPLE_NOTE)
    expect(parseDuration('', metaBlock)).toBe(120)
  })

  it('parses duration from legacy frontmatter', () => {
    const fm = extractFrontmatter(LEGACY_NOTE_WITH_DETAILS)
    expect(parseDuration(fm, '')).toBe(60)
  })

  it('returns undefined when missing', () => {
    expect(parseDuration('', '')).toBeUndefined()
  })
})

// ── parseAudioPath ───────────────────────────────────────────────────────────

describe('parseAudioPath', () => {
  it('parses audio path from metadata callout', () => {
    const metaBlock = extractMetadataBlock(SAMPLE_NOTE)
    expect(parseAudioPath('', metaBlock)).toBe('Igggy/recording.m4a')
  })

  it('parses audio path from legacy frontmatter', () => {
    const fm = extractFrontmatter(LEGACY_NOTE_WITH_DETAILS)
    expect(parseAudioPath(fm, '')).toBe('recordings/old.m4a')
  })

  it('returns undefined when missing', () => {
    expect(parseAudioPath('', '')).toBeUndefined()
  })
})

// ── extractTranscript ────────────────────────────────────────────────────────

describe('extractTranscript', () => {
  it('extracts transcript from Obsidian callout format', () => {
    const transcript = extractTranscript(SAMPLE_NOTE)
    expect(transcript).toBeDefined()
    expect(transcript).toContain('[Speaker 1]: Hello there.')
    expect(transcript).toContain('[Speaker 2]: Hi, how are you?')
    expect(transcript).toContain("[Speaker 1]: I'm doing well.")
  })

  it('strips leading "> " from callout lines', () => {
    const transcript = extractTranscript(SAMPLE_NOTE)
    expect(transcript).not.toMatch(/^>/m)
  })

  it('extracts transcript from legacy <details> format', () => {
    const transcript = extractTranscript(LEGACY_NOTE_WITH_DETAILS)
    expect(transcript).toBeDefined()
    expect(transcript).toContain('This is the old transcript format.')
    expect(transcript).toContain('It has multiple lines.')
  })

  it('extracts transcript from bare ## Transcript heading', () => {
    const transcript = extractTranscript(BARE_TRANSCRIPT_NOTE)
    expect(transcript).toBeDefined()
    expect(transcript).toContain('This is a bare transcript')
    expect(transcript).toContain('It continues on the next line.')
  })

  it('stops bare transcript at metadata callout', () => {
    const transcript = extractTranscript(BARE_TRANSCRIPT_NOTE)
    expect(transcript).not.toContain('[!info]')
    expect(transcript).not.toContain('type: MEMO')
  })

  it('returns undefined when no transcript present', () => {
    const note = `---
igggy_id: no-transcript
title: "No Transcript"
date: 2026-01-01
source: igggy
---

## Summary

Just a summary, no transcript.

> [!info]- Igggy metadata
> type: MEMO
`
    expect(extractTranscript(note)).toBeUndefined()
  })

  it('handles empty callout body', () => {
    const note = `## Summary

Some text.

> [!note]- Transcript
>

> [!info]- Igggy metadata
> type: MEMO
`
    // Empty callout body — should fall through to undefined
    expect(extractTranscript(note)).toBeUndefined()
  })
})
