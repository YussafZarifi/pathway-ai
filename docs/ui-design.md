# UI & Design

## Design language (current)
- **Mood:** dark "AI startup": pure black background, soft purple/pink and blue radial glows at the edges.
- **Accent:** purple → pink gradient (`#a855f7` → `#ff37d0`), used on the primary CTA (`.uiverseBtn`), logo, headline highlight, progress fills and radial meters.
- **Type:** system UI stack (`ui-sans-serif, system-ui, …`). `"Inter"` appears in one rule but is never loaded.
- **Motion:** framer-motion. Staggered hero entrance, card lift on hover, quiz slide/fade between questions, spring slider bubble, ring stroke animation, timeline stagger.
- **Surfaces:** near-black cards (`#0b0b0b`–`#111`), 1px translucent borders, 12–20px radii.

## Page review (from the 2026-09-24 audit)
| Page | Works | Needs work |
|---|---|---|
| Landing | Clear value prop, CTA, feature cards | Narrow content column with empty space on wide screens; small low-contrast subtext; 2 of 3 features "Coming soon"; dead Log in / Sign Up; no "how it works", product shot or proof; hero hidden until JS animates |
| Home | — | Fake stats and activity; oversized empty cards; wrong icons (Users = Home, BarChart = Settings); different header from other pages; unreachable from Landing |
| Quiz | Best screen: focused card, progress, accessible slider | Dim disabled CTA; no keyboard shortcuts; answers lost on refresh; no time-remaining hint |
| Results | Rich cards, compare, regenerate, share, states | Copied letter loader clashes with the style; hover-only tooltip on "None of these"; compare hidden behind a mode toggle; fake share link; PDF is a screenshot of a dark page; "Try again" reloads the page |
| Dashboard | Readiness rings look good | Contradicting % numbers; 2 of 3 tabs "Coming soon"; dead Save / Mark buttons; no way to switch career or go back to results |

## Consistency problems
- Three product names (PathwayAI / RoadmapAI / roadmap-ai). Four different header implementations.
- Two button systems (`uiverseBtn` + `ghostBtn` vs `primaryBtn`).
- Three loader styles (letter wave, orb, shimmer).
- Three theme mechanisms that all render black.
- Only 8 CSS variables; about 130 raw colour literals.

## Accessibility gaps
- Modals: no `role="dialog"`, `aria-modal`, labelled title, focus trap, Esc to close or focus return. Icon-only close buttons have no `aria-label`.
- Clickable `<div>` cards (Landing, Home) aren't keyboard reachable.
- Interactive elements nested in `<button>` (Results checkbox, timeline links).
- Few `:focus-visible` styles; no `prefers-reduced-motion`.
- Small grey-on-black text likely fails WCAG AA contrast.

## Design direction (🗺️)
1. **Tokens** in `:root`: colour (bg, surface-1/2/3, border, text, text-muted, accent, accent-contrast, success, warning, danger), spacing (4/8/12/16/24/32/48/64), radius (sm/md/lg/pill), shadow, motion durations.
2. **Type scale:** 12 / 14 / 16 / 18 / 20 / 24 / 32 / 40 / 56. Load one font properly (Inter or Geist) with `font-display: swap`, or keep the system stack.
3. **One accent, used sparingly:** the gradient only for the primary CTA and progress. Neutrals elsewhere. One semantic palette for success, warning and danger.
4. **One app shell:** a consistent header (brand, nav, account) on all post-landing pages. Pick one dashboard design.
5. **Components:** `Button` (primary/secondary/ghost/danger; sm/md/lg; loading state), `Card`, `Modal` (accessible), `Badge`, `Skeleton`, `Toast`, `EmptyState`, `ErrorState`.
6. **Honest UI:** no fake numbers, no dead buttons. Unbuilt features are hidden, or disabled with a "Planned" tooltip, and not shown on marketing pages.
7. **Loading:** skeletons that match the final layout. Stream roadmap steps in.
8. **Motion:** keep it subtle; all motion off under `prefers-reduced-motion`; never gate content visibility on JS animation.
9. **Responsive:** verify at 360 / 390 / 768 / 1024 / 1440. Results and Dashboard need a mobile pass (mobile hasn't been visually verified yet).
10. **Light theme** (optional) via tokens and `prefers-color-scheme`.
11. **Landing:** add "How it works" (3 steps), a real product screenshot or GIF, an FAQ and a footer with GitHub/privacy links.
