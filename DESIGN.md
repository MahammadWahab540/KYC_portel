# NxtWave Self-Service KYC & Enrollment Platform - Design System (DESIGN.md)

This document formalizes the design tokens, components, visual hierarchy, typography, responsive breakpoints, and interaction rules derived directly from the NxtWave interactive design prototype.

---

## 1. Color Tokens

```css
:root {
  /* Brand Primary */
  --pur: #7136ef;            /* Primary NxtWave Purple */
  --pur2: #844cff;           /* Accent Purple */
  --violet: #f4efff;         /* Soft Lavender Background */
  --pur-dark: #5635c5;       /* Pressed / Dark Purple */
  --pur-gradient: linear-gradient(110deg, #7840f0, #6532e7);

  /* Neutrals & Surfaces */
  --ink: #0c1b3b;            /* Deep Ink Blue - Primary Text */
  --ink-secondary: #102448;  /* Form Text High Contrast */
  --muted: #687894;          /* Secondary Muted Slate */
  --muted-light: #8c96ab;    /* Field Info / Helper Text */
  --line: #e0e7f2;           /* Card & Container Borders */
  --line-strong: #a9bbd4;    /* Input Borders */
  --bg: #f4f7fb;             /* Canvas Background */
  --bg-card: #ffffff;        /* Surface White */
  --bg-input: #edf3fc;       /* High Contrast Input Surface */

  /* Functional Status Colors */
  --success: #078758;        /* Verified / Approved Green */
  --success-bg: #ebfaf3;     /* Success Badge / Container */
  --warning: #a96516;        /* In Review / Pending Amber */
  --warning-bg: #fff6e9;     /* Warning Badge / Container */
  --danger: #b84e42;         /* Error / Rejected Red */
  --danger-bg: #fff2ef;      /* Error Container */
  --blue: #1870d5;           /* Info Blue */
  --blue-bg: #eff7ff;        /* Info Container */
}
```

---

## 2. Typography

- **Primary Font Family**: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
- **Scale**:
  - `Display / Heading`: `27px` (line-height: `1.14`, letter-spacing: `-0.85px`, weight: `860`)
  - `Subheading / H2`: `17px` (line-height: `1.3`, letter-spacing: `-0.3px`, weight: `750`)
  - `Body Copy`: `14px` (line-height: `1.55`, color: `var(--ink)`, weight: `450`)
  - `Small / Helper`: `12px` (line-height: `1.45`, color: `var(--muted)`, weight: `500`)
  - `Eyebrow / Smallcaps`: `10px` (text-transform: `uppercase`, letter-spacing: `0.09em`, weight: `830`, color: `var(--pur)`)

---

## 3. Spacing & Elevation

- **Radii**:
  - Inputs: `12px`
  - Cards: `17px` - `23px`
  - Badges / Pills: `999px`
- **Shadows**:
  - Card Shadow: `0 8px 30px rgba(28, 41, 89, 0.05)`
  - Button Shadow: `0 5px 11px rgba(104, 60, 237, 0.18)`
  - Modal / Sheet: `0 -14px 32px rgba(7, 13, 41, 0.12)`

---

## 4. Responsive Breakpoints

| Breakpoint | Target Screen | Layout Behavior |
|------------|---------------|-----------------|
| `< 740px` | Mobile (iOS / Android) | Single column, full-bleed screen, sticky bottom CTA bar (`padding-bottom: env(safe-area-inset-bottom)`), header compact |
| `741px - 1150px` | Tablet / Small Laptop | Centered max 480px interactive column, progress rail |
| `> 1150px` | Desktop | 3-column layout: Navigation & Stage Steps Rail, Active Form Viewport (max 520px), Live Application Summary & Audit Ledger |

---

## 5. Interaction Patterns

1. **Sticky Bottom CTA**: On mobile viewports, the primary submission CTA is fixed to the bottom viewport with backdrop blur and high z-index.
2. **Camera & File Upload Box**: Supports tap-to-take photo via HTML5 file input with `capture="environment"` as well as native file picker. Provides visual blur detection feedback and document framing guides.
3. **Confidence Badges on OCR**: Extracted fields display confidence score pills:
   - Green (`> 85%`): High confidence, automatically pre-filled.
   - Amber (`70% - 85%`): Medium confidence, highlights field for user verification.
   - Red (`< 70%`): Low confidence, requires mandatory re-confirmation or re-upload.
4. **Multilingual Localization**: All labels, tooltips, validation messages, and document guidance notes are parameterized across `en`, `te`, `hi`, and `kn`.
