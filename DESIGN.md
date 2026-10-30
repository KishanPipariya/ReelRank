---
name: ReelRank
description: A personal film catalogue ranked by appearances across the Letterboxd lists you like.
colors:
  warm-paper: "#f3f0e9"
  ink: "#22251f"
  soft-graphite: "#5f655c"
  hairline: "#dedbd2"
  porcelain: "#f8f6f1"
  stone-paper: "#ebe8df"
  control-ink: "#575d54"
  control-border: "#73786e"
  deep-evergreen: "#243d31"
  soft-lichen: "#b5d67a"
  signal-wash: "#e8ece3"
  signal-rule: "#d2d9cc"
  muted-terracotta: "#e88760"
  terracotta-ink: "#984a33"
  muted-copy: "#62685e"
  focus-terracotta: "#bd6446"
  filter-cream: "#f5f3eb"
  hero-cream: "#f6f3e9"
  hero-secondary: "#c6d7b0"
  hero-copy: "#d2d7cc"
  hero-muted: "#bbc5b7"
  terracotta-on-dark: "#f0a07b"
  night-paper: "#151915"
  night-ink: "#ecece2"
  night-muted: "#a4aa9c"
  night-evergreen: "#263d32"
  night-filter-ink: "#182219"
  night-rule-strong: "#424a40"
  night-highlight: "#c3d89c"
  night-highlight-rule: "#a3bd85"
  night-copper: "#d18b6d"
  night-link: "#d6e6c2"
  night-link-rule: "#8e9c80"
  night-soft-highlight: "#c4d8a2"
  night-highlight-bright: "#d2e69f"
  night-lime: "#c7e58f"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "clamp(48px, 4.5vw, 64px)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(34px, 5vw, 47px)"
    fontWeight: 500
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.32
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  control:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "2px"
  md: "3px"
  pill: "999px"
  circle: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-5: "24px"
  space-6: "32px"
  section: "38px"
  section-end: "40px"
components:
  button-filter-active:
    backgroundColor: "{colors.deep-evergreen}"
    textColor: "{colors.filter-cream}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 8px"
  input-search:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 10px"
  navigation:
    textColor: "{colors.ink}"
    height: "68px"
  chip-genre:
    backgroundColor: "{colors.stone-paper}"
    textColor: "{colors.control-ink}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "3px 8px"
  poster-info:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 10px 10px"
  setup-card:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "clamp(26px, 6vw, 54px)"
  hero-panel:
    backgroundColor: "{colors.deep-evergreen}"
    textColor: "{colors.hero-cream}"
    rounded: "0"
    padding: "20px 7%"
---

# Design System: ReelRank

## Overview

**Creative North Star: The Personal Film Almanac**

ReelRank treats a personal catalogue as an archive worth browsing. Warm paper, evergreen framing, and film artwork give the interface its character; list appearances and provenance keep that character tied to the product’s actual signal.

The visual system pairs a direct sans-serif hero with literary serif section heads and film titles. Compact mono labels carry ranks, counts, filters, and edition details. Posters lead the browsing view; a ledger offers a denser way to compare the same catalogue.

**Key Characteristics:**
- Warm paper surfaces framed by deep evergreen.
- Film posters and list-appearance counts lead the browsing experience.
- A sans-serif hero sits above serif catalogue headings and titles.
- Mostly flat catalogue surfaces; depth belongs to open menus and dialogs.

## Colors

The palette moves between warm paper and evergreen, using lichen for selected states and terracotta for focused emphasis. The dark scheme keeps the same roles on deeper surfaces with brighter text and links.

### Primary
- **Deep Evergreen**: Hero field, active filter, and key interaction surface.

### Secondary
- **Soft Lichen**: Status and selected-state emphasis, especially against evergreen.
- **Signal Wash**: Groups catalogue totals and watched progress without competing with the posters.

### Tertiary
- **Muted Terracotta**: A small signal for focus, links, and selected details.
- **Terracotta Ink**: The readable rust counterpart on paper surfaces.

### Neutral
- **Warm Paper**: Main light canvas.
- **Porcelain**: Search fields, setup content, and raised panels.
- **Stone Paper**: Secondary surfaces, filter chips, and ledger regions.
- **Ink and Soft Graphite**: Primary and supporting text.
- **Hairline and Control Border**: Quiet separators and stronger interactive edges.
- **Night Paper, Night Ink, and Night Muted**: Dark canvas and text hierarchy.

**The Accent Restraint Rule.** Evergreen and paper carry the interface; lichen and terracotta remain accents.

## Typography

**Display Font:** DM Sans (sans-serif)
**Headline and Film Title Font:** Playfair Display (Georgia, serif)
**Label Font:** DM Mono (monospace)

**Character:** The sans-serif hero is clear and immediate. Playfair Display gives catalogue headings and film titles an editorial cadence; DM Mono makes counts and provenance quick to scan.

### Hierarchy
- **Display** (500, 48–64px, .98 line-height): The hero headline uses DM Sans.
- **Headline** (500, 34–47px): Collection and section headings use Playfair Display.
- **Title** (500, 15px, 1.32 line-height): Poster-card titles use Playfair Display and clamp to two lines.
- **Body** (400, 14px): Supporting copy uses DM Sans; line-height varies by component for compact controls and longer reading.
- **Control** (400, 16px): Search and editable controls use DM Sans.
- **Label** (400, 12px): DM Mono carries compact counts, provenance, and filter labels.

**The Three-Face Rule.** Keep DM Sans for interface reading and the hero, Playfair Display for editorial headings and film titles, and DM Mono for catalogue data.

## Layout

The centered page shell is capped at 1320px with 36px desktop gutters. The masthead is 68px high; the evergreen hero is at least 176px high and pairs its copy with a circular 176px almanac stamp on desktop. The stamp hides below 700px. Short desktop viewports reduce masthead and hero spacing.

The poster wall uses four columns on wide screens, three at 920px and below, and two at 430px and below. Posters keep a 2:3 ratio. The table view presents the same ranking as a ledger. The feature-first page order leads from the hero to the most-listed films, then to the searchable catalogue. On mobile, the shell narrows to 560px with 16px outer gutters; search and filter controls stack into a single-column flow.

Spacing follows the 4px scale, with a 38px section step and 40px section-end spacing. Most controls have a 44px minimum height; compact in-card filter actions use smaller but explicit hit areas.

## Elevation & Depth

The resting catalogue uses borders and tonal surfaces rather than floating cards. Shadows distinguish transient utility menus, the setup card, and modal layers from the page beneath them.

### Shadow Vocabulary
- **Setup card** (`0 18px 55px #24251d10`): A soft lift against the paper canvas.
- **Utility panel** (`0 12px 32px #1519152e`): Separates open filters and catalogue tools from results.
- **Film dialog and poster viewer** (`0 24px 90px` with dark translucent ink): Raises focused film content above a dimmed catalogue.

**The Flat-by-Default Rule.** Keep catalogue surfaces flat at rest; reserve strong shadows for overlays and dialogs.

## Shapes

Controls and panels use nearly square 2px corners; segmented controls use 3px. Genre tags and progress tracks are pill-shaped, while the wordmark mark and hero stamp are circular. Posters preserve a portrait 2:3 ratio. Borders stay thin and quiet except where a control needs a stronger edge.

## Components

### Buttons
- **Selected filter:** Deep evergreen with filter cream text; 44px minimum height.
- **Secondary controls:** Paper or transparent fills with a visible border or underline.
- **Hover / Focus:** Small surface changes on hover; keyboard focus uses a three-pixel outline with offset.

### Chips
- Genre chips use stone paper and control ink, pill corners, and a 32px minimum height. Selected chips switch to the active evergreen treatment.

### Cards / Containers
- Poster cards put the image first, then a square-cornered paper metadata panel with a thin rule.
- The featured film uses a dark evergreen field to distinguish the current ranking lead.
- Setup content uses a porcelain surface; the catalogue itself remains unraised.

### Inputs / Fields
- Search uses a porcelain field, a one-pixel control edge, and a 44px outer hit area.
- Focus is visible as an offset outline; disabled controls reduce opacity and use a not-allowed cursor.

### Navigation
- The wordmark and profile link occupy opposite ends of the 68px masthead. The row compresses on mobile and short desktop screens.

### Signature Components
- **Hero:** Evergreen frame, sans-serif headline, short explanation, methodology link, edition details, and a circular almanac stamp on desktop.
- **Poster wall and ledger:** Two views of one ranking, optimized for visual browsing and metadata comparison.
- **Film detail dialog:** A scrollable detail panel with poster, adjacent-film navigation, and source notes.

## Do's and Don'ts

### Do:
- Keep poster artwork central to poster-wall browsing.
- Preserve light and dark palettes through the system color-scheme preference.
- Use serif type for catalogue headings and film titles; use mono for compact catalogue data.
- Reserve shadows for open menus, setup content, and dialogs.

### Don't:
- Turn the poster wall or ledger into generic rounded dashboard cards.
- Spread terracotta across broad surfaces; keep it as a signal color.
- Remove the visible focus treatment from interactive controls.
- Shift the hero to Playfair Display without revising the type hierarchy; it currently uses DM Sans.
