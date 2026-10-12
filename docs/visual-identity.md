# Open Translate visual system

An original language workbench for people using their own translation engine.

| Role | Light | Dark |
| --- | --- | --- |
| Text | Ink `#12232e` | `#e5eee9` |
| Workspace | Paper `#f4f3ed` | `#13232b` |
| Surface | `#fffef9` | `#1b3038` |
| Action | Teal `#087f75` | Mint `#7fdcc5` |
| Supporting text | `#52646c` | `#afc2c7` |
| Soft surface | `#e2eee6` | `#244139` |

The single token system in `extension/pages/ui.css` also feeds Rare UI's theme aliases. The injected page panel and translation marks use the same ink/paper/teal palette. Video overlays retain a high-contrast neutral background for readability.

Our original SVG mark consists of offset brackets and a central diamond. All four extension icon sizes are rendered from this vector. No reference-product assets or fonts are used for branding. Document font assets are separately attributed in their font notices.

Workspace navigation starts with tasks, followed by engine and preferences. The popup is 392px wide with an engine header, visible language labels, page action, reading preferences and a linear tool list. It does not reproduce the reference layout. Components use 6–10px corner radii, restrained borders, system typography and mono labels. The workspace collapses to a wrapping navigation bar on narrow screens.

Acceptance exercises all eight routes in light/dark themes at 1280px and 390px, keyboard navigation, visible control names, horizontal overflow, reduced-motion mode, and text-token contrast of at least 4.5:1. Screenshots in `dist/acceptance/ui/` are inspected as rendered UI, in addition to automated assertions. This is a focused accessibility check, not a full WCAG certification.

The workspace and popup provide Chinese, English, French, Spanish, Japanese and Korean controls and authored help text. They follow the browser language on first use, with English fallback for unsupported languages. The shared language picker saves an explicit choice locally. UI language does not change the translation source/target, user-entered endpoint/model fields or translated content. Native browser controls and provider diagnostics retain their own language.
