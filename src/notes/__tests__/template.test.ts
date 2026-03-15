import { describe, it, expect } from 'vitest'
import { generateMarkdown, type NoteTemplateData } from '../template'
import type { NoteContent } from '@igggy/core'

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeMeetingContent(overrides?: Partial<NoteContent>): NoteContent {
  return {
    noteType: 'MEETING',
    title: 'Weekly Standup',
    summary: 'Team discussed sprint progress and blockers.',
    keyTopics: [
      { topic: 'Sprint Progress', bullets: ['Feature A is on track', 'Feature B delayed'] },
      { topic: 'Blockers', bullets: ['API rate limiting'] },
    ],
    content: [],
    decisions: ['Move Feature B deadline to Friday'],
    actionItems: [
      { content: 'Fix rate limiter config', owner: 'Alice', context: 'blocking Feature B' },
      { content: 'Update sprint board', owner: null, context: '' },
    ],
    ...overrides,
  }
}

function makeMemoContent(overrides?: Partial<NoteContent>): NoteContent {
  return {
    noteType: 'MEMO',
    title: 'Architecture Thoughts',
    summary: 'Reflections on moving to event-driven architecture.',
    keyTopics: [{ topic: 'Event Bus', bullets: ['Decouple services'] }],
    content: ['We should consider NATS for the message bus.', 'Redis Streams is another option.'],
    decisions: ['Prototype with NATS first'],
    actionItems: [{ content: 'Set up NATS POC', owner: null, context: '' }],
    ...overrides,
  }
}

function makeLectureContent(overrides?: Partial<NoteContent>): NoteContent {
  return {
    noteType: 'LECTURE',
    title: 'Intro to Distributed Systems',
    summary: 'Covered CAP theorem and eventual consistency.',
    keyTopics: [
      { topic: 'CAP Theorem', bullets: ['Choose 2 of 3: Consistency, Availability, Partition tolerance'] },
    ],
    content: [],
    decisions: ['Eventual consistency', 'Quorum reads'],
    actionItems: [{ content: 'Read Dynamo paper', owner: null, context: '' }],
    ...overrides,
  }
}

function makeTemplateData(noteContent: NoteContent, overrides?: Partial<NoteTemplateData>): NoteTemplateData {
  return {
    noteContent,
    date: '2026-03-14',
    igggyId: 'test-uuid-1234',
    embedAudio: false,
    showTasks: true,
    ...overrides,
  }
}

// ── Frontmatter ──────────────────────────────────────────────────────────────

describe('generateMarkdown — frontmatter', () => {
  it('produces correct YAML frontmatter fields', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).toMatch(/^---\n/)
    expect(md).toContain('igggy_id: test-uuid-1234')
    expect(md).toContain('title: "Weekly Standup"')
    expect(md).toContain('date: 2026-03-14')
    expect(md).toContain('source: igggy')
    expect(md).toContain('tags: [igggy, meeting]')
  })

  it('normalizes legacy ONE_ON_ONE type to meeting in tags', () => {
    const content = makeMeetingContent({ noteType: 'MEETING' })
    // Simulate legacy type by casting
    ;(content as { noteType: string }).noteType = 'ONE_ON_ONE'
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).toContain('tags: [igggy, meeting]')
  })

  it('normalizes legacy JOURNAL type to memo in tags', () => {
    const content = makeMemoContent({ noteType: 'MEMO' })
    ;(content as { noteType: string }).noteType = 'JOURNAL'
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).toContain('tags: [igggy, memo]')
  })
})

// ── Metadata callout ─────────────────────────────────────────────────────────

describe('generateMarkdown — metadata callout', () => {
  it('includes type in metadata callout', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).toContain('> [!info]- Igggy metadata')
    expect(md).toContain('> type: MEETING')
  })

  it('includes duration_sec when provided', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), { durationSec: 120 }))
    expect(md).toContain('> duration_sec: 120')
  })

  it('omits duration_sec when not provided', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).not.toContain('duration_sec')
  })

  it('includes audio path when provided', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), { audioPath: 'Igggy/recording.m4a' }))
    expect(md).toContain('> audio: "Igggy/recording.m4a"')
  })

  it('stores analysis JSON with single-quote escaping', () => {
    const analysis = JSON.stringify({ recordingType: "MEETING", primaryFocus: "it's a test" })
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), { analysisJson: analysis }))
    expect(md).toContain("> analysis: '")
    // Single quotes in the JSON should be doubled
    expect(md).toContain("it''s a test")
  })

  it('stores speakers JSON with single-quote escaping', () => {
    const speakers = JSON.stringify({ count: 2, speakers: [{ id: 0, label: "Speaker 1", name: "O'Brien" }] })
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), { speakersJson: speakers }))
    expect(md).toContain("> speakers: '")
    expect(md).toContain("O''Brien")
  })
})

// ── Section layout: MEETING ──────────────────────────────────────────────────

describe('generateMarkdown — MEETING layout', () => {
  it('produces sections in correct order: Summary → Key Highlights → Decisions → Tasks', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    const summaryIdx = md.indexOf('## Summary')
    const highlightsIdx = md.indexOf('## Key Highlights')
    const decisionsIdx = md.indexOf('## Decisions')
    const tasksIdx = md.indexOf('## Tasks')
    const metadataIdx = md.indexOf('> [!info]- Igggy metadata')

    expect(summaryIdx).toBeGreaterThan(-1)
    expect(highlightsIdx).toBeGreaterThan(summaryIdx)
    expect(decisionsIdx).toBeGreaterThan(highlightsIdx)
    expect(tasksIdx).toBeGreaterThan(decisionsIdx)
    expect(metadataIdx).toBeGreaterThan(tasksIdx)
  })

  it('renders key topics with H3 headers and bullets', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).toContain('### Sprint Progress')
    expect(md).toContain('- Feature A is on track')
    expect(md).toContain('### Blockers')
  })

  it('renders decisions as bullet list', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).toContain('- Move Feature B deadline to Friday')
  })

  it('renders tasks as checkbox list with owner and context', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).toContain('- [ ] Fix rate limiter config (Owner: Alice) — blocking Feature B')
    expect(md).toContain('- [ ] Update sprint board')
  })

  it('does NOT include content prose for meetings', () => {
    const content = makeMeetingContent({ content: ['Some prose paragraph'] })
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).not.toContain('Some prose paragraph')
  })
})

// ── Section layout: MEMO ─────────────────────────────────────────────────────

describe('generateMarkdown — MEMO layout', () => {
  it('includes content prose paragraphs after decisions', () => {
    const md = generateMarkdown(makeTemplateData(makeMemoContent()))
    const decisionsIdx = md.indexOf('## Decisions')
    const proseIdx = md.indexOf('We should consider NATS')
    const tasksIdx = md.indexOf('## Tasks')

    expect(proseIdx).toBeGreaterThan(decisionsIdx)
    expect(tasksIdx).toBeGreaterThan(proseIdx)
  })

  it('uses "Key Highlights" header (not "Main Points")', () => {
    const md = generateMarkdown(makeTemplateData(makeMemoContent()))
    expect(md).toContain('## Key Highlights')
    expect(md).not.toContain('## Main Points')
  })
})

// ── Section layout: LECTURE ──────────────────────────────────────────────────

describe('generateMarkdown — LECTURE layout', () => {
  it('uses "Main Points" header instead of "Key Highlights"', () => {
    const md = generateMarkdown(makeTemplateData(makeLectureContent()))
    expect(md).toContain('## Main Points')
    expect(md).not.toContain('## Key Highlights')
  })

  it('renders decisions as "Key Terms"', () => {
    const md = generateMarkdown(makeTemplateData(makeLectureContent()))
    expect(md).toContain('## Key Terms')
    expect(md).toContain('- Eventual consistency')
    expect(md).not.toContain('## Decisions')
  })
})

// ── showTasks flag ───────────────────────────────────────────────────────────

describe('generateMarkdown — showTasks', () => {
  it('omits Tasks section when showTasks is false', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), { showTasks: false }))
    expect(md).not.toContain('## Tasks')
    expect(md).not.toContain('- [ ]')
  })

  it('omits Tasks section when actionItems is empty', () => {
    const content = makeMeetingContent({ actionItems: [] })
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).not.toContain('## Tasks')
  })
})

// ── Audio embed ──────────────────────────────────────────────────────────────

describe('generateMarkdown — audio embed', () => {
  it('includes audio embed when embedAudio is true and audioPath is provided', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      embedAudio: true,
      audioPath: 'Igggy/recording.m4a',
    }))
    expect(md).toContain('![[Igggy/recording.m4a]]')
  })

  it('does not include embed when embedAudio is false', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      embedAudio: false,
      audioPath: 'Igggy/recording.m4a',
    }))
    expect(md).not.toContain('![[')
  })

  it('does not include embed when audioPath is missing', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      embedAudio: true,
    }))
    expect(md).not.toContain('![[')
  })
})

// ── Transcript ───────────────────────────────────────────────────────────────

describe('generateMarkdown — transcript', () => {
  it('includes transcript section when transcript is provided', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      transcript: 'Hello, this is a test transcript.',
    }))
    expect(md).toContain('## Transcript')
    expect(md).toContain('Hello, this is a test transcript.')
  })

  it('omits transcript section when no transcript', () => {
    const md = generateMarkdown(makeTemplateData(makeMeetingContent()))
    expect(md).not.toContain('## Transcript')
  })

  it('substitutes speaker names when speakersJson has named speakers', () => {
    const speakers = JSON.stringify({
      count: 2,
      speakers: [
        { id: 0, label: 'Speaker 1', name: 'Alice' },
        { id: 1, label: 'Speaker 2', name: 'Bob' },
      ],
    })
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      transcript: '[Speaker 1]: Hello there.\n\n[Speaker 2]: Hi Alice.',
      speakersJson: speakers,
    }))
    expect(md).toContain('**Alice:** Hello there.')
    expect(md).toContain('**Bob:** Hi Alice.')
    // Transcript section should not contain raw speaker labels (they appear in metadata JSON, which is fine)
    const transcriptSection = md.slice(md.indexOf('## Transcript'), md.indexOf('> [!info]'))
    expect(transcriptSection).not.toContain('Speaker 1')
    expect(transcriptSection).not.toContain('Speaker 2')
  })

  it('keeps original speaker labels when speakers have no names', () => {
    const speakers = JSON.stringify({
      count: 2,
      speakers: [
        { id: 0, label: 'Speaker 1' },
        { id: 1, label: 'Speaker 2' },
      ],
    })
    const md = generateMarkdown(makeTemplateData(makeMeetingContent(), {
      transcript: '[Speaker 1]: Hello.\n\n[Speaker 2]: Hi.',
      speakersJson: speakers,
    }))
    expect(md).toContain('**Speaker 1:** Hello.')
    expect(md).toContain('**Speaker 2:** Hi.')
  })
})

// ── Empty sections ───────────────────────────────────────────────────────────

describe('generateMarkdown — empty sections', () => {
  it('omits Key Highlights when keyTopics is empty', () => {
    const content = makeMeetingContent({ keyTopics: [] })
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).not.toContain('## Key Highlights')
  })

  it('omits Decisions when decisions is empty', () => {
    const content = makeMeetingContent({ decisions: [] })
    const md = generateMarkdown(makeTemplateData(content))
    expect(md).not.toContain('## Decisions')
  })
})
