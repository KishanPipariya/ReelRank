---
name: ReelRank
description: A personal film catalogue ranked by appearances across the Letterboxd lists you like.
colors:
  warm-paper: "#f3f0e9"
  ink: "#22251f"
  muted: "#5f655c"
  hairline: "#dedbd2"
  porcelain: "#f8f6f1"
  stone-paper: "#ebe8df"
  control-ink: "#575d54"
  deep-evergreen: "#243d31"
  soft-lichen: "#b5d67a"
  muted-terracotta: "#e88760"
  terracotta-ink: "#984a33"
  filter-cream: "#f5f3eb"
  hero-cream: "#f6f3e9"
  night-paper: "#151915"
  night-ink: "#ecece2"
  night-muted: "#a4aa9c"
  night-hairline: "#353c34"
  night-surface: "#1e241f"
  night-soft-surface: "#222922"
  night-control: "#c0c5b9"
  night-evergreen: "#263d32"
  night-filter-ink: "#182219"
  night-terracotta: "#f0a07b"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(34px, 7vw, 78px)"
    fontWeight: 500
    lineHeight: 0.99
    letterSpacing: "-0.065em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(34px, 5vw, 47px)"
    fontWeight: 500
    letterSpacing: "-0.055em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.1em"
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
    height: "30px"
    padding: "0 12px"
  input-search:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 10px"
  navigation:
    textColor: "{colors.ink}"
    height: "80px"
  chip-genre:
    backgroundColor: "{colors.stone-paper}"
    textColor: "{colors.control-ink}"
    rounded: "{rounded.pill}"
    padding: "3px 7px"
  setup-card:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "clamp(26px, 6vw, 54px)"
  hero-panel:
    backgroundColor: "{colors.deep-evergreen}"
    textColor: "{colors.hero-cream}"
    rounded: "0"
    padding: "50px 8.2%"
---

# Design System: ReelRank

## Overview

**Creative North Star: "The Personal Film Almanac"**

ReelRank feels like a cinephile’s home: warm, comfortable, and organized around a personal catalogue. Its visual language pairs a lived-in paper palette with evergreen framing, serif film titles, and small mono labels that make rankings and provenance easy to scan.

The interface balances a poster wall’s immediacy with a ledger’s precision. Film artwork leads the browsing view; the ledger makes a large catalogue easier to compare. The same editorial rhythm carries into compact controls, expandable details, and a dedicated dark palette.

**Key Characteristics:**
- Warm paper surfaces and deep evergreen framing
- Playfair Display headlines alongside DM Sans reading text and DM Mono metadata
- Poster-led browsing balanced by a compact, sortable ledger
- Mostly flat surfaces with depth reserved for overlays

## Colors

The light palette uses warm paper and forest green as its base, with lichen and terracotta accents; dark mode keeps the same character with deeper surfaces and brighter text.

### Primary
- **Deep Evergreen**: The main hero, active filter, and key interaction color.
- **Night Evergreen**: The dark-mode hero and framing green; active filters shift to lichen for contrast.

### Secondary
- **Soft Lichen**: A restrained highlight for counts and emphasized display words; it becomes the active-filter fill in dark mode.

### Tertiary
- **Muted Terracotta**: A warm accent for emphasis, score indicators, and selected details.
- **Burnished Rust**: The stronger text and score accent on paper, shifting to light terracotta in dark mode.

### Neutral
- **Warm Paper**: The light page canvas.
- **Porcelain**: Raised light surfaces, including fields and the setup card.
- **Stone Paper**: Secondary surfaces and ledger headings.
- **Ink**: Primary light-theme text.
- **Soft Graphite**: Supporting text; retain its muted hierarchy.
- **Parchment Rule**: Quiet borders and dividers.
- **Night Paper, Night Surface, Night Soft Surface**: Dark canvas and layered surfaces.
- **Night Text, Night Muted Text, Night Control Text, Night Rule**: Dark-theme type and dividers.

**The Accent Restraint Rule.** Keep terracotta and lichen as accents around evergreen structure; don’t let them replace the quiet paper and forest base.

## Typography

**Display Font:** Playfair Display (with Georgia, serif fallback)
**Body Font:** DM Sans (with sans-serif fallback)
**Label/Mono Font:** DM Mono (with monospace fallback)

**Character:** The serif gives film titles and section heads a literary cadence. The sans keeps descriptions comfortable to read; the mono face makes counts, filters, and provenance feel catalogued.

### Hierarchy
- **Display** (500, clamp 34–78px, .99 line-height, negative tracking): The hero headline; mobile scales down first.
- **Headline** (500, 34–47px on wide screens and 28–38px on mobile): Catalogue section and top-billed titles.
- **Title** (500, 20–28px, tight line-height): Compact film and dialog headings, with serif emphasis.
- **Body** (400, 14px, 1.7 line-height): Descriptions and explanatory copy; tighter 12px supporting text on small screens.
- **Label** (400, 11–12px for essential controls and supporting text; smaller metadata remains compact): Mono counts, filters, metadata, and uppercase labels.

**The Three-Face Rule.** Use Playfair Display for expressive hierarchy, DM Sans for reading, and DM Mono for compact catalogue data; don’t add a fourth type family.

## Layout

The desktop page sits in a centered shell capped at 1320px with 36px side gutters. The masthead is a restrained 80px row; the hero is at least 336px tall and sits above a flexible summary band. Sections use a 4px-based spacing scale, with 38px before the catalogue and 40px after it; the mobile section rhythm is 36px and 35px.

The main catalogue has two deliberately different reading modes: a four-column poster grid on wide screens and a dense ledger table for comparison. At narrower widths the poster grid moves to three columns below 920px and two columns on mobile; the main shell narrows to 560px with 18px side gutters below 700px. Search and filter controls move from a four-column row to two columns, with the search and watched tabs taking full rows on mobile. Filter facets and catalogue utilities use separate disclosures. Decade browsing leads with three options and offers search/show-all controls when more are available. The film-details dialog changes to a single-column poster and detail layout below 600px.

## Elevation & Depth

The page is mostly flat: hairline borders and nearby tonal surfaces separate catalogue regions, while the film imagery supplies most of the visual weight. Shadows are reserved for raised setup content, transient menus, and the film-details dialog; the dialog also uses a dimmed, lightly blurred backdrop. Focus is shown with a clear three-pixel outline.

### Shadow Vocabulary
- **Setup card** (0 18px 55px #24251d10): A very soft lift against the paper background.
- **Utility panels** (0 12px 32px #1519152e): A concise shadow that separates opened menus from the catalogue.
- **Film details dialog** (0 24px 90px #10140f66): A strong layer above the dimmed page.

**The Flat-by-Default Rule.** Keep resting catalogue surfaces flat; reserve stronger depth for controls that open above surrounding content.

## Shapes

Most interface controls have nearly square corners (2px); segmented controls rise to 3px. Small round marks identify the wordmark, while tags and progress tracks use pill shapes. Film posters hold a consistent 2:3 ratio. Border lines are thin and quiet rather than outlining every element.

## Components

### Buttons
Controls feel precise and editorial, with clear selected states.
- **Shape:** Mostly square corners (2px); filter segments have 3px outer corners.
- **Primary:** The selected filter uses deep evergreen with light text in the light theme, and lichen with dark text in dark mode (30px minimum height, 12px horizontal padding).
- **Hover / Focus:** Hover shifts surface and border colors; keyboard focus uses a three-pixel outline with offset.
- **Secondary:** Outline-and-paper controls use a thin rule and muted type; text actions remain underlined.

### Chips
- **Style:** Genre tags sit on stone paper with control text and pill corners (999px).
- **State:** Hover and selected tags switch to evergreen with light text; dark mode retains the lichen-led contrast treatment.

### Cards / Containers
- **Corner Style:** 2px or square where structural.
- **Background:** Setup and overlay panels use porcelain; catalogue background stays on paper.
- **Shadow Strategy:** Flat at rest; lift only setup, menus, and modal layers.
- **Border:** One-pixel hairline for controls and panel edges.
- **Internal Padding:** 12–16px for compact panels; setup card uses responsive padding.

### Inputs / Fields
- **Style:** Search sits on porcelain with a one-pixel hairline, nearly square corners, and a 38px height.
- **Focus:** A three-pixel outline with offset; the dark palette changes its focus color for contrast.

### Navigation
- **Style:** The wordmark and profile link sit at opposite ends of the masthead; a fine divider closes the 80px row. On mobile it compresses to 66px.

### Signature Components
- **Hero:** Evergreen field with a fine inset keyline, terracotta/lichen light, lichen emphasis, and a circular, slightly rotated stamp on desktop; the stamp hides on mobile. Place the tagline beneath the heading and provide a direct “Browse the catalogue” action.
- **Poster wall and ledger:** Two views of one ranked catalogue. Posters keep a consistent portrait ratio; ledger rows expose film metadata and appearance counts.
- **Film detail dialog:** A wide, scrollable panel with poster accent, adjacent-film navigation, and a dimmed backdrop.

## Do's and Don'ts

### Do:
- **Do** keep poster artwork as the leading image in poster-wall mode.
- **Do** preserve the light and dark themes through the system color-scheme preference.
- **Do** use mono type for compact metadata and serif type for film titles and editorial headings.
- **Do** keep the catalogue flat at rest and use shadows for raised menus and dialogs.

### Don't:
- **Don't** turn catalogue rows into generic rounded cards; the poster wall and ledger have distinct, intentional structures.
- **Don't** spread terracotta across broad surfaces; it is an accent to the paper-and-evergreen palette.
- **Don't** remove the visible focus treatment from interactive controls.
