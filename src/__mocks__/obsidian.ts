// Minimal stub for the obsidian module — only what tests need.
// The real module is injected by Obsidian's Electron runtime at load time.
export class Notice {
  constructor(_msg: string, _timeout?: number) {}
}
export class TFile {
  path = ''
  name = ''
  extension = ''
  stat = { ctime: 0, mtime: 0, size: 0 }
  parent: { path: string } | null = null
}
export function normalizePath(p: string): string { return p }
export function requestUrl(_opts: unknown): Promise<unknown> { return Promise.resolve({}) }
export class SuggestModal<T> {
  app: unknown
  constructor(app: unknown) { this.app = app }
  setPlaceholder(_s: string) {}
  getSuggestions(_q: string): T[] { return [] }
  renderSuggestion(_item: T, _el: unknown) {}
  onChooseSuggestion(_item: T, _evt: unknown) {}
  open() {}
  close() {}
}
export class Menu {}
