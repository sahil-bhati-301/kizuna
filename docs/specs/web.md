# web: spec digest
Source: docs/architecture-design.md. The architecture doc wins any conflict.
Covers: §7.1, §7.2 (UX only), §7.3

## §7.1 Frontend architecture

### Stack

- Framework: Next.js (App Router), React and strict TypeScript. → arch §7.1
- Design system: Tailwind CSS with shadcn/ui on Radix primitives; Motion handles animation. → arch §7.1
- Server state goes through TanStack Query. The API client is generated from the OpenAPI spec. → arch §7.1

### Drill session state machine

Implemented as an explicit state machine (XState or a typed reducer). → arch §7.1

- Happy path: `loading → presenting → answering → feedback(correct | incorrect | alt-reading-retry) → next → … → summary`. → arch §7.1
- A side channel flushes the answer buffer. → arch §7.1
- The machine is unit-tested independently of the UI. → arch §7.1

### Rendering

- Marketing pages and public kanji pages are statically generated from the content release: 2,000+ indexable pages, each with attribution. → arch §7.1
- Authenticated app pages render on the client. → arch §7.1

### Content delivery

- A release manifest points at static JSON chunks: per-level bundles plus per-kanji detail. → arch §7.1
- Chunks sit on a CDN with immutable caching and are cached in IndexedDB. → arch §7.1
- Session plans reference content only by ID. → arch §7.1

### Session resilience

- The whole plan is fetched up front; grading is local. → arch §7.1
- Answers are buffered in IndexedDB. → arch §7.1
- Flush triggers: every 5 answers, on visibility change, and at session end. → arch §7.1
- Each answer carries a client UUID idempotency key. → arch §7.1
- A session resumes after a reload. → arch §7.1

### Japanese text

- Every Japanese span carries `lang="ja"` (without it, Han unification can render Chinese glyph forms; 直 and 骨 look different). → arch §7.1
- Fonts: Noto Sans JP and Noto Serif JP via `next/font` with unicode-range subsets; Klee One for the handwritten style. → arch §7.1
- Furigana uses `<ruby>`. → arch §7.1

### Input

- WanaKana is bound to answer fields so romaji becomes kana while typing. Native IME input also works. → arch §7.1
- The iOS and Android keyboards are part of the test matrix. → arch §7.1

### Layout

- Mobile-first. → arch §7.1
- Mobile: bottom tab bar (Home, Study, Insights, Progress, Profile). Desktop: sidebar. → arch §7.1
- The drill screen is full-bleed. → arch §7.1
- Drill keyboard shortcuts: `Enter` submits, `1–6` picks an option, `Space` continues, `?` opens help. → arch §7.1

### Accessibility

Target: WCAG 2.2 AA. → arch §7.1

- Focus management through the drill flow; `aria-live` announcements for feedback. → arch §7.1
- Mastery colours are colour-blind safe and labelled or patterned. → arch §7.1
- `prefers-reduced-motion` variants for every celebration; adjustable kanji size. → arch §7.1

### Source layout

```
apps/web/src/
  app/(marketing)/      landing, pricing, /kanji/[literal] (public, SSG), /credits, legal
  app/(auth)/           sign-in, onboarding (goal; placement and Anki import from Phase 3)
  app/(app)/            home, study, lessons, insights, progress, achievements, settings, billing
  features/session/     state machine, exercise renderers (one per type), input, feedback animations
  features/insights/    knot cards, evidence views, experiment results
  features/progress/    kanji map, forecast, calendar heatmap, mastery rings, skill profile
  features/gamification/ XP bar, streak, goal ring, achievement toasts, rank-up
  features/kanji/       detail view, stroke-order player (KanjiVG), personal overlay
  shared/api/           generated client + query hooks
  shared/content/       release manifest, IndexedDB cache
  shared/ui/            design tokens and components (from packages/ui)
```

→ arch §7.1

## §7.2 UX and gamification (UX only)

The mechanics table (XP, daily goal, streak, ranks, knots, achievements, celebrations, daily quests) and its integrity guards are owned by the account digest; the web renders them and does not restate them. → arch §7.2

### Core loop

Cue (reminder or streak) → a 5–15-minute session → feedback (XP, rings, knot progress) → visible progress (kanji map, rank) → the next cue. → arch §7.2

### Key screens

**Home.** → arch §7.2

- Goal ring, streak.
- A "Start ≈ 12 min" button.
- Due and new counts.
- The top knot card.
- A 7-day forecast sparkline.

**Session.** → arch §7.2

- A large kanji and adaptive input with instant feedback:
  - right: a gentle pop;
  - wrong: a shake plus the answer plus a "confused with 末?" chip.
- A cosmetic combo meter and "Why this?".
- An end summary: XP, items strengthened, knot progress, tomorrow's forecast.

**Lesson.** → arch §7.2

- A component-assembly animation.
- Stroke order (KanjiVG).
- Keyword.
- A "write your own" mnemonic.
- Example words with audio.

**Insights.** → arch §7.2

- Knots with their evidence.
- Your own counts, shown descriptively. Example: "drilled items: 5 of 6 right at 2 weeks; not yet drilled: 3 of 6. Too few items to be conclusive".
- Platform-level results once a template has enough data. Example: "Across learners, contrast drills: +9 points at 2 weeks".

**Progress.** → arch §7.2

- A Kanji map: every Jōyō kanji as a grid cell coloured by stage, filterable by JLPT level, grade or radical.
- Mastery rings, a calendar heatmap, the review forecast, and the skill profile.
- (Phase 4) a radical-family "threads" graph that lights up as families are learned.

**Kanji page.** Public facts plus a personal overlay (your rings, history, confusions). → arch §7.2

**Settings.** Goal, desired retention (with a plain-language trade-off), track, reminders, fonts, furigana, sound, motion. → arch §7.2

### Ethical habit design

No fake urgency; no streak-loss upsells; a clear "done for today" state; opt-in reminders with frequency caps; vacation mode. → arch §7.2

## §7.3 API design

### Conventions

- REST with JSON under `/v1`. → arch §7.3
- Validated with Zod; the OpenAPI spec is generated from those schemas. → arch §7.3
- Cookie-session auth. → arch §7.3
- An idempotency key is required on every write that creates records. → arch §7.3
- Errors use RFC 9457 `problem+json`. → arch §7.3
- List endpoints use cursor pagination. → arch §7.3

### Endpoints

| Method and path | Purpose |
|---|---|
| `/auth/*` | Auth library routes: magic link or OTP, OAuth, passkeys, sign-out |
| `GET /v1/me` | Profile, settings, entitlements, current content release |
| `PATCH /v1/me/settings` | Goal, desired retention, track, reminders, UI preferences |
| `POST /v1/onboarding/placement` · `POST /v1/onboarding/placement/{id}/answers` | Adaptive placement test (Phase 3) |
| `POST /v1/onboarding/anki-import` | Upload an Anki export; returns matched and unmatched cards (Phase 3) |
| `GET /v1/home` | Due and new counts, estimated minutes, goal, streak, top knots, forecast |
| `POST /v1/sessions` | Plan a session: `{mode: daily, reviews, lessons or focus, hypothesisId?, budgetMinutes}` |
| `GET /v1/sessions/{id}` | Resume a session (up to 7 days after it started; §7.5) |
| `POST /v1/sessions/{id}/answers` | Batch of answers (idempotent). Returns confirmations and XP deltas. |
| `POST /v1/sessions/{id}/complete` | Session summary, goal and streak status, unlocked achievements |
| `GET /v1/progress/map?scope=jlpt:N4` | Per-kanji stages for the kanji map |
| `GET /v1/progress/stats` | Retention, forecast, activity calendar, skill profile |
| `GET /v1/items/{type}/{id}` | Personal overlay: traces, history, confusions |
| `POST /v1/items/{type}/{id}/actions` | Suspend, resume, reset, add synonym, report an issue |
| `GET /v1/insights` · `GET /v1/insights/{id}` | Knots with evidence and experiment results |
| `POST /v1/insights/{id}/feedback` | "Not right" or "helpful" |
| `GET /v1/achievements` | Unlocked achievements and progress towards the rest |
| `GET /v1/content/release` | Current release manifest (chunk URLs and hashes) |
| `POST /v1/billing/checkout` · `POST /v1/billing/portal` | Provider-hosted checkout and self-service portal |
| `POST /webhooks/billing` | Signed provider webhooks |
| `POST /v1/me/export` · `DELETE /v1/me` | GDPR export and account deletion |
| `/internal/*` (admin role) | Content review queue, audited user inspector, experiment dashboards |

→ arch §7.3
