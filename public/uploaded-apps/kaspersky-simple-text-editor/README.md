# Kaspersky Simple Text Editor

**Version: 1.0 (release-ready)**

A professional text and email editor that runs entirely in the browser — no server, no build step. Open `index.html` and start building rich HTML documents with a visual drag-and-drop interface.

## Quick Start

### Option A — Direct (browser)

1. Open **`index.html`** in any modern browser (Chrome, Firefox, Edge, Safari).
2. The editor is fully functional immediately — no installation or dependencies required.

> For the best experience use Chrome or Edge.

### Option B — Standalone window (recommended)

Double-click **`app\launch.bat`** (or **`app\launch.vbs`** for a silent start without a console window).  
The application will open in a standalone window — no address bar, no tabs, just the editor — using Microsoft Edge or Google Chrome's `--app` mode.  
If neither browser is found, the default browser is used as a fallback.

### Option C — Install on Windows

Double-click **`Installation\Setup.bat`**. A console Setup Wizard will open
where you can choose the install folder and confirm the installation.
**No administrator privileges are needed** — the installer defaults to a
per-user install in `%LOCALAPPDATA%\Programs`.
**No PowerShell is required** — the installer is a pure batch file that works
even on systems where PowerShell is restricted by security policy.

The installer will:
- Install to `%LOCALAPPDATA%\Programs\Kaspersky Simple Text Editor` (current user only)
- Create a **Desktop** shortcut and a **Start Menu** entry for the current user
- Register the application in the current user's **Add/Remove Programs**
- Support upgrading and uninstalling via the same installer

**Silent / CLI mode** is also available:

```bat
REM Silent per-user install (default, no admin)
Installation\install-windows.bat /silent

REM Silent system-wide install (requires admin)
Installation\install-windows.bat /silent /allusers

REM Silent uninstall
Installation\install-windows.bat /silent /uninstall

REM Check installed version
Installation\install-windows.bat /version
```

> **Note:** Use `/allusers` to install system-wide in `C:\Program Files` (requires admin elevation). The Windows installer also works from a ZIP archive — place the `Installation` folder next to the ZIP and run `Setup.bat`.

### Option D — Install on macOS

Double-click **`Installation/Setup.command`** in Finder.  
The installer will open in Terminal automatically — no manual terminal commands needed.
By default, the app is installed to `~/Applications` (per-user, no admin needed).

The installer will:
- Create a proper `.app` bundle in `~/Applications` (per-user) or `/Applications` (system-wide)
- Make the app available in **Launchpad** and **Spotlight**
- Open in Chrome / Edge `--app` mode for a standalone window experience

**Advanced / silent mode** (from Terminal):

```bash
./Installation/install-macos.sh --silent           # Silent per-user install
./Installation/install-macos.sh --allusers         # System-wide install
./Installation/install-macos.sh --uninstall         # Uninstall
./Installation/install-macos.sh --silent --uninstall # Silent uninstall
./Installation/install-macos.sh --version           # Show installed version
```

### Option E — Install on Linux

Double-click **`Installation/Setup.sh`** in your file manager (select "Run" when prompted).
By default, the app is installed per-user — no `sudo` needed.

The installer will:
- Copy files to `~/.local/share/kaspersky-simple-text-editor` (per-user, default) or `/opt/kaspersky-simple-text-editor` (system-wide with `sudo`)
- Create a `.desktop` entry for the application menu
- Create a launcher command in your `PATH`

For a **system-wide** install, run from terminal: `sudo ./Installation/install-linux.sh`

**Advanced / silent mode** (from Terminal):

```bash
./Installation/install-linux.sh --silent           # Silent per-user install
sudo ./Installation/install-linux.sh --silent      # Silent system-wide install
./Installation/install-linux.sh --uninstall         # Uninstall
./Installation/install-linux.sh --silent --uninstall # Silent uninstall
./Installation/install-linux.sh --version           # Show installed version
```

> **Note:** On Linux, run `app/launch.sh` directly for a quick standalone window without installing.

---

## Project Structure

The root contains the main entry point plus platform installers, documentation,
and ready-made examples. Application code, launchers, styles, and assets are
organized under `app/`.

```
├── index.html              ← Main entry (open in browser)
├── README.md               ← This file
│
├── Installation/           Platform installers (double-click to install)
│   ├── Setup.bat                  ⬅ Windows — double-click to install
│   ├── Setup.command              ⬅ macOS   — double-click to install
│   ├── Setup.sh                   ⬅ Linux   — double-click to install
│   ├── install-windows.bat        Windows installer engine (pure batch, no PowerShell)
│   ├── install-windows.ps1        Legacy Windows installer (PowerShell, GUI + silent mode)
│   ├── install-macos.sh           macOS installer engine (creates .app bundle)
│   └── install-linux.sh           Linux installer engine (creates .desktop entry)
│
├── app/                    Application code & resources
│   ├── launch.bat                 Standalone-window launcher — Windows (Edge / Chrome --app)
│   ├── launch.vbs                 Silent launcher — Windows (no console window)
│   ├── launch.sh                  Standalone-window launcher — macOS / Linux
│   ├── manifest.json              Web app manifest (icon & theme metadata)
│   ├── css/
│   │   ├── main.css               Base reset, layout, editor & preview panels, modals, tables, images
│   │   ├── preview-override.css   Preview-only style overrides
│   │   └── unified-preview.css    Figma-style unified UI, property panel, inline toolbar
│   ├── js/
│   │   ├── core.js                Config, state, color utilities
│   │   ├── outlook.js             Outlook CSS inliner & compatibility
│   │   ├── tables.js              Table creation, editing, resizing
│   │   ├── editor.js              Core editor, selection, events, paste handling
│   │   ├── formatting.js          Keyboard shortcuts, text formatting, format detection, TOC
│   │   ├── images.js              Image wrapper, resize, alignment, context menu
│   │   ├── jszip.min.js           Third-party JSZip library for ZIP export (minified)
│   │   ├── export.js              Undo/redo history, preview generation, save/load, export
│   │   ├── ui.js                  Toolbar, context menus, modals, notifications, page settings
│   │   ├── colors.js              Color picker, palette, highlight & line colours
│   │   ├── autosave.js            Auto-save to localStorage
│   │   ├── find-replace.js        Find & replace functionality
│   │   ├── validation.js          Alt-text validation, bulk image URL replace, image grid
│   │   └── preview-editing.js     Live preview editing, drag-drop, block actions, inline toolbar
│   └── assets/
│       ├── favicon.ico            Multi-resolution icon (16–256 px)
│       ├── favicon.svg            Vector source for favicon
│       └── sample-newsletter.mops Sample project file for "New from template"
│
├── docs/
│   └── PRESENTATION.md            Internal presentation draft
│
└── examples/               Example documents
    ├── Example (1).html
    ├── Example (2).html
    └── Example (3).html
```

### Script Load Order

The JS files are loaded via `<script>` tags in this specific order and share the global scope:

1. `i18n.js` → 2. `core.js` → 3. `outlook.js` → 4. `tables.js` → 5. `editor.js` → 6. `formatting.js` → 7. `images.js` → 8. `jszip.min.js` → 9. `export.js` → 10. `ui.js` → 11. `colors.js` → 12. `autosave.js` → 13. `find-replace.js` → 14. `validation.js` → 15. `preview-editing.js`

> **Note:** `preview-editing.js` is loaded near the end of `index.html` (after inline helper scripts), but still executes after the 14 base files above and shares the same global scope.

---

## Application Layout

The application uses a three-panel responsive layout:

```
┌─────────────────────────────────────────────────────────────────┐
│                        HEADER (Logo)                            │
├──────────────────┬─────────────────────┬────────────────────────┤
│  EDITOR PANEL    │  MAIN EDITOR CANVAS │  PREVIEW PANEL         │
│  (Toolbar +      │  (Contenteditable)  │  (Live Preview +       │
│   Sidebar)       │                     │   Property Panel)      │
└──────────────────┴─────────────────────┴────────────────────────┘
│                      SAVE / EXPORT BAR (Bottom floating)        │
└─────────────────────────────────────────────────────────────────┘
```

The sections below describe **every** panel, dialog, and menu in the interface together with the features the user encounters inside each one.

---

## 1 · Main Toolbar (Top Bar)

The toolbar sits at the top of the editor panel and contains the primary controls for editing, formatting, and file operations. It is always visible.

### 1.1 Document Metadata

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Title** input | `title` | Sets the document title | Typed text appears in the header block and the exported email `<title>` |
| **Issue** input | `issue` | Sets the issue number/date | Value is synced into the header block automatically |
| **HTML Title** input | `htmlTitle` | Sets the `<title>` of the exported HTML | Appears in the browser tab when the exported file is opened |

### 1.2 Text Styling Dropdowns

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Paragraph Style** | `paragraphStyle` | Applies block-level style (Normal, H1, H2, H3) | Selected text converts to the chosen heading or returns to a paragraph |
| **Font Size** | `fontSizeSelect` | Changes font size (12–24 px) | Selection resizes; the dropdown reflects the size at the cursor |
| **Line Height** | `lineHeightSelect` | Changes line spacing (1.2–2.0) | Paragraph spacing adjusts visually in the editor and preview |
| **Font Family** | `fontFamilySelect` | Changes font (Arial, Segoe UI, Times New Roman, Georgia, Courier) | Selection adopts the chosen font stack |

### 1.3 Table of Contents Configuration

Appears inside the toolbar when a TOC block exists in the newsletter.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **TOC Style** | `tocStyle` | Numbering style — Numbered, Roman, Letters, Bullets, None | TOC items re-render with the chosen markers |
| **TOC Layout** | `tocLayout` | Layout preset — Default, Kaspersky Digest, Pipe, Dash, Dots leader | TOC visually changes layout/separator style |
| **TOC Alignment** | `tocAlign` | Text alignment — Left, Right | TOC text aligns accordingly |
| **TOC Background** colour picker | `tocBgColor` | Sets the TOC block background | Background colour updates live |
| **TOC Edit** button | `tocEditBtn` | Enters inline TOC title editing mode | TOC items become editable in place |
| **TOC Reset** button | `tocResetBtn` | Rebuilds the TOC from headings | TOC regenerates from current H2/H3 headings in the editor |

### 1.4 Formatting Buttons

| Button | ID | Shortcut | What It Does | User Expectation |
|---|---|---|---|---|
| **Bold** | `btnBold` | `Ctrl+B` | Toggles bold on the selection | Selected text becomes bold (or un-bold) |
| **Italic** | `btnItalic` | `Ctrl+I` | Toggles italic | Selected text becomes italic |
| **Underline** | `btnUnderline` | `Ctrl+U` | Toggles underline | Selected text becomes underlined |
| **Insert Link** | `btnLink` | `Ctrl+K` | Inserts/edits a hyperlink | A URL prompt appears; text wraps in `<a>` with default link styles (teal, bold, no underline) |
| **Insert Table** | `btnTable` | — | Opens the Table Creator dialog | A visual grid picker appears for choosing dimensions or a template |
| **Insert Image** | `btnImage` | — | Opens the file picker for image upload | Image is inserted at cursor position with resize handles |

### 1.5 Colour Tools

| Button | ID | What It Does | User Expectation |
|---|---|---|---|
| **Text Colour** | `textColorBtn` | Opens the colour picker for foreground text | Selection colour changes; recent colours are stored |
| **Highlight** | `highlightBtn` | Opens the colour picker for text background highlight | Selection gets a coloured background; contrast is checked vs. WCAG |
| **Paragraph Background** | `paragraphBgBtn` | Opens the colour picker for full-line background | The entire paragraph/block gets a background colour |
| **Paragraph Spacing** | `spacingBtn` | Opens the Paragraph Spacing dialog | User can fine-tune line-height, margins, and padding |

When a colour is chosen the app:
- Validates contrast ratio (WCAG AA/AAA) and warns if contrast is insufficient.
- Adds the colour to a 12-item recent-colours history persisted in `localStorage`.
- Remembers the last-used colour per type (text, highlight, line background, page background, email background).

### 1.6 History & File Operations

| Button | Shortcut | What It Does | User Expectation |
|---|---|---|---|
| **Undo / History** | `Ctrl+Z` | Opens the history panel or undoes the last action | Editor reverts to a previous state (50-state undo stack) |
| **Redo** | `Ctrl+Y` / `Ctrl+Shift+Z` | Redoes the last undone action | Editor re-applies a previously undone change |
| **Find & Replace** | `Ctrl+F` | Opens the Find & Replace dialog | User can search, navigate, and replace text |
| **Save** | `Ctrl+S` | Opens the Save dialog to export a `.mops` project file | Project is downloaded as a JSON file containing all settings and content |
| **Load** | — | Opens the Load dialog to import a `.mops` file | All settings, content, and colours are restored |
| **Toggle Sidebar** | — | Shows or hides the sidebar panel | Sidebar slides in or out |
| **Autosave Indicator** | — | Shows "Autosave active" and last save time | User sees that work is being saved automatically |

---

## 2 · Save & Export Bar (Bottom Floating Bar)

A persistent bar at the bottom of the screen with all export options.

| Button | ID | What It Does | User Expectation |
|---|---|---|---|
| **Save** | — | Opens the Save dialog | Same as toolbar Save |
| **Load** | — | Opens the Load dialog | Same as toolbar Load |
| **Download HTML** | `downloadHtmlBtn` | Downloads the newsletter as `.html` with a choice of image format | A format modal appears: ZIP (images as separate files), Base64 (self-contained), or URL-only (external references) |
| **Download with Background** | `downloadHtmlBgBtn` | Downloads HTML + a 1 px background PNG strip | Two files are produced: the HTML and a `bg-*.png` — suitable for Bitrix and similar CMS |
| **Download for Outlook** | `downloadOutlookBtn` | Exports Outlook-optimised HTML | All CSS is inlined, flexbox is flattened to tables, MSO conditionals are added |
| **Copy HTML** | `copyHtmlBtn` | Copies the final HTML to the clipboard | User can paste directly into an email system or CMS |
| **Validate Outlook** | `validateOutlookBtn` | Runs a compatibility check and generates a report | A score (0–100) with detailed warnings/errors/info about unsupported CSS, missing alt text, layout issues |
| **Toggle Preview** | — | Switches between editor and full preview modes | Editor hides; preview fills the canvas for visual inspection |

### Export Formats at a Glance

| Format | When to Use | Notes |
|---|---|---|
| **ZIP** (recommended) | Cloud upload (ESP, CMS) | HTML + separate image files via JSZip |
| **Base64** | Quick preview, no hosting | All images embedded; file size can be large |
| **URL-only** | Images already hosted | HTML references external URLs as-is |
| **Outlook** | Microsoft Outlook rendering | MSO conditionals, inlined CSS, table-based layout |
| **Background** | Bitrix / CMS with separate BG image | HTML + extracted background PNG strip |

---

## 3 · Editor Canvas (Centre)

The main editing area is a `contenteditable` region where the user builds the newsletter.

### 3.1 Content Editing

| Feature | What It Does | User Expectation |
|---|---|---|
| **Rich text editing** | Type, format, and structure text | Works like a word processor — bold, italic, headings, lists, links |
| **Block structure** | Content is organized into newsletter blocks | Each block (header, article, TOC, footer) is a discrete section |
| **Drag-and-drop reorder** | Blocks have a six-dot handle (⠿) on hover | Dragging a block moves it to a new position |
| **Keyboard block movement** | `Alt+↑` / `Alt+↓` | Moves the selected block one position up or down |
| **Block navigation** | `Alt+]` / `Alt+[` | Cycles focus to the next or previous article block |
| **Duplicate block** | `Ctrl+D` | Creates a copy of the current block below it |
| **Copy/Paste block** | `Ctrl+Shift+C` / `Ctrl+Shift+V` | Copies the entire block HTML and pastes it as a new block |

### 3.2 Paste Handling

| Scenario | Behaviour | User Expectation |
|---|---|---|
| **Paste from Word / Google Docs** | Style-based formatting is converted to semantic tags (`<b>`, `<i>`, `<a>`); everything else is stripped | Only bold, italic, underline, and links survive; layout rubbish is removed |
| **Paste plain text** (`Ctrl+Shift+V`) | All HTML is stripped | Plain unformatted text is inserted |
| **Paste image from clipboard** | A modal appears offering two options | User chooses "Embed as Base64" or "Insert with URL" |
| **Paste HTML** | HTML is sanitised, preserving safe tags | Clean, predictable HTML is inserted |

### 3.3 Newsletter Block Types

| Block | Description | Special Features |
|---|---|---|
| **Header Block** (`#headerBlock`) | Newsletter logo, title, and issue line | Title/issue synced from metadata inputs; header colours configurable |
| **TOC Block** (`#tocBlock`) | Table of Contents | Auto-generated from H2/H3 headings; style/layout/alignment configurable |
| **Content / Article Block** | Main article sections (numbered 01, 02, …) | Auto-renumbering, tags, image placeholders, per-article overrides |
| **Footer Block** (`#footerBlock`) | Footer with links, legal, contact info | Footer banner URL configurable from sidebar |
| **Table** | Data tables or layout tables | Full table editing (see § 9 Table Creator) |
| **Image** | Standalone or inline images | Wrapped with resize handles, context menu (see § 3.4) |

### 3.4 Image Editing in the Editor

When the user clicks an image it is wrapped in an interactive container with:

| Feature | What It Does | User Expectation |
|---|---|---|
| **8-point resize handles** | Corner and edge handles for proportional resizing | Image scales smoothly (min 20 px, max 600 px), maintaining aspect ratio |
| **Layout chips** | Buttons for Inline / Block / Float-Left / Float-Right | Image layout changes instantly in the editor and preview |
| **URL bar** | Shows current `src`; editable | Changing the URL updates the image; upload button also available |
| **Error state** | Broken-image indicator | User sees that the URL is invalid and can replace it |

Right-click (or context menu trigger) on an image opens the **Image Context Menu** (§ 8.1).

### 3.5 Table Editing in the Editor

When the user clicks a table cell:

| Feature | What It Does | User Expectation |
|---|---|---|
| **Cell selection** | Cell is highlighted with a teal outline | User knows which cell is active |
| **Mini-toolbar** | A toolbar appears above the cell | Quick access to insert row/column, style cell, delete row |
| **Keyboard navigation** | Tab / Shift+Tab / Arrow keys | Moves focus between cells like a spreadsheet |
| **Column/row resize** | Drag column or row borders | Columns and rows resize interactively |

Right-click on a table cell opens the **Table Context Menu** (§ 8.2).

### 3.6 Link Editing

| Feature | What It Does | User Expectation |
|---|---|---|
| **Click a link** | A floating URL popup appears | User can view, edit, or remove the link URL |
| **Double-click a link** | Link URL opens or enters edit mode | User can navigate to or modify the destination |
| **Default link styling** | New links get teal colour (`#29ccb1`), bold, no underline | Consistent look; user can override later |

### 3.7 Outlook Warning Badges

Blocks containing CSS unsupported by Outlook (e.g. `border-radius`, `box-shadow`, `display:flex`) display a **⚠️ badge** in the top-right corner. Hovering shows specific warnings. This is always active while editing.

---

## 4 · Live Preview Panel (Right)

The preview panel shows a live rendered preview of the newsletter as it will appear in the final email.

### 4.1 Preview Header Controls

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **"📋 Live Preview"** label | — | Indicates the panel's purpose | Purely informational |
| **Preview Device Toggle** | `previewModeToggle` | Switches between 🖥️ Desktop (600px), 💻 Tablet (375px), and 📱 Mobile (320px) preview widths | Preview width changes immediately so responsive behaviour can be checked while editing |

### 4.2 Preview Interaction (Unified UI Mode)

When the user clicks elements in the preview:

| Interaction | What Happens | User Expectation |
|---|---|---|
| **Hover** | Element gets a teal outline (`preview-hover`) | User sees what they are about to select |
| **Single click** | Element is selected; an action menu appears | User can duplicate, move, delete, or convert the block |
| **Double-click** | Element enters inline edit mode | User can type directly in the preview; changes sync back to the editor |
| **Right-click** | Preview context menu appears (§ 8.4) | User can change width, padding, colour, corner radius |

### 4.3 Block Drag-and-Drop in Preview

| Feature | What It Does | User Expectation |
|---|---|---|
| **Drag block** | Mousedown + drag on a block starts reorder | A drop indicator shows the landing position |
| **Drop** | Block is moved to the new position | DOM order updates in both preview and editor |
| **Delete zone** | Dragging to the bottom reveals a red delete zone | Dropping there deletes the block |

### 4.4 Inline Toolbar (Text Editing in Preview)

Appears when the user double-clicks a text element in the preview:

| Group | Controls | What They Do |
|---|---|---|
| **Text Style** | B, I, U, S | Bold, Italic, Underline, Strikethrough |
| **Colour** | Text colour (A), Highlight | Opens inline colour pickers |
| **Structure** | Link, Unlink, Remove format | Insert/edit/remove links; clear all formatting |
| **Lists** | Bullet (•), Numbered (1.) | Convert selection to unordered or ordered list |

The toolbar floats above the selected element and repositions as the user scrolls.

### 4.5 Property Panel (Element Inspector)

When an element is selected in the preview, the property panel appears in the sidebar with context-specific settings:

#### Common Properties (all element types)

| Property | Control | User Expectation |
|---|---|---|
| **Text colour** | `propTextColor` picker | Changes text colour on the selected element |
| **Background colour** | `propBgColor` picker | Changes background on the selected element |
| **Font size** | `propFontSize` input | Changes font size (6–72 px) |
| **Line height** | `propLineSpacing` dropdown | Changes line spacing |
| **Font family** | `propFontFamily` dropdown | Changes font stack |
| **Text alignment** | `propAlign` dropdown | Left / Centre / Right |

#### Block Properties

| Property | Control | User Expectation |
|---|---|---|
| **Block background** | `propBlockBgColor` picker | Sets the background of the entire content block |
| **Block border colour** | `propBlockBorderColor` picker | Adds a border around the block |
| **Block border radius** | `propBlockBorderRadius` input | Rounds block corners (px) |
| **Block border width** | `propBlockBorderWidth` input | Sets border thickness (px) |
| **Block padding** | `propBlockPadding` input | Inner spacing (px) |
| **Background preset** | `propBgStylePreset` dropdown | Quick apply: White / Mint / Custom |
| **Width preset** | `propWidthPreset` dropdown | Quick width setting |
| **Spacing preset** | `propSpacingPreset` dropdown | Quick margin/padding preset |

#### Spacing Properties (expandable section)

| Property | Control | User Expectation |
|---|---|---|
| **Margin Top / Bottom / Left / Right** | `propMarginTop` etc. | Outer spacing around the element |
| **Padding Top / Bottom / Left / Right** | `propPaddingTop` etc. | Inner spacing inside the element |

#### Image Properties

| Property | Control | User Expectation |
|---|---|---|
| **Width / Height** | `propImgWidth`, `propImgHeight` | Resize the image (px) |
| **Alignment** | `propImgAlign` dropdown | Left / Centre / Right |
| **Wrap** | `propImgWrap` dropdown | Inline / Block / Float-Left / Float-Right |
| **Alt text** | `propAlt` input | Sets the image alt attribute for accessibility |

#### Two-Column Layout Properties

| Property | Control | User Expectation |
|---|---|---|
| **Column 1 width** | `propTwoColCol1Width` | Width of the left column (px) |
| **Column 2 width** | `propTwoColCol2Width` | Width of the right column (px) |
| **Gutter width** | `propTwoColGutterWidth` | Space between columns (px) |

#### TOC Properties (when TOC block selected)

| Property | Control | User Expectation |
|---|---|---|
| **TOC style** | `propTocStyle` | Numbering: Numbered / Roman / Letters / Bullets / None |
| **TOC layout** | `propTocLayout` | Layout preset |
| **TOC alignment** | `propTocAlign` | Left / Right |

All property changes apply in real time and sync back to the main editor.

---

## 5 · Sidebar Panel

The sidebar is a scrollable panel on the left containing collapsible sections for project-wide settings, templates, and batch operations.

### 5.1 Document Operations

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **New Document** | `newDocumentBtn` | Clears all content and starts fresh | A confirmation prompt appears; editor is wiped clean |
| **Preview in Tab** | `exportPreviewBtn` | Opens the exported email in a new browser tab | User sees the final result exactly as recipients will |
| **Import HTML** | `importHtmlBtn` | Loads an existing HTML file into the editor | Content is parsed, sanitised, and displayed for further editing |
| **Compare with Reference** | `compareHtmlBtn` | Opens a side-by-side comparison view | User can compare their work with an original or previous version |
| **Preheader Text** | `preheader` | Sets the hidden preview text for email clients | Text appears in inbox previews but not in the email body |
| **Dark-mode Safe** checkbox | `darkModeSafe` | Adds colour-scheme meta tags for dark mode support | Exported email renders correctly in dark-mode email clients |

### 5.2 Responsive Breakpoints

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Breakpoints List** | `breakpointsList` | Shows configured viewport widths | Each breakpoint can be clicked to preview at that width |
| **Add Breakpoint** | `addBreakpointBtn` | Adds a custom breakpoint (label, min/max width) | New breakpoint appears in the list |
| **Quick Presets** | — | iPhone SE / 6–8 / Plus / 12–14 | Adds common device widths in one click |
| **Reset Breakpoints** | `resetBreakpointsBtn` | Restores default breakpoints (320, 375, 414 px) | List reverts to defaults |

### 5.3 Starter Kits

| Control | What It Does | User Expectation |
|---|---|---|
| **Kaspersky Digest — 4 articles** | Inserts a 4-article newsletter template | Editor populates with header, TOC, 4 article blocks, and footer |
| **Kaspersky Digest — 8 articles** | Same, with 8 articles | Larger newsletter scaffold |
| **Kaspersky Digest — 12 articles** | Same, with 12 articles | Largest default scaffold |
| **Custom count** input + button | `customArticleCount` / `customStarterKitBtn` | Enter any number and generate that many article blocks |
| **Pre-fill titles & tags (CSV)** | `starterKitArticleCsv` | Paste CSV rows (no header) in format `Title,Tag 1,Tag 2`; the custom generator uses the row count automatically and pre-fills article titles and tags. Empty tag columns are skipped. |

### 5.4 Block Templates

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Import shared templates** | `importTemplatesBtn` | Imports `.kste-blocks` and `.kste-layout` files | Shared block templates are added to the library; shared layouts/starter kits can be applied to the current project |
| **Export block templates** | `exportTemplatesBtn` | Exports selected block templates to `.kste-blocks` | Team members can import the same reusable blocks in other projects |
| **Export layout template** | `exportLayoutBtn` | Exports current editor content/settings to `.kste-layout` | Teams can share complete starter layouts across projects |
| **Block Template Library** | `blockTemplateLibrary` | A catalogue of drag-and-drop block templates with visual thumbnail previews | User can hover for a scaled preview, then drag or click to insert a template block at any position |

Templates include:
- Article blocks (white / mint background)
- Two-column layouts (image left / image right)
- Article with arrow link
- Tag pill block
- Hero image
- Footer block

### 5.5 Contents (Table of Contents)

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Show Contents** checkbox | `toggleToc` | Toggles the TOC block visibility | TOC block appears/disappears in the newsletter |
| **Sync TOC from Articles** | `syncTocBtn` (`Ctrl+Shift+T`) | Rebuilds the TOC from current H2/H3 headings | TOC updates to reflect the latest heading structure |

### 5.6 Global Image URLs

A centralized place to manage recurring image URLs used throughout the newsletter.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Arrow Image URL** | `arrowImageUrl` | URL for the "read more" arrow image | All arrow links in article blocks use this URL |
| **Arrow Alignment** | `arrowAlign` + `applyArrowAlignBtn` | Sets the alignment for all arrow images | All arrows shift to Left / Centre / Right |
| **Hero Image URL** | `heroImageUrl` | URL for the hero/banner image | Header block hero image updates |
| **Digest Number** | `digestNumber` | Number used in auto-generated image URLs | Article image pattern includes this number |
| **Contact Icon URL** | `contactImageUrl` | URL for the contact section icon | Footer contact icon updates |
| **Feedback Button URL** | `feedbackButtonUrl` | URL for the feedback CTA image | Feedback button in the newsletter updates |
| **Footer Banner URL** | `footerBannerUrl` | URL for the footer banner image | Footer banner updates |
| **Article Image Pattern** | `articleImagePattern` | URL template with `{n}` placeholder for article number | Auto-fill replaces `{n}` with 01, 02, 03… |
| **Per-article Overrides** | `articleImageOverridesDetails` | Expandable list of per-article custom URLs | Each article can have its own image URL override |
| **Auto-fill Article Images** | `autoFillArticleImagesBtn` | Applies the pattern URL to all placeholder images | All article placeholders get their generated URLs |
| **Bulk Upload Article Images** | `bulkArticleImgUploadBtn` | Upload multiple images at once | Images are assigned to articles in sequence |
| **Bulk Image URL Replace** | `imgUrlFind` / `imgUrlReplace` / `bulkReplaceImageUrlsBtn` | Find-and-replace across all image `src` attributes | All matching image URLs are updated at once |
| **Visual Image Grid** | `openImageGridBtn` | Opens a grid view of all article images | User can review and replace images visually (§ 9.7) |

### 5.7 Nested Table Spacing

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Cell Padding** | `nestedCellPadding` | Default padding inside nested table cells (px) | New tables use this padding value |
| **Gap** | `nestedCellGap` | Spacer width between table columns (px) | New tables use this gap value |

### 5.8 Image Library

A reusable collection of image URLs that the user can drag-and-drop into the newsletter.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Library Items** | `imageLibraryItems` | List of saved image URLs with thumbnails | User can drag an image URL into a table cell or content area |
| **Add URL** input + button | `imageLibraryInput` / `imageLibraryAddBtn` | Adds a new URL to the library | Image thumbnail appears in the library list |

### 5.9 Image Alt Text Validation

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Check Alt Text** | `checkAltTextBtn` | Scans all images for missing `alt` attributes | Missing-alt images get an orange dashed border; notification shows count |
| **Fix All Alt Text** | `fixAllAltTextBtn` | Prompts for text and bulk-sets `alt` on all images missing it | All images get an alt attribute; outlines are cleared |

A `MutationObserver` also runs in the background, automatically checking newly added images.

### 5.10 Text Presets

Quick-apply buttons that set font size, line height, colour, and weight in one click.

#### Generic Presets (with editable size & line-height)

| Button | ID | Resulting Style |
|---|---|---|
| **Body** | `presetGenericBody` | Applies body text style with user-specified font size and line height |
| **Heading** | `presetGenericHeading` | Applies heading style with user-specified font size and line height |
| **Label** | `presetGenericLabel` | Applies label style with user-specified font size and line height |

Each generic preset has inline number inputs so the user can set a custom font size (px) and line height before clicking.

#### Article-Specific Presets

| Button | ID | Resulting Style |
|---|---|---|
| **Body Text** | `presetBodyText` | Standard paragraph style (e.g. 14 px, regular) |
| **Sub-heading** | `presetSubheading` | Larger, bolder style for section sub-titles |
| **Article Title** | `presetArticleTitle` | Title style for article headings |
| **Footer Text** | `presetFooterText` | Smaller, lighter style for footer content |
| **Insert Article Header** | `presetInsertArticleHeader` | Inserts a pre-formatted article header template |
| **Caption** | `presetCaption` | Small italic style for image captions |

### 5.11 Block Operations

Batch and per-block operations for managing newsletter sections.

| Button | ID | What It Does | User Expectation |
|---|---|---|---|
| **Block BG: White** | `bgWhiteBtn` | Sets the selected block background to white | Block turns white |
| **Block BG: Mint** | `bgMintBtn` | Sets the selected block background to mint | Block turns mint-green |
| **Custom Block BG** | `blockBgColor` picker | Sets any custom background colour | Colour picker opens; block colour updates |
| **Auto-alternate** | `autoAlternateBtn` | Toggles blocks between white and mint backgrounds | Odd blocks get white, even blocks get mint (or vice versa) |
| **Renumber Articles** | `renumberBtn` | Auto-numbers all article blocks 01, 02, 03… | Article numbers update sequentially |
| **Duplicate Block** | `duplicateBlockBtn` | Duplicates the currently selected content block | A copy appears below the original |
| **Copy Block** | `copyBlockBtn` | Copies the block HTML to the block clipboard | Block is ready to paste |
| **Paste Block** | `pasteBlockBtn` | Pastes a previously copied block | New block appears after the selection |
| **Apply Style to All** | `applyToAllBtn` | Copies the selected block's style to all article blocks | All articles get consistent styling |
| **Refresh URLs** | `refreshUrlsBtn` | Re-applies the image URL pattern to all template images | All auto-generated URLs are refreshed |
| **Teal Sub-heading** | `tealSubheadingBtn` | Applies teal colour to all article sub-headings | Sub-headings turn teal across all blocks |
| **Arrow-Link Toggles** | `openArrowToggleBtn` | Opens the Arrow Toggle dialog (§ 9.6) | User can show/hide individual arrow links |
| **Batch Title Editor** | `openBatchTitleBtn` | Opens the Batch Title Editor dialog (§ 9.5) | User can edit all article titles in one place |

### 5.12 Tags

Tags are category labels that can be added to article blocks (e.g. "CRM", "Analytics", "Mautic").

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Tag Picker** dropdown | `tagPicker` | Select a predefined tag (CRM, KORM, Web KORM, KORM Quotes, KORM Promo, KORM Subscriptions, Mautic, Mindbox, KL Academy, Partner Portal, ELMA, SiteEditor, Analytics, Marketing) | Tag is applied to the current block |
| **Add Tag** | `addTagBtn` | Adds the selected tag to the current block | A coloured pill badge appears in the block |
| **Remove Tag** | `removeTagBtn` | Removes the selected tag from the current block | The pill badge is removed |
| **One-Click Tags** | `oneClickTagButtons` | Inline buttons for the most common tags | Single click adds a tag |
| **Tag Picker Panel** | `tagPickerPanel` | Checkbox-based panel for selecting multiple tags at once | User checks tags and clicks "Apply" |
| **Batch Add / Remove** | `batchAddTagBtn` / `batchRemoveTagBtn` | Adds or removes the selected tag across all article blocks | All articles are updated at once |
| **Tag Matrix** | `openTagMatrixBtn` | Opens the Tag Matrix dialog (§ 9.4) | A grid showing which tags are on which blocks; user can toggle with one click |

---

## 6 · Page Settings Panel

Accessed from the Figma-style toolbar or the preview context menu.

| Setting | ID | What It Does | User Expectation |
|---|---|---|---|
| **Email Width** | `pageWidth` | Sets the content area width (320–900 px; default 600 px) | Preview and exported email resize |
| **Top / Bottom Padding** | `pagePadding` | Vertical padding inside the email body | White space above and below content adjusts |
| **Left / Right Padding** | `pageHPadding` | Horizontal padding inside the email body | Side margins adjust |
| **Page Background** | `pageBgColor` | Colour behind the email (visible in desktop clients) | Outer background colour changes |
| **Email Background** | `emailBgColour` | Colour of the content area itself | Inner background colour changes |

---

## 7 · Comparison View (Overlay)

Opened by the **Compare with Reference** button. A full-screen overlay with three modes:

### 7.1 Visual Comparison (`compareModeVisual`)

| Feature | What It Does | User Expectation |
|---|---|---|
| **Side-by-side panels** | "Your Preview" on the left, "Reference File" on the right | User visually spots differences |
| **Sync Scroll** (`syncScrollBtn`) | Scrolling one panel scrolls the other | Both panels stay aligned |

### 7.2 HTML Diff (`compareModeDiff`)

| Feature | What It Does | User Expectation |
|---|---|---|
| **Line-by-line diff** | Shows added/removed/changed HTML lines | Green = added, red = removed; user sees exact code changes |
| **Diff Stats** | Summary counts of additions, removals, changes | Quick overview of how much changed |

### 7.3 Article-Level Structural Diff (`compareModeStructural`)

| Feature | What It Does | User Expectation |
|---|---|---|
| **Block comparison** | Compares article blocks between documents | User sees which articles were added, removed, or reordered |
| **Structural Stats** | Summary of structural differences | Quick overview of newsletter structure changes |

Close button returns to the normal editor view.

---

## 8 · Context Menus

### 8.1 Image Context Menu

Appears on right-click on an image in the editor.

| Menu Item | What It Does | User Expectation |
|---|---|---|
| **🔄 Replace** | Opens the file picker to replace the image | Selected image is swapped |
| **📐 Wrap → Inline / Block / Float ← / Float →** | Changes image layout mode | Image repositions according to the chosen wrap |
| **➡️ Align → Left / Centre / Right** | Changes image alignment | Image aligns within its container |
| **🔗 Add link…** | Opens the Image Link Editor | User enters a URL; image becomes clickable |
| **❌ Remove link** | Removes the hyperlink from the image | Image is no longer wrapped in `<a>` |
| **📋 Copy style** | Saves the image's inline styles (dimensions, borders, shadows, padding) to a clipboard | User can paste the style onto another image |
| **📎 Paste style** | Applies previously copied image styles | Target image gets the same dimensions and styling |
| **🗑️ Delete** | Removes the image from the editor | Image is deleted |

### 8.2 Table Context Menu

Appears on right-click on a table cell.

| Menu Item | What It Does | User Expectation |
|---|---|---|
| **⬆️ Insert row above** | Adds a row above the current cell | New empty row appears above |
| **⬇️ Insert row below** | Adds a row below | New empty row appears below |
| **📋 Duplicate row** | Clones the entire row with styling | Copy of the row appears below |
| **⬅️ Insert column left** | Adds a column to the left | New column appears on the left |
| **➡️ Insert column right** | Adds a column to the right | New column appears on the right |
| **🗑️ Delete row** | Removes the row | Row disappears |
| **🗑️ Delete column** | Removes the column | Column disappears |
| **📋 Duplicate cell** | Clones the cell content | A copy replaces or is inserted |
| **⬜ Merge cells** | Combines selected cells into one | Cells merge; content is combined |
| **▦ Split cell** | Splits a merged cell back into individual cells | Cell reverts to separate cells |
| **🎨 Cell styling…** | Opens the Cell Styling panel (§ 9.11) | User can set background, text colour, borders, padding, alignment |
| **↔️ Style row…** | Applies cell style to the entire row | All cells in the row get the same styling |
| **↕️ Style column…** | Applies cell style to the entire column | All cells in the column get the same styling |
| **⚙️ Table properties…** | Opens the full Table Properties panel | User can set border, cell padding, cell spacing |

### 8.3 Text Context Menu

Appears on right-click in a text area.

| Menu Item | What It Does | User Expectation |
|---|---|---|
| **Normal text / H1 / H2 / H3** | Changes the block type | Paragraph converts to the chosen heading or vice versa |
| **Bold / Italic / Underline** | Toggles text formatting | Selected text is formatted |
| **Bullet list / Numbered list** | Converts to list | Text becomes a list |
| **Insert link…** | Opens the link editor | User can add a hyperlink |
| **🖼️ Inline image…** | Opens the file picker | Image is inserted at the cursor |
| **Change colour…** | Opens the colour picker | User can change text colour |

### 8.4 Preview Context Menu

Appears on right-click in the preview panel.

| Menu Item | What It Does | User Expectation |
|---|---|---|
| **Change width…** | Opens width input | User can set a custom width for the email |
| **Change padding…** | Opens padding input | User can adjust email padding |
| **Change colour…** | Opens colour picker | User can change the page/email background |
| **Corner radius…** | Opens radius input | User can round block corners |
| **Show/Hide settings panel** | Toggles the page settings panel | Settings panel slides in or out |

### 8.5 Block Action Menu (Preview)

Appears when clicking a block in the preview.

| Menu Item | What It Does | User Expectation |
|---|---|---|
| **✏️ Edit** | Enters inline edit mode | Block becomes editable in place |
| **📁 Replace from file…** | Opens file picker (images only) | Image is replaced |
| **📋 Duplicate** | Shallow-clone of the element | A copy appears below |
| **📑 Duplicate Block** | Deep-clone of the entire content block | Full block copy with all children |
| **⬆️ Move up / ⬇️ Move down** | Repositions the block | Block shifts one position |
| **🎨 Copy style** | Copies inline styles | Styles are stored in clipboard |
| **📌 Paste style** | Applies copied styles | Block adopts the buffered styles |
| **♻️ Update TOC** | Rebuilds the TOC (TOC blocks only) | TOC regenerates from headings |
| **✏️ Edit Titles** | Enters TOC title editing mode (TOC blocks only) | TOC items become editable |
| **🔄 Convert to…** | Opens conversion submenu | Block converts to a different layout: Article White, Article Mint, Two-Col Image Left, Two-Col Image Right, Article with Arrow Link |
| **🗑️ Delete** | Removes the block | Block is deleted |

---

## 9 · Modal Dialogs

### 9.1 Save Dialog

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Filename** input | `saveFilename` | Name for the `.mops` file | User types a filename |
| **Save** button | — | Downloads the project as JSON | File saves with content, settings, colours, URLs, metadata |
| **Cancel** button | — | Closes the dialog | Nothing is saved |

Saved data includes: editor HTML, title, issue, all colour settings (page BG, email BG, body text), layout dimensions (width, padding), all image URLs, article overrides, TOC settings, preheader, dark-mode flag, and version (v2.1).

### 9.2 Load Dialog

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **File picker** | — | Selects a `.mops` or `.json` file | File is parsed and validated |
| **Load** button | — | Restores the project | All settings, content, and colours are restored; supports v1.0, v2.0, v2.1 formats |
| **Cancel** button | — | Closes the dialog | Nothing is loaded |

### 9.3 Paste Image Modal

Appears when an image is pasted from the clipboard.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Image Preview** | `pasteImagePreview` | Shows the pasted image | User can verify the image before inserting |
| **Hosted URL** input | `pasteImageUrlInput` | User can enter a hosted URL instead of embedding | Recommended for email compatibility |
| **Embed as Base64** button | `pasteImageEmbedBtn` | Inserts the image with base64 data URL | Quick but increases file size; not recommended for email |
| **Insert with URL** button | `pasteImageUrlBtn` | Inserts with the entered URL | Clean, lightweight; recommended for production |

### 9.4 Tag Matrix

A grid-style editor for managing tags across all article blocks at once.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Tag Matrix Grid** | `tagMatrixGrid` | Rows = articles, columns = tags; cells are toggleable | User clicks cells to add/remove tags per article |
| **New Custom Tag** input | `newCustomTagInput` | Adds a user-defined tag to the system | Custom tag column appears in the grid |
| **Add Tag** button | `addCustomTagBtn` | Confirms the custom tag | Tag is created |
| **Close** button | `closeTagMatrixBtn` | Closes the dialog | Changes are preserved |

### 9.5 Batch Title Editor

Edit all article titles in a single view.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Title list** | `batchTitleList` | Text inputs for each article title, listed vertically | User can quickly review and update all titles |
| **Apply All** | `applyBatchTitleBtn` | Writes changes back to the editor | All article titles update |
| **Cancel** | `closeBatchTitleBtn` | Discards changes | Titles remain unchanged |

### 9.6 Arrow-Link Toggles

Control the visibility of arrow-link images in each article block.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Toggle All** checkbox | `arrowToggleAll` | Shows or hides all arrow links at once | All arrows appear or disappear |
| **Per-article toggles** | `arrowToggleList` | Individual checkbox per article | Specific arrows are shown or hidden |
| **Close** button | `closeArrowToggleBtn` | Closes the dialog | Changes are preserved |

### 9.7 Visual Image Grid

A grid of all article images for quick visual review and replacement.

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Image Grid** | `imageGridList` | Thumbnails of all article images (excluding hero, arrows, footer) | User sees a bird's-eye view of all images |
| **URL input** per image | — | Shows current URL; editable | Pasting a new URL updates the image live |
| **📁 Replace** button per image | — | Opens the file picker | User can replace an individual image from a local file |
| **Close** button | `closeImageGridBtn` | Closes the dialog | Changes are preserved |

File validation: images must be `image/*` type, max 10 MB.

### 9.8 Download Format Chooser

Appears when downloading the HTML export.

| Option | ID | Description | User Expectation |
|---|---|---|---|
| **ZIP for Cloud Upload** (recommended) | `dlFormatZip` | HTML + separate image files in a `.zip` | Clean separation; images extracted from base64 and replaced with file references |
| **Self-contained HTML (Base64)** | `dlFormatBase64` | All images embedded as data URIs | Single file, no external dependencies; file can be large |
| **URL References Only** | `dlFormatUrl` | External image URLs kept as-is | Lightest file; requires images to be hosted elsewhere |

### 9.9 Find & Replace Dialog

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Find** input | `findText` | Text to search for | Matches are highlighted in the editor |
| **Replace** input | `replaceText` | Replacement text | Matches are replaced one at a time or all at once |
| **Case Sensitive** checkbox | `caseSensitive` | Toggles case sensitivity | Search becomes exact-match |
| **Use Regex** checkbox | `useRegex` | Enables regular expression search | User can use patterns like `\d+` or `(foo|bar)` |
| **Find Next** button | — | Jumps to the next match | Editor scrolls to and highlights the match |
| **Find Previous** button | — | Jumps to the previous match | Editor scrolls back |
| **Replace** button | — | Replaces the current match and jumps to next | Text is replaced; formatting is preserved |
| **Replace All** button | — | Replaces all matches at once | All occurrences are updated; count is displayed |
| **Status display** | `findReplaceStatus` | Shows "Match X of Y" or "Replaced N match(es)" | User knows how many results exist |

### 9.10 Table Creator Dialog

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Grid Selector** | `tableGridSelector` | A visual 10×10 grid; hover to select dimensions | User sees the chosen size highlight (e.g. "5 × 3") |
| **Rows / Columns** inputs | `tableRowsInput` / `tableColsInput` | Manual dimension entry (1–50 rows, 1–20 cols) | Grid and display sync with the typed values |
| **Quick Templates** | — | Buttons for common layouts: | — |
| — Image + Text | `two-col-image` | Left image column + right text column | Two-column layout with image |
| — Two Columns | `two-col` | Two equal-width columns | Balanced layout |
| — Article Block | `newsletter-article` | Numbered article with image, title, body | Complete article template |
| — Data Table | `data-table` | 4×3 styled data table with header row | Structured data grid |
| — Image + Caption | `image-with-caption` | Full-width image + caption row below | Image with descriptive text |
| **Create Table** button | — | Inserts the table at the cursor | Table appears in the editor with all cell editing features active |

### 9.11 Cell Styling Panel

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Background Colour** | `cellBgColor` | Cell background colour | Cell fills with colour |
| **Text Colour** | `cellTextColor` | Cell text colour | Text colour changes |
| **Padding** | `cellPadding` | Inner padding (0–50 px) | Space inside the cell adjusts |
| **H-Align** | `cellHAlign` | Horizontal alignment (Left / Centre / Right) | Text aligns horizontally |
| **V-Align** | `cellVAlign` | Vertical alignment (Top / Middle / Bottom) | Content aligns vertically |
| **Border Width** | `cellBorderWidth` | Border thickness (0–10 px) | Cell border appears or thickens |
| **Border Colour** | `cellBorderColor` | Border colour | Border colour changes |
| **Border Style** | `cellBorderStyle` | Solid / Dashed / Dotted / Double | Border style changes |
| **Border Radius** | `cellBorderRadius` | Corner rounding (0–50 px) | Cell corners become rounded |
| **Apply Cell** | — | Applies styles to the selected cell only | Single cell is styled |
| **Apply Row** | — | Applies styles to the entire row | All cells in the row match |
| **Apply Column** | — | Applies styles to the entire column | All cells in the column match |

### 9.12 Paragraph Spacing Panel

| Control | ID | What It Does | User Expectation |
|---|---|---|---|
| **Line Height** slider | `paragraphLineHeight` | Adjusts line spacing (1.0–3.0, step 0.1) | Text line spacing changes in real time |
| **Margin Top / Bottom** | `paragraphMarginTop` / `paragraphMarginBottom` | Outer vertical spacing (px) | Space above/below the paragraph adjusts |
| **Padding** | `paragraphPadding` | Inner spacing (px) | Space inside the paragraph adjusts |
| **Space Before / After** | `spaceBefore` / `spaceAfter` | Additional spacing (px) | Fine-grained control over element spacing |

---

## 10 · Figma-Style Toolbar

A secondary toolbar that appears in the unified preview editing mode.

| Button | What It Does | User Expectation |
|---|---|---|
| **Undo** (`Ctrl+Z`) | Undoes the last action | Editor reverts |
| **Redo** (`Ctrl+Y`) | Redoes the last undone action | Editor re-applies |
| **Insert Image** | Opens file picker | Image is inserted |
| **Insert Table** | Opens Table Creator | Table is created |
| **Page Settings** | Opens Page Settings panel (§ 6) | Email width, padding, and colours can be adjusted |
| **Clear Highlight** | Removes all text highlights | Background highlights are removed |
| **Find & Replace** (`Ctrl+F`) | Opens the Find & Replace dialog | Same as toolbar Find & Replace |

---

## 11 · Colour Picker System

The colour picker appears in multiple contexts (text, highlight, block background, page background, etc.) and provides a unified experience.

### Features

| Feature | What It Does | User Expectation |
|---|---|---|
| **200+ colour palette** | Grid of predefined colours | User picks a colour visually |
| **Colour history** (12 recent) | Shows the last 12 colours used | Quick access to recently used colours |
| **Last-used per type** | Remembers the last colour for each target (text, highlight, block, page, email) | One click re-applies the same colour |
| **Custom hex input** | Enter any hex colour code | Precise colour control |
| **WCAG contrast checking** | Calculates contrast ratio and shows AA/AAA compliance | Warning if text colour has insufficient contrast against background |
| **Colour target menu** | Secondary menu to choose where colour applies (text, highlight, block, line) | User doesn't have to reopen the picker for a different target |

---

## 12 · Undo / Redo System

| Feature | Details |
|---|---|
| **History depth** | 50 states maximum |
| **Triggers** | Image drag, paste, delete, duplicate, move, content change |
| **State captured** | Editor HTML (cleaned of UI artifacts) + selection position + timestamp |
| **Selection restore** | 3-method fallback: direct range → path-based → text search |
| **Pruning** | Future states trimmed on new edit; oldest state trimmed when stack exceeds 50 |
| **History panel** | Toggleable panel showing all history entries with clickable restore |

---

## 13 · Autosave System

| Feature | Details |
|---|---|
| **Storage** | Browser `localStorage` |
| **Strategies** | Periodic (every 2 minutes) + Debounced (5 seconds after last edit) + On tab-hidden + Before page unload |
| **Data saved** | Content HTML, title, issue, all colours, layout dimensions, all image URLs, article overrides, TOC settings, preheader, dark-mode flag |
| **Restore** | On page load, if autosave data exists, a confirmation dialog shows elapsed time (e.g. "3 minutes ago") and offers to restore |
| **Quota handling** | If `localStorage` is full, falls back to saving minimal data (content + timestamp) |
| **Indicator** | Status text "Last saved: HH:MM" with green highlight (2 s) |

---

## 14 · Outlook Compatibility

### 14.1 Export Pipeline

| Step | Function | What It Does |
|---|---|---|
| 1 | `inlineAllStyles()` | Extracts `<style>` rules and inlines them as `style` attributes |
| 2 | `convertStylesForOutlook()` | Converts modern CSS to Outlook-safe: removes `transform`, `animation`, `flex`, `grid`, `filter`, `box-shadow`, `text-shadow`, `opacity`; normalises colors to hex; maps font stacks |
| 3 | `flattenLayoutToTables()` | Converts `display: flex` containers to `<table>` with `role="presentation"` |
| 4 | `generateOutlookHtmlWithMso()` | Wraps in full HTML document with MSO conditionals, Office Document Settings, list indent fixes |

### 14.2 Real-Time Validation

| Feature | What It Does | User Expectation |
|---|---|---|
| **Warning badges** | ⚠️ icons appear on blocks with Outlook-incompatible CSS | User sees at a glance which blocks need attention |
| **Per-block warnings** | Hover a badge to see specific issues | User knows exactly what to fix |
| **Validation report** | `validateOutlookBtn` generates a full report with score (0–100) | Detailed list of warnings, errors, and info with actionable advice |

### 14.3 Checked Properties

Unsupported CSS: `transform`, `animation`, `transition`, `box-shadow`, `text-shadow`, `filter`, `border-radius` (on images), `background-image` (on table cells), `display: flex/grid`, relative font sizes (`em`, `rem`).

Additional checks: missing `alt` text, missing image dimensions, external stylesheets, elements wider than 600 px, missing `role="presentation"` on layout tables.

---

## 15 · Keyboard Shortcuts

| Shortcut | Action | Context |
|---|---|---|
| `Ctrl+B` | Bold | Text editing |
| `Ctrl+I` | Italic | Text editing |
| `Ctrl+U` | Underline | Text editing |
| `Ctrl+Shift+S` | Strikethrough | Text editing |
| `Ctrl+Shift+X` | Clear formatting | Text editing |
| `Ctrl+K` | Insert/edit link | Text editing |
| `Ctrl+Shift+L` | Toggle list | Text editing |
| `Ctrl+D` | Duplicate block | Block selected |
| `Ctrl+Z` | Undo | Global |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo | Global |
| `Ctrl+F` | Find & Replace | Global |
| `Ctrl+S` | Save project | Global |
| `Ctrl+Shift+C` | Copy block | Block selected |
| `Ctrl+Shift+V` | Paste block | Block selected |
| `Ctrl+Shift+T` | Sync TOC from articles | Global |
| `Alt+↑` / `Alt+↓` | Move block up / down | Block selected |
| `Alt+]` / `Alt+[` | Jump to next / previous block | Preview mode |
| `Tab` | Next table cell / indent list | Table or list context |
| `Shift+Tab` | Previous cell / outdent list | Table or list context |
| `Arrow keys` | Navigate table cells | Table editing |
| `Del` | Delete selected image | Image selected |
| `Esc` | Close current dialog / deselect | Any dialog or selection |

---

## 16 · Notifications

Toast notifications appear in the top-right corner and auto-dismiss after 3 seconds.

| Type | Colour | Example |
|---|---|---|
| **Info** | Blue | "Autosave restored" |
| **Success** | Green | "✅ Alt text set on 5 image(s)" |
| **Warning** | Orange | "⚠️ 3 image(s) missing alt text" |
| **Error** | Red | "File exceeds 10 MB limit" |

---

## 17 · File Formats

### 17.1 Project File (`.mops`)

JSON format (v2.1) containing:

| Field | Description |
|---|---|
| `content` | Editor HTML |
| `title`, `issue` | Newsletter metadata |
| `pageBgColor`, `emailBgColor`, `bodyTextColor` | Colour settings |
| `emailWidth`, `emailPadding` | Layout dimensions |
| `heroImageUrl`, `arrowImageUrl`, `contactImageUrl`, etc. | Image URLs |
| `articleImageOverrides` | Per-article image URL map |
| `htmlTitle`, `preheader`, `darkModeSafe` | Email settings |
| `tocSettings` | TOC style/layout/alignment |
| `version`, `timestamp` | File metadata |

Backward-compatible with v1.0 and v2.0 files.

### 17.2 Export Formats

| Format | Extension | Contents | Best For |
|---|---|---|---|
| **Standard HTML** | `.html` | Responsive email with CSS | Web preview, modern email clients |
| **Outlook HTML** | `.html` | Inlined CSS, MSO conditionals, table layout | Microsoft Outlook |
| **Background HTML** | `.html` + `.png` | HTML + background image strip | Bitrix CMS |
| **ZIP** | `.zip` | HTML + extracted image files | Cloud upload to ESP |
| **Base64 HTML** | `.html` | Self-contained with embedded images | Quick preview, offline use |

---

## 18 · Editor Function Reference & Recreating Example Emails

This section documents every editor function available when recreating the
`examples/Example (1).html`, `Example (2).html`, and `Example (3).html`
newsletters, notes the ideal behaviour of each element, and lists the
improvement roadmap that emerged from the exercise.

### 18.1 Functions used to recreate Example 1 / 2 / 3

The three example files are Kaspersky *Sales Enablement News Digest*
newsletters (issues 23, 25 and 26). They share an identical HTML
skeleton — Outlook-safe `<table role="presentation">` layout, MSO
conditionals, 600 px fixed width, alternating white / mint article
blocks, numbered sections with tag pills, hero image, TOC, contact
footer, and arrow-link CTAs.

Below is every editor function exercised during the recreation, grouped
by UI area, together with the *ideal* behaviour for each.

#### Top Toolbar

| # | Function | Trigger | Ideal Behaviour |
|---|----------|---------|-----------------|
| 1 | **Undo** | `Ctrl+Z` / button | Reverts the last editor change; up to 50 history states. Button is disabled when history is empty. |
| 2 | **Redo** | `Ctrl+Y` / button | Re-applies an undone change. Button is disabled when nothing to redo. |
| 3 | **Insert Image** | Button / `Ctrl+Shift+I` | Opens file picker or URL dialog. Ideal: supports drag-drop, paste from clipboard, and URL input. Compresses on insert (`IMG_QUALITY 0.82`, max 1200 px). |
| 4 | **Insert Table** | Button | Opens table-size dialog (rows × cols). Ideal: quick-pick grid preview like Word. |
| 5 | **Clear Highlight** | Button | Removes all background highlight from selected text. |
| 6 | **Find & Replace** | `Ctrl+F` / button | Opens overlay with case-sensitive search, regex mode, replace-one and replace-all. Match count indicator shows current position. |

#### Inline Toolbar (appears on text selection)

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 7 | **Bold / Italic / Underline / Strikethrough** | Toggles inline formatting; persists after export. |
| 8 | **Text Colour** | Opens 200+ colour palette with hex input, 12-item recent history, and WCAG AA/AAA contrast check. |
| 9 | **Highlight Colour** | Same palette, applies `background-color` to text. |
| 10 | **Insert Link** (`Ctrl+K`) | Prompts for URL; applies `<a>` with teal colour (#00A88E). |
| 11 | **Heading Level** | Switch selection between Normal, H1, H2, H3. H2/H3 auto-adds to TOC. |
| 12 | **Bullet / Numbered List** | Converts paragraphs to `<ul>` or `<ol>`. |
| 13 | **Blockquote** | Wraps selection in `<blockquote>`. |
| 14 | **Clear Formatting** (`Ctrl+Shift+X`) | Strips all inline styles and returns to default body text. |

#### Bottom Save & Export Bar

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 15 | **Save** | Downloads a `.mops` JSON project file (v2.1) preserving all content, settings, and image metadata. |
| 16 | **Load** | Opens a `.mops` file and restores the full editor state. |
| 17 | **Export → HTML** | Downloads responsive email HTML with embedded CSS. |
| 18 | **Export → + BG** | Downloads HTML + background image strip (for Bitrix CMS). |
| 19 | **Export → Outlook** | Downloads Outlook-safe HTML with inlined CSS, MSO conditionals, and `<table>` layout. |
| 20 | **Copy HTML** | Copies final email HTML to the clipboard. |
| 21 | **Check (Outlook Validation)** | Runs a 100-point compatibility audit (e.g. flags `<style>` tags, unsupported CSS). |
| 22 | **Preview** | Toggles the live-preview panel on/off. |

#### Sidebar — Document

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 23 | **New Document** | Clears the editor after confirmation. |
| 24 | **Preview in Tab** | Opens the exported HTML in a new browser tab for full-page preview. |
| 25 | **Import HTML** | Imports an external `.html` file into the editor canvas. Ideal: auto-detects email structure and maps to editable blocks. |
| 26 | **Compare with Reference** | Overlays a reference HTML side-by-side for visual diff. |
| 27 | **Preheader Text** | Sets the hidden inbox-preview snippet (`<span style="display:none">…</span>`). |
| 28 | **Dark-mode Safe** | Toggles `color-scheme: light dark` meta and prefers-color-scheme media query in export. |

#### Sidebar — Responsive Breakpoints

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 29 | **Preset Breakpoints** | iPhone SE (320 px), iPhone 6/7/8 (375 px), iPhone Plus (414 px+). Each adds `@media` rules to the exported HTML. |
| 30 | **Add Breakpoint** | Custom min/max-width entry. Ideal: shows the breakpoint name in a summary list. |
| 31 | **Reset to Defaults** | Restores the three preset breakpoints. |

#### Sidebar — Starter Kits

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 32 | **Kaspersky Digest — 4 / 8 / 12 articles** | Inserts a full-page template with hero, TOC, N article blocks, contact section, and footer. Clears existing content after confirmation. |
| 33 | **Custom Count** | Generates a digest with a user-specified article count. |

#### Sidebar — Block Templates (23 drag-and-drop blocks)

| # | Block | Description |
|---|-------|-------------|
| 34 | Hero Header | Full-width banner image |
| 35 | Contents Block | Numbered table of contents |
| 36 | Article Block (White) | Numbered article on white background |
| 37 | Article Block (Mint) | Numbered article on mint (#f4fdfb) background |
| 38 | Article with Subheadings | Article with green section subheadings |
| 39 | Article with Bullet List | Article with formatted bullet list |
| 40 | Article with Image | Article with inline screenshot or illustration |
| 41 | Article with Learn More | Article with arrow link at the bottom |
| 42 | Article with Multiple Tags | Article with two or more category tags |
| 43 | Article — Text Only (White) | Simple article block, no image |
| 44 | Article — Text Only (Mint) | Simple article block on mint background |
| 45 | Article — Full-Width Image Below (White) | Article + full-width image, white background |
| 46 | Article — Full-Width Image Below (Mint) | Article + full-width image, mint background |
| 47 | Two Columns: Image + Text | Left image (265 px) and right text (251 px) |
| 48 | Two Columns: Text + Image | Left text (251 px) and right image (265 px) |
| 49 | Two Charts Side-by-Side | Two chart images in a row (230 px + 275 px) |
| 50 | Article — with Arrow Link | Arrow link row using hosted arrow image |
| 51 | CTA with Arrow | Floating call-to-action button with inline arrow icon |
| 52 | Contact / Feedback | Centred 128×128 icon, text, and CTA button |
| 53 | Contact / Feedback (Kaspersky) | Kaspersky-hosted contact icon and feedback button |
| 54 | Footer Banner | Full-width footer image/banner |
| 55 | Footer Banner (Kaspersky) | Full-width Kaspersky footer banner with real image |
| 56 | Tag Pill Block | Coloured pill-shaped badge (`border-radius: 24 px`) for category labels |

All blocks can be *clicked* to insert at the cursor, or *dragged* into the
editor canvas. Each block shows a visual thumbnail preview on hover.

#### Sidebar — Contents (TOC)

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 56 | **Show / Hide TOC** | Checkbox toggles the `#tocBlock` visibility. |
| 57 | **Sync TOC from Articles** (`Ctrl+Shift+T`) | Regenerates the TOC from every H2/H3 heading in the document. |

#### Sidebar — Global Image URLs

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 58 | **Arrow / Hero / Contact / Feedback / Footer URLs** | Set the remote image addresses used by block templates. Ideal: green tick indicator when URL resolves. |
| 59 | **Digest Number** | Auto-fills the hero URL pattern `…/digest/NN/hero.png`. |
| 60 | **Article Image Pattern** | URL template with `{digest}` and `{n}` placeholders. |
| 61 | **Auto-fill Article Images** | Applies the URL pattern to every article image placeholder. |
| 62 | **Bulk Upload Article Images** | Opens a multi-file picker to upload article images in order. |
| 63 | **Bulk Image URL Replace** | Find-and-replace across all image `src` attributes. |
| 64 | **Visual Image Grid** | Shows a thumbnail grid of every image in the document for quick review. |

#### Sidebar — Additional Panels

| # | Function | Ideal Behaviour |
|---|----------|-----------------|
| 65 | **Nested Table Spacing** | Cell padding, spacer-cell width, accent-line thickness (px). Applied to new templates and on sync. |
| 66 | **Image Library** | Stores recently used image URLs in the browser for quick re-insertion. |
| 67 | **Check / Fix Alt Text** | Scans all `<img>` tags for missing `alt` attributes and offers one-click fix. |
| 68 | **Text Presets** | One-click styles: Body Text (14 px, #1d1d1b), Sub-heading (bold 16 px, #00A88E), Article Title (bold 20 px), Footer Text (14 px, #999), Insert Article Header (01 | Title structure), Image Caption (bold 10 px). |
| 69 | **Block Operations** | White / Mint background, Auto-alternate Backgrounds, Renumber Articles, Duplicate / Copy / Paste Block, Apply Style to All Articles, Refresh Image URLs, Teal Sub-heading, Arrow-Link Toggles, Batch Title Editor. |
| 70 | **Tags** | 14 predefined tags (CRM, KORM, Web KORM, KORM Quotes, KORM Promo, KORM Subscriptions, Mautic, Mindbox, KL Academy, Partner Portal, ELMA, SiteEditor, Analytics, Marketing). Add / Remove tag, Quick-add, Batch Add / Remove, Tag Matrix. |

#### Keyboard Shortcuts (complete list)

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+S` | Strikethrough |
| `Ctrl+K` | Insert / edit link |
| `Ctrl+S` | Save project |
| `Ctrl+D` | Duplicate block |
| `Ctrl+F` | Find & Replace |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+Shift+X` | Clear formatting |
| `Ctrl+Shift+T` | Sync TOC from articles |
| `Ctrl+Shift+C` | Copy block |
| `Ctrl+Shift+V` | Paste block |
| `Alt+↑ / Alt+↓` | Move block up / down |
| `Alt+] / Alt+[` | Jump to next / previous block |
| `Tab` | Next table cell / indent list |
| `Shift+Tab` | Previous cell / outdent list |
| `Del` | Delete selected image |
| `Esc` | Close dialog / deselect |

### 18.2 UI element placement audit

The following notes describe the current placement of every major UI
region and whether it matches the ideal for the email-creation workflow.

| UI Region | Current Placement | Ideal? | Notes |
|-----------|-------------------|--------|-------|
| **Header bar** | Fixed at top, full width | ✅ Yes | Logo left, language switcher right — clean and unobtrusive. |
| **Top toolbar** (Undo/Redo/Image/Table/Find) | Below header, left-aligned | ✅ Yes | Icons are clear; tooltips present. |
| **Editor canvas** | Centre, full height, scrollable | ✅ Yes | Contenteditable `div` with block drag handles on hover. |
| **Right sidebar** | Right column, scrollable | ✅ Yes | Grouped into collapsible sections; logical top-to-bottom flow. |
| **Save & Export bar** | Fixed at bottom, full width | ✅ Yes | Always visible; groups Save/Load on the left, exports on the right. |
| **Inline toolbar** | Floats above text selection | ✅ Yes | Appears on demand, doesn't obscure content. |
| **Block drag handles** | Left edge of each block on hover | ✅ Yes | ⠿ icon with tooltip. |
| **TOC block** | Inside editor, top of content | ✅ Yes | Auto-generates from headings. |
| **Word-like toolbar** (font size, line-height, TOC style) | Inside `.word-like-toolbar` — **hidden** in unified mode | ✅ Mitigated | The toolbar div is still hidden in unified mode, but font-size and line-height controls are now accessible via the **Text Presets** sidebar section (Body / Heading / Label with editable inputs). Font-family is available in the **Property Panel** (`propFontFamily`). TOC style, layout, and alignment are duplicated in the **Property Panel** (`propTocStyle` / `propTocLayout` / `propTocAlign`), so all controls remain accessible. |
| **Colour picker** | Overlay on colour button click | ✅ Yes | 200+ colours, hex input, recent history, WCAG contrast. |
| **Compare overlay** | Full-screen overlay on "Compare" | ✅ Yes | Reference iframe with opacity slider. |
| **Find & Replace panel** | Expandable panel below toolbar | ✅ Yes | Minimal footprint, escape to close. |
| **Notification toasts** | Top-right corner, auto-dismiss | ✅ Yes | 3-second timeout, colour-coded by severity. |

### 18.3 Creating an Email Like the Examples — Process Record

The walkthrough below documents the end-to-end process of recreating
`examples/Example (1).html` (Sales Enablement News Digest, Issue 25)
using only the editor. Everything that worked, did not work, was not
ideal, and ideas for improvements is recorded as-is.

#### Step 1 — Open the editor and choose a Starter Kit

Open `index.html`. The canvas loads with a welcome guide. In the right
sidebar open **Starter Kits** and select *Kaspersky Digest — 8 articles*
(the example has 7 articles, but rounding up is easier than adding one
later). Click **Generate**; the editor scaffolds a hero image, a TOC
block, eight alternating white/mint article blocks, a contact section,
and a footer banner. This step **works well** — the structure appears
instantly and the block order matches the examples.

**Not ideal:**
- There is no "7 articles" option; you must pick 8 and delete one. The
  custom-count field is available but easy to miss at first glance.
- After generation the TOC is empty. You have to click **Sync TOC**
  separately (it auto-clicks after a 200 ms delay, but the result can
  be confusing if the delay races with a slow render).

#### Step 2 — Fill in Document settings

Set *Title* to "Sales Enablement News Digest", *Issue* to "25", and
*HTML Title* to the same. Paste the global image URLs into the sidebar
fields (hero, arrow, contact, feedback button, footer banner). The
health-check icons (✅ / ❌) appear beside each URL after a short delay.

**Works well:** The URL health-check is very helpful — you know
immediately if a link is broken.

**Not ideal:**
- The five image-URL fields are scattered in the sidebar. A single
  grouped "Image URLs" card would be faster to scan.
- There is no field for the overall outer-page background colour
  (`#EDEFF0`) in the visible sidebar — it is buried in **Page Settings**
  (gear icon). First-time users may not find it.
- The article-image-pattern field (`https://…/{n}.png`) is powerful but
  its `{n}` placeholder syntax is undocumented in the UI — a tooltip or
  inline hint would help.

#### Step 3 — Edit article titles, text, and tags

Click each article block in the preview. The Property Panel opens on the
right. Type the article title (e.g. "Web KORM"), body text, and add tag
pills ("Web KORM", "CRM", "ELMA" etc.) via the Tag Pill block template.

**Works well:**
- Clicking a block to select it, then editing inline in the preview
  panel feels intuitive (Figma-like).
- Copy/paste style (`copyElementStyle` / `pasteElementStyle` via
  right-click) saves time when formatting is identical across articles.
- Auto-renumbering keeps the 01 / 02 / 03 prefixes correct after
  reorder.

**Not working / not ideal:**
- **Paste strips too aggressively.** Ctrl+V from Google Docs or Word
  removes intended bold/italic spans because `cleanWordHtml()` (in
  `app/js/editor.js`) strips most inline styles. Ctrl+Shift+V (plain
  text) works, but then you lose all formatting and have to re-apply
  it manually.
- **Tag pills require a dedicated template insertion.** There is no
  inline "add tag" button on the article block itself — you must drag
  a "Tag Pill Block" template from the library and merge it manually.
  An inline "+ Add Tag" button on article blocks would be faster.
- **No spell-check integration.** The contenteditable area relies on
  browser spellcheck, which varies. A built-in or pluggable spell-check
  would be valuable.

#### Step 4 — Insert and position images

For each article, either drag-drop a local image onto the block or paste
an image URL. Use the four layout chips (inline / block / float-left /
float-right) that appear on hover to position the image.

**Works well:**
- Drag-drop and paste both work out of the box.
- Base64 embedding means the preview renders immediately without an
  external server.
- The layout chips are a nice touch for quick alignment.

**Not ideal:**
- **No progress indicator during image compression.** Large images
  (> 2 MB) cause a noticeable pause with no visual feedback.
- **Image resize handles** are only visible when the image is selected in
  the editor canvas, not in the preview. Moving between the two panels
  to resize is awkward.
- **No image crop.** You can resize but not crop — users must
  pre-crop externally.

#### Step 5 — Build data tables

Example 1 includes a "Top Jira Requests" table with columns
(System / Requests / Key improvement). Insert a table from the toolbar,
set the column count, then style the header row background and borders
from the Cell Styling Panel.

**Not ideal:**
- Table creation is modal-based (a dialog pops up). WYSIWYG inline table
  insertion (click-drag a grid like in Word) would be faster.
- After inserting, fine-tuning column widths requires drag-resizing in
  the editor. The live width tooltip helps, but snapping to common
  widths (e.g. 50 % / 33 %) is missing.
- Alternating row backgrounds (e.g. `#fafafa`) must be set cell-by-cell
  — a "stripe rows" toggle would be a big time-saver.

#### Step 6 — Reorder and delete blocks

Drag blocks up/down in the preview to match the example order. Drop a
block on the 🗑️ zone to delete it (we delete the extra 8th article).

**Works well:**
- Drag-and-drop reordering is smooth, with a red insertion line showing
  the target position.
- The delete zone at the bottom with the trash icon is intuitive.

**Not ideal:**
- **No keyboard reorder.** There is no Alt+↑ / Alt+↓ shortcut to move
  blocks without a mouse.
- **Undo after delete is not obvious.** The block disappears instantly
  with a toast, but the toast does not include an "Undo" action link.
  You have to know to press Ctrl+Z.

#### Step 7 — Preview and compare

Click the preview panel to see the live email. Toggle between Desktop
(600 px), Tablet (375 px), and Mobile (320 px) views. Use the "Compare"
button to overlay the original example HTML and slide the opacity.

**Works well:**
- Real-time preview is accurate and fast (adaptive debounce handles
  large documents).
- The responsive toggle is genuinely useful for checking mobile layout.
- Email-client simulation (Gmail / Apple Mail / Outlook) gives
  confidence before sending.
- Source view (⟨/⟩) is great for debugging HTML issues.

**Not ideal:**
- **Compare requires a file upload.** There is no quick way to compare
  against one of the bundled examples in `examples/` — you have to
  browse for the file each time.
- **No diff highlighting.** The compare overlay is a transparency slider
  only. A side-by-side or visual-diff view showing actual differences
  would be more useful.

#### Step 8 — Export

Click **Download HTML (ZIP)** in the bottom bar. The exported ZIP
contains an HTML file with Outlook-safe MSO conditionals and separate
image files.

**Works well:**
- The Outlook-optimised output is production-ready (`<!--[if mso]>`)
  with inlined CSS.
- Font shorthand expansion ensures email clients parse fonts correctly.
- Alt-text validation warns about missing `alt` attributes before export.

**Not ideal:**
- **Alt-text validation warns but does not block.** Users can
  accidentally export accessibility-incomplete emails.
- **No export preview.** There is no "preview exactly what will be in
  the ZIP" step — you export, then open the HTML to verify.
- **Image file names are generic** (image1.png, image2.png). Using
  descriptive names based on article titles would make the ZIP easier
  to manage.

#### Summary of what works and what does not

| Area | What works ✅ | What is not ideal ⚠️ |
|------|--------------|----------------------|
| Starter Kits | Instant scaffold, correct block order | No exact article-count option, TOC sync delay |
| Document settings | URL health-check, auto-save | Image-URL fields scattered, page bg hidden |
| Text editing | Inline preview editing, style copy/paste | Paste strips too much, no inline tag-add |
| Images | Drag-drop, base64 embed, layout chips | No compression progress, no crop |
| Tables | Live column-width tooltip | Modal creation, no row-stripe toggle |
| Drag & drop | Smooth reorder, trash zone | No keyboard shortcut, no undo link in toast |
| Preview | Real-time, responsive toggle, source view | Compare needs file upload, no diff highlighting |
| Export | Outlook-safe, font expansion, alt-text check | Warn-only validation, no export preview, generic filenames |

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome / Edge | ✅ Full |
| Firefox | ✅ Full |
| Safari | ✅ Full |
| Outlook (email output) | ✅ Optimised with MSO conditionals |

---

## Release Readiness (2026-03-16)

Current status after repository audit and smoke checks:

- ✅ No build pipeline required (open `index.html` directly).
- ✅ JavaScript syntax check passes for all application scripts:
  `for f in app/js/*.js; do node --check "$f"; done`
- ✅ Install/uninstall/version flags are present on platform installers in `Installation/`.
- ✅ Local smoke run in browser starts without console errors.
- ✅ UI now supports English and Russian (`app/js/i18n.js` + `app/locales/*.json`).
- ✅ Full i18n coverage: all sidebar labels, dialog headings, toolbar tooltips, modal buttons, and notification messages use `data-i18n` attributes and `t()` calls (920+ translation keys in `en.json` / `ru.json`).
- ✅ All `showNotification()`, `confirm()`, and `prompt()` strings in `editor.js` and `preview-editing.js` are wrapped in `t()` — no hardcoded English remaining.
- ✅ Null-safety audit complete: `export.js`, `ui.js`, and `images.js` use optional chaining and `if` guards for all global DOM references (`titleInput`, `issueInput`, `editor`, context-menu elements).

### Known non-blocking follow-ups

- `docs/PRESENTATION.md` is an internal draft and may lag behind product naming/features.

---

## Roadmap — To Do

Items below were identified during the email-creation walkthrough above.
They are listed roughly by impact (highest first).

| # | Item | Area | Notes |
|---|------|------|-------|
| 1 | **Inline "+ Add Tag" button on article blocks** | Text editing | Avoid dragging a separate Tag Pill template and merging it manually. |
| 2 | **Smarter paste (preserve intentional formatting)** | Text editing | `cleanWordHtml()` in `app/js/editor.js` strips too aggressively — keep bold, italic, links from rich-text sources. |
| 3 | **Image compression progress indicator** | Images | Show a spinner or progress bar while large images are being compressed. |
| 4 | **Inline image crop tool** | Images | Let users crop images inside the editor instead of requiring an external tool. |
| 5 | **Table row-stripe toggle** | Tables | One-click alternating row backgrounds (e.g. white / `#fafafa`). |
| 6 | **Inline table creation (click-drag grid)** | Tables | Replace the modal dialog with a Word-style grid picker. |
| 7 | **Keyboard block reorder (Alt+↑ / Alt+↓)** | Drag & drop | Allow block reordering without a mouse. |
| 8 | **Undo link inside delete toast** | Drag & drop | After block deletion the toast should offer a one-click Undo. |
| 9 | **Group image-URL fields into a single card** | Settings | All five URL fields in one collapsible section for faster scanning. |
| 10 | **Surface page background colour in the sidebar** | Settings | Move it out of the Page Settings modal so it is discoverable. |
| 11 | **Tooltip / hint for the `{n}` article-image-pattern** | Settings | First-time users do not know the placeholder syntax. |
| 12 | **Quick-compare against bundled examples** | Preview | Drop-down to load an example from `examples/` without browsing for a file. |
| 13 | **Visual diff in compare mode** | Preview | Side-by-side or overlay diff highlighting instead of just a transparency slider. |
| 14 | **Export preview step** | Export | Show a read-only preview of the final HTML before downloading the ZIP. |
| 15 | **Descriptive image file names in ZIP export** | Export | Name files after article titles instead of generic `image1.png`. |
| 16 | **Alt-text validation as a blocking gate** | Export | Optionally block export until all images have `alt` text. |
| 17 | **Column-width snap guides (50 % / 33 %)** | Tables | Snap-to-grid behaviour when resizing table columns. |
| 18 | **TOC auto-sync without delay race** | Starter Kits | Ensure the TOC updates reliably after scaffold generation. |
| 19 | **Built-in or pluggable spell-check** | Text editing | Reduce reliance on inconsistent browser spellcheck. |
| 20 | **`docs/PRESENTATION.md` refresh** | Docs | Update to match current product features. |

---

## License

Internal tool — developed in the Marketing Automation department.
