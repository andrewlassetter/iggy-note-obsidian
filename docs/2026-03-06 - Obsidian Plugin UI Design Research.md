# Obsidian Plugin UI Design Research

_Researched: 2026-03-06_

---

## Official Design Guidelines

The [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) are enforced during community plugin review.

**Text & Naming**
- All UI text must use **sentence case** (not Title Case) — settings labels, button text, command names, descriptions
- Descriptions must end with punctuation (`.`, `?`, `!`)
- Command names must not include the plugin name (Obsidian prefixes them automatically)
- Plugin IDs cannot end with "plugin"; plugin names cannot end with "Plugin" or include "Obsidian"

**Structure**
- Do not set default keyboard shortcuts — let users configure their own
- Use `.setHeading()` to organize settings into sections
- Remove all sample/template boilerplate before submission

**Security**
- Never use `innerHTML` / `outerHTML` — XSS risk; use the `createEl` DOM API instead
- Do not create `<style>` elements dynamically — use `styles.css` bundled with the plugin

**Accessibility (mandatory)**
- Interactive elements must support keyboard navigation (Tab, Enter, Space)
- Icon-only buttons must have `aria-label` attributes
- Use `:focus-visible` CSS for focus indicators
- Touch targets must be minimum 44×44px
- Tooltips use the `data-tooltip-position` attribute

---

## UI Extension Points

Plugins can extend virtually every surface in the Obsidian interface:

| Surface | API |
|---|---|
| Left ribbon icon strip | `this.addRibbonIcon('iconId', 'Tooltip', callback)` |
| Status bar (desktop only) | `this.addStatusBarItem()` → returns `HTMLElement` |
| Command palette | `this.addCommand({ id, name, callback })` |
| Settings tab | `this.addSettingTab(new MySettingTab(...))` |
| File context menu | `workspace.on('file-menu', (menu, file) => ...)` |
| Editor context menu | `workspace.on('editor-menu', ...)` |
| Modal dialogs | `new Modal(app)` |
| Custom sidebar panels | `registerView()` + `getRightLeaf()` / `getLeftLeaf()` |
| Custom main area views | `registerView()` + `getLeaf()` |
| Markdown post-processing | `registerMarkdownPostProcessor()` |
| Editor behavior (live preview) | `registerEditorExtension()` (CodeMirror 6) |
| Inline autocomplete | `EditorSuggest<T>` |
| Hover cards | `HoverPopover` |

### Custom Views (Sidebar / Main Panels)

Custom `ItemView` panels give full control over a pane's content — any HTML, React, or Svelte can be mounted into `this.contentEl`.

```typescript
// Register during onload:
this.registerView(MY_VIEW_TYPE, (leaf) => new MyView(leaf))

// Open in right sidebar:
async activateView() {
  this.app.workspace.detachLeavesOfType(MY_VIEW_TYPE)
  await this.app.workspace.getRightLeaf(false).setViewState({
    type: MY_VIEW_TYPE, active: true,
  })
  this.app.workspace.revealLeaf(
    this.app.workspace.getLeavesOfType(MY_VIEW_TYPE)[0]
  )
}
```

Always call `detachLeavesOfType(VIEW_TYPE)` in `onunload()` to clean up. Wait for `workspace.onLayoutReady()` before creating leaves on startup.

---

## Built-in UI Classes

### Modals

| Class | Purpose |
|---|---|
| `Modal` | Base popup. Override `onOpen()` / `onClose()`. Has `contentEl`, `titleEl`. |
| `SuggestModal<T>` | Scrollable list with search. Implement `getSuggestions()`, `renderSuggestion()`, `onChooseSuggestion()`. |
| `FuzzySuggestModal<T>` | Built-in fuzzy search. Implement `getItems()`, `getItemText()`, `onChooseItem()`. |
| `AbstractInputSuggest<T>` | Typeahead/autocomplete attached to an existing input. |

### Notifications

```typescript
new Notice('Message text')        // auto-dismisses
new Notice('Message', 5000)       // 5-second timeout
new Notice('', 0)                 // persistent — use contentEl for HTML
```

### Settings Components

The `Setting` class is a chainable builder:

```typescript
new Setting(containerEl)
  .setName('Label')
  .setDesc('Description text.')
  .setHeading()                           // section separator (no control)
  .addText(t => t.setPlaceholder('...').setValue(v).onChange(...))
  .addTextArea(...)
  .addToggle(t => t.setValue(bool).onChange(...))
  .addDropdown(d => d.addOption('val', 'Label').setValue(v).onChange(...))
  .addSlider(s => s.setLimits(0, 100, 1).setValue(v).onChange(...))
  .addColorPicker(...)
  .addButton(b => b.setButtonText('Click').setCta().onClick(...))
```

Button variants:
- `.setCta()` — primary/call-to-action style
- `.setWarning()` — destructive action style

---

## DOM / HTML Element API

Obsidian augments `HTMLElement` with helpers that avoid raw `innerHTML`:

```typescript
const div = containerEl.createDiv({ cls: 'my-class' })
const span = div.createSpan({ text: 'Hello', cls: 'label' })
const btn = div.createEl('button', { text: 'Click', cls: 'mod-cta' })

// Setting dynamic CSS values:
element.style.setProperty('--my-var', value)   // correct for dynamic values
element.setCssProps({ '--my-var': value })       // Obsidian helper
```

Do **not** use CSS `attr()` for custom properties — browser support is insufficient.

---

## CSS Styling System

### How Plugins Inject CSS

Place a `styles.css` file in the plugin root. Obsidian loads it automatically when the plugin is enabled. Do not create `<style>` elements dynamically. Scope all selectors to your plugin to avoid conflicts.

### CSS Variables

Obsidian exposes a comprehensive CSS variable system. Plugins should always use these — never hardcode colors — so they render correctly across all user themes and in dark mode.

**Colors**
```css
--background-primary
--background-secondary
--background-modifier-border
--text-normal
--text-muted
--text-faint
--text-on-accent
--interactive-accent
--interactive-accent-hover
--color-red, --color-green, --color-blue, --color-yellow, --color-purple, --color-orange
/* Each has an RGB triplet variant for transparency: --color-red-rgb */
```

**Typography**
```css
--font-interface-theme      /* UI font family */
--font-text-theme           /* Editor/content font */
--font-monospace-theme      /* Code font */
--font-text-size            /* Base size, user-adjustable */
--font-normal, --font-medium, --font-semibold, --font-bold
--line-height-normal, --line-height-tight
```

**Layout**
```css
--size-*                    /* padding/margin scale */
--radius-s, --radius-m, --radius-l, --radius-xl
--border-width
```

**Component variables**
```css
/* Buttons */
--button-background, --button-background-hover

/* Modals */
--modal-background, --modal-width, --modal-border-radius

/* Navigation */
--nav-item-color, --nav-item-color-hover, --nav-item-color-active
--nav-item-background-hover, --nav-item-background-active

/* Status bar */
--status-bar-*
```

State suffixes follow a consistent pattern across all components: `-hover`, `-active`, `-selected`, `-focus`, `-collapsed`.

---

## Icons

Obsidian ships with the full [Lucide](https://lucide.dev/) icon library. Use `getIconIds()` to list available icons. Register custom SVG icons with:

```typescript
addIcon('my-icon', '<svg>...</svg>')
```

Community convention: use Lucide icons rather than shipping custom assets.

---

## Framework Integration

React and Svelte can both be mounted into any `contentEl` or `Modal.contentEl`:

**React**
```typescript
// onOpen:
const root = createRoot(this.contentEl)
root.render(<MyComponent />)
// onClose:
root.unmount()
```

**Svelte**
```typescript
// onOpen:
this.component = new MyComponent({ target: this.contentEl, props: {} })
// onClose:
this.component.$destroy()
```

---

## Community Conventions

- **No hardcoded colors** — always use `var(--color-*)` variables; themes and dark mode work automatically
- **Lucide icons** — use built-in Lucide rather than shipping custom icon assets
- **Style Settings plugin** — de facto standard for exposing user-configurable CSS variables; add a `/* @settings */` YAML block in `styles.css` to integrate
- **Obsidian Design System** — a community-maintained Figma file with UI components and styles (referenced in the Obsidian Hub plugin developer docs)
- **Destructive buttons** — `.setWarning()` on `ButtonComponent` or `.mod-warning` CSS class
- **Primary buttons** — `.setCta()` or `.mod-cta` CSS class

---

## Key Sources

- [Obsidian Developer Docs](https://docs.obsidian.md/)
- [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [CSS Variables Reference](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)
- [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [obsidian-style-settings](https://github.com/mgmeyers/obsidian-style-settings)
