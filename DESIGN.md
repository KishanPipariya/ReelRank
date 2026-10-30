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
  surface-hover: "#e9e8dd"
  control-ink: "#575d54"
  control-border: "#73786e"
  link-rule: "#838a79"
  deep-evergreen: "#243d31"
  soft-lichen: "#b5d67a"
  signal-wash: "#e8ece3"
  signal-rule: "#d2d9cc"
  signal-value: "#243d31"
  muted-terracotta: "#e88760"
  terracotta-ink: "#984a33"
  filter-cream: "#f5f3eb"
  hero-cream: "#f6f3e9"
  hero-secondary: "#c6d7b0"
  hero-copy: "#d2d7cc"
  hero-muted: "#bbc5b7"
  night-paper: "#151915"
  night-ink: "#ecece2"
  night-muted: "#a4aa9c"
  night-hairline: "#353c34"
  night-surface: "#1e241f"
  night-soft-surface: "#222922"
  night-control: "#c0c5b9"
  night-control-border: "#7a8374"
  night-evergreen: "#263d32"
  night-signal-wash: "#1d251f"
  night-signal-rule: "#344137"
  night-signal-value: "#c3d89c"
  night-filter-ink: "#182219"
  night-terracotta: "#f0a07b"
  muted-copy: "#62685e"
  focus-terracotta: "#bd6446"
  terracotta-on-dark: "#f0a07b"
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
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "clamp(54px, 5vw, 64px)"
    fontWeight: 500
    lineHeight: 0.98
    letterSpacing: "-0.04em"
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
  caption:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  micro:
    fontFamily: "DM Mono, monospace"
    fontSize: "8px"
    fontWeight: 400
  small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  card-title:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "15px"
    fontWeight: 500
  control:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  utility:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  section-small:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "18px"
    fontWeight: 500
  section:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "19px"
    fontWeight: 500
  heading:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "20px"
    fontWeight: 500
  rank:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "21px"
    fontWeight: 500
  emphasis:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "22px"
    fontWeight: 500
  count:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "23px"
    fontWeight: 600
  display-small:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "24px"
    fontWeight: 500
  metric:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "25px"
    fontWeight: 500
  detail-score:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "26px"
    fontWeight: 500
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "12px"
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
    height: "44px"
    padding: "0 12px"
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
    padding: "3px 7px"
  setup-card:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.ink}"
    padding: "clamp(26px, 6vw, 54px)"
  hero-panel:
    backgroundColor: "{colors.deep-evergreen}"
    textColor: "{colors.hero-cream}"
    rounded: "0"
    padding: "20px 7%"
---

# Design System: ReelRank

## Overview

**Creative North Star: "The Personal Film Almanac"**

ReelRank feels like a cinephile’s home: warm, comfortable, and organized around a personal catalogue. Its visual language pairs a lived-in paper palette with evergreen framing, serif film titles, and small mono labels that make rankings and provenance easy to scan.

The interface balances a poster wall’s immediacy with a ledger’s precision. Film artwork leads the browsing view; the ledger makes a large catalogue easier to compare. A softly tinted signal band groups ranking counts and watched progress, keeping provenance and status visible without competing with the hero. The same editorial rhythm carries into compact controls, expandable details, and a dedicated dark palette.

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
- **Signal Wash**: A quiet moss tint that groups catalogue counts and watched progress; the dark theme remaps it to a raised evergreen surface.

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
- **Control Border**: A stronger edge for fields and controls, distinct from quiet section dividers.
- **Night Paper, Night Surface, Night Soft Surface**: Dark canvas and layered surfaces.
- **Night Text, Night Muted Text, Night Control Text, Night Rule, Night Control Border**: Dark-theme type, dividers, and field edges.

**The Accent Restraint Rule.** Keep terracotta and lichen as accents around evergreen structure; don’t let them replace the quiet paper and forest base.

Reusable interface accents include muted copy, terracotta focus, and the brighter lichen, copper, and link colors used on dark surfaces. Small decorative tints and image overlays remain local to the components that use them.

Hero copy uses dedicated cream, secondary, supporting, and muted text roles. Selected dark-theme controls use the night filter ink token, while the catalogue keeps its deeper evergreen token distinct from the dark hero green.

## Typography

**Display Font:** Playfair Display (with Georgia, serif fallback)
**Body Font:** DM Sans (with sans-serif fallback)
**Label/Mono Font:** DM Mono (with monospace fallback)

**Character:** The serif gives film titles and section heads a literary cadence. The sans keeps descriptions comfortable to read; the mono face makes counts, filters, and provenance feel catalogued.

### Hierarchy
- **Display** (500, 54–64px on desktop and 36–48px on mobile; .98–1.02 line-height): The hero headline uses the large end of the serif voice while keeping its copy intact across widths.
- **Headline** (500, clamp 34–47px on desktop and 28–38px on mobile; -.055em tracking): Catalogue and collection headings.
- **Film title** (serif, 15px in poster cards, 23–38px in the featured film, 28–42px in details): Titles carry the visual hierarchy inside each catalogue view.
- **Body** (400, 14px, typically 1.45–1.7 line-height): Descriptions and explanatory copy; supporting text uses the 12px caption and 13px small-text steps.
- **Card and control text** (15–16px): Film-card titles and editable controls use their own readable steps.
- **Section and supporting display** (18–24px): Local section heads and counts sit between the headline and body scales; large metrics and feature titles may use component-specific sizes.
- **Label** (DM Mono, usually 12px with tracked uppercase where appropriate): Counts, filters, provenance, and edition metadata.

**The Three-Face Rule.** Use Playfair Display for expressive hierarchy, DM Sans for reading, and DM Mono for compact catalogue data; don’t add a fourth type family.

## Layout

The desktop page sits in a centered shell capped at 1320px with 36px side gutters. The masthead is 68px tall (56px on shorter desktop viewports). The evergreen hero starts at a 176px minimum height, with its content setting the final height; the featured stamp is 176px. Below 700px, the masthead is 66px, the hero has a 250px minimum height, and the stamp is hidden. The mobile shell is capped at 560px with 18px side gutters. Sections use the 4px-based spacing scale, with a 38px section step and 40px section-end spacing; the mobile collection uses 22px above and 35px below. Primary controls keep a 44px minimum hit area across desktop and mobile.

The main catalogue has two deliberately different reading modes: a four-column poster grid on wide screens, three columns at 920px and below, and two columns at 430px and below; the ledger presents the same ranking as a comparison table. Search and filters move from a four-column control row to two columns on mobile, where search spans the row. Filter facets and catalogue utilities use separate disclosures. Decade browsing leads with a small quick-pick set and offers search and show-all controls when more are available. The film-details dialog changes to a single-column poster and detail layout below 600px. Short-height desktop layouts tighten the masthead, hero, summary, and catalogue spacing to keep more of the ranked films in view.

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
- **Primary:** The selected filter uses deep evergreen with light text in the light theme, and lichen with dark text in dark mode (44px minimum height, 12px horizontal padding).
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
- **Style:** Search sits on porcelain with a one-pixel hairline, nearly square corners, and a 44px minimum height.
- **Focus:** A three-pixel outline with offset; the dark palette changes its focus color for contrast.

### Navigation
- **Style:** The wordmark and profile link sit at opposite ends of the masthead; a fine divider closes the 68px row. It compresses to 56px on short desktop screens and 66px on mobile.

### Signature Components
- **Hero:** Evergreen field with a fine inset keyline, existing terracotta/lichen light, lichen emphasis in the display type, and a circular, slightly rotated almanac stamp on desktop. The headline, explanatory line, ranking-method link, edition date, and catalogue notes form its content sequence; the stamp hides on mobile.
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
