# Debrief + Coach Design Spec

> **Source of truth for visual implementation.** All debrief and coach components MUST follow these patterns. They are derived directly from `components/brief/BriefSummaryPreview.tsx` — the Brief screen is the canonical reference for this product's design language.

---

## Core Design Principles

1. **Institutional, not chatbot.** Every element reads like a private equity post-mortem, not a SaaS dashboard.
2. **One dominant CTA per screen.** The action is always obvious. Secondary actions are tertiary in visual weight.
3. **Progressive disclosure.** Content streams in section by section. Never show empty containers — sections appear only when data has arrived.
4. **Muted palette, semantic color only for scores.** `gray-400` / `gray-600` / `gray-900` for all prose. Color (red / amber / yellow / green) is reserved exclusively for fracture scores.

---

## Layout

### Page wrapper (matches Brief page)
```tsx
<div className="max-w-2xl mx-auto px-6 py-10">
  {/* single card */}
</div>
```

### Card shell (matches Brief card)
```tsx
<div className="bg-white rounded-3xl p-8">
  {/* card content */}
</div>
```

### Page-level container with header gradient background
```tsx
<div className="min-h-screen" style={{ background: 'var(--background)' }}>
  <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
    {/* DebriefSectionNav (sticky) */}
    {/* DebriefTriggerCard or DebriefStreamingView */}
  </div>
</div>
```

---

## Typography Tokens (copy exactly from Brief)

| Role | Classes |
|---|---|
| Status badge (e.g. "DEBRIEF READY") | `text-xs font-semibold uppercase tracking-widest text-gray-400` |
| Section title (e.g. "The Verdict") | `text-xl font-bold text-gray-900` |
| Section hint / sub-label | `text-xs text-gray-400 uppercase tracking-wide font-medium` |
| Body prose | `text-sm leading-relaxed text-gray-600` |
| Evidence quote | `text-sm leading-relaxed text-gray-500 italic` |
| Score number (FractureAxis) | `text-sm font-bold text-gray-900` |
| Overall score display | `text-5xl font-bold tracking-tight text-gray-900` |
| Pill / tag text | `text-xs font-medium text-gray-600` |

---

## Spacing & Dividers

Between sections inside a card:
```tsx
<div className="border-t border-gray-100 pt-10">
  {/* next section */}
</div>
```

Between top header row and first section content: `mt-6`  
Gap between card title and hint: `flex flex-col gap-1.5 mb-3`

---

## Reusable Patterns

### Status badge row (matches "BRIEF EXTRACTED")
```tsx
<div className="flex items-center justify-between">
  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
    Debrief Ready
  </p>
  {/* optional action button */}
</div>
```

### Secondary action button (matches "Edit Context")
```tsx
<button className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-black">
  <SomeIcon size={13} />
  Label
</button>
```

### Primary CTA (matches CTAButton — one per screen)
```tsx
// Use CTAButton from @/components/shell/CTAButton
<CTAButton label="Get Debrief" onClick={handleClick} />
// or
<CTAButton label="Talk to Coach" onClick={handleCoach} />
```

### Metadata pill (matches tech stack / team size pills)
```tsx
<span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
  <span className="text-gray-400">Label:</span>
  value
</span>
```

### Bullet list item (matches judging criteria)
```tsx
<li className="flex items-start gap-2 text-sm text-gray-600">
  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
  item text
</li>
```

---

## Component-Specific Specs

### DebriefTriggerCard

Matches the pre-extraction state of the Brief card before the user has submitted.

```tsx
<div className="bg-white rounded-3xl p-8 flex flex-col gap-6">
  {/* Status badge */}
  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
    Your Debrief is Ready
  </p>

  {/* Tension headline */}
  <div className="flex flex-col gap-1.5">
    <h1 className="text-2xl font-bold text-gray-900 leading-snug">
      {turnCount} judges. {questionCount} questions.<br />Here's what they found.
    </h1>
    <p className="text-sm text-gray-500 mt-1">
      Get your fracture map — where your pitch held and where it cracked.
    </p>
  </div>

  {/* CTA */}
  <div className="pt-2">
    <CTAButton label="Get Debrief" onClick={onStart} />
  </div>
</div>
```

> Note: "3 judges" is fixed copy. `questionCount` = total qa_turns for session.

---

### VerdictCard

Matches a single-section Brief card field (e.g. "The Problem").

```tsx
<div className="flex flex-col gap-1.5 mb-3">
  <h2 className="text-xl font-bold text-gray-900">The Verdict</h2>
  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
    Overall assessment
  </p>
</div>
<p className="text-sm leading-relaxed text-gray-600">{verdict}</p>
```

---

### FractureMap

Rendered inside the card as a dedicated section, after a `border-t border-gray-100 pt-10` divider.

**Overall score header** (rendered first, creates tension):
```tsx
<div className="flex flex-col items-center gap-2 mb-8">
  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
    Overall Score
  </span>
  <span className="text-5xl font-bold tracking-tight" style={{ color: scoreColor(overallScore) }}>
    {overallScore}
    <span className="text-lg font-medium text-gray-300">/10</span>
  </span>
</div>
```

**3 axis rows** (stagger in with Framer Motion):
```tsx
<div className="flex flex-col gap-6">
  <FractureAxis persona="VC" score={vc.score} topConcern={vc.top_concern} />
  <FractureAxis persona="Domain Expert" score={domain_expert.score} topConcern={domain_expert.top_concern} />
  <FractureAxis persona="User Advocate" score={user_advocate.score} topConcern={user_advocate.top_concern} />
</div>
```

---

### FractureAxis

Single axis row. Stays within the card's white surface.

```tsx
<div className="flex flex-col gap-2">
  {/* Row: label + bar + score */}
  <div className="flex items-center gap-3">
    <span className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {persona}
    </span>
    {/* Score bar — track is gray-100, fill is semantic color */}
    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: scoreColor(score) }}
        initial={{ width: '0%' }}
        animate={{ width: `${score * 10}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
    <span className="w-10 text-right text-sm font-bold text-gray-900">
      {score}<span className="text-gray-300 font-medium">/10</span>
    </span>
  </div>
  {/* Score label + top concern */}
  <div className="flex items-center gap-2 pl-[7.5rem]">
    <ScoreLabelBadge score={score} />
    <span className="text-xs text-gray-400 leading-relaxed">{topConcern}</span>
  </div>
</div>
```

**`scoreToLabel(score)` utility + color map:**
```ts
export function scoreToLabel(score: number): string {
  if (score <= 3) return 'Critical'
  if (score <= 5) return 'Developing'
  if (score <= 7) return 'Adequate'
  return 'Strong'
}

export function scoreColor(score: number): string {
  if (score <= 3) return '#ef4444'  // red-500
  if (score <= 5) return '#f59e0b'  // amber-500
  if (score <= 7) return '#eab308'  // yellow-500
  return '#22c55e'                  // green-500
}
```

**ScoreLabelBadge** (inline, no separate file needed):
```tsx
const colors: Record<string, string> = {
  Critical:   'bg-red-50 text-red-600 border-red-200',
  Developing: 'bg-amber-50 text-amber-600 border-amber-200',
  Adequate:   'bg-yellow-50 text-yellow-600 border-yellow-200',
  Strong:     'bg-green-50 text-green-600 border-green-200',
}
<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors[label]}`}>
  {label}
</span>
```

---

### FindingsList (Strengths + Weaknesses)

Matches the judging criteria list in BriefSummaryPreview.

```tsx
{/* Section header */}
<div className="flex flex-col gap-1.5 mb-4">
  <h2 className="text-xl font-bold text-gray-900">
    {type === 'strength' ? 'Strengths' : 'Weaknesses'}
  </h2>
  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
    {type === 'strength' ? 'What landed' : 'What cracked'}
  </p>
</div>

{/* Items */}
{findings.length === 0 ? (
  <p className="text-sm text-gray-400 italic">
    {type === 'strength' ? 'No clear strengths identified.' : 'No significant weaknesses flagged.'}
  </p>
) : (
  <ul className="flex flex-col gap-4">
    {findings.map((f, i) => (
      <li key={i} className="flex items-start gap-3">
        <span className={`mt-1 text-base ${type === 'strength' ? 'text-green-500' : 'text-red-400'}`}>
          {type === 'strength' ? '✓' : '△'}
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-800">{f.title}</p>
          <p className="text-sm text-gray-500 leading-relaxed mt-0.5">{f.explanation}</p>
        </div>
      </li>
    ))}
  </ul>
)}
```

---

### IssuesList (Narrative / Delivery / Q&A Vulnerabilities)

Evidence blockquotes feel like a judicial record — institutional weight.

```tsx
{/* Section header */}
<div className="flex flex-col gap-1.5 mb-4">
  <h2 className="text-xl font-bold text-gray-900">{sectionTitle}</h2>
  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{sectionHint}</p>
</div>

{issues.length === 0 ? (
  <p className="text-sm text-gray-400 italic">No issues flagged in this category.</p>
) : (
  <ul className="flex flex-col gap-6">
    {issues.map((issue, i) => (
      <li key={i} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-800">{issue.title}</p>
          {issue.persona && <PersonaTag persona={issue.persona} />}
        </div>
        {/* Evidence blockquote */}
        <blockquote className="border-l-2 border-gray-200 pl-3 text-sm italic text-gray-500 leading-relaxed">
          {issue.evidence}
        </blockquote>
        {/* Recommendation */}
        <p className="text-sm text-gray-600 leading-relaxed">
          <span className="font-medium text-gray-700">Fix: </span>
          {issue.recommendation}
        </p>
      </li>
    ))}
  </ul>
)}
```

**PersonaTag** (inline):
```tsx
const personaLabels: Record<string, string> = {
  vc: 'VC',
  domain_expert: 'Domain Expert',
  user_advocate: 'User Advocate',
}
<span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500">
  {personaLabels[persona]}
</span>
```

---

### NextDrillCard

The one exception to the white-card rule — black bg per spec. Creates visual contrast as the final card.

```tsx
<div className="bg-black rounded-3xl p-8 flex flex-col gap-4">
  <div className="flex flex-col gap-1.5">
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
      Next Drill
    </p>
    <h2 className="text-xl font-bold text-white">Your Priority Action</h2>
  </div>
  <p className="text-sm leading-relaxed text-gray-300">{nextDrill}</p>
</div>
```

---

### DebriefSectionNav

Sticky pill nav — mirrors `SubViewChips` pattern from the shell. Lives above the card, scrolls with the page but sticks at top once the page is scrolled.

```tsx
<nav className="sticky top-[120px] z-40 flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
  {SECTIONS.map((s) => (
    <button
      key={s.id}
      onClick={() => scrollToSection(s.id)}
      disabled={!arrivedSections.has(s.id)}
      className={cn(
        'rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all',
        arrivedSections.has(s.id)
          ? activeSection === s.id
            ? 'bg-black text-white'
            : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-400'
          : 'bg-gray-100 text-gray-300 cursor-not-allowed border border-transparent',
      )}
    >
      {s.label}
    </button>
  ))}
</nav>
```

Section IDs: `verdict`, `fracture-map`, `strengths`, `weaknesses`, `narrative-issues`, `delivery-issues`, `qa-vulnerabilities`, `next-drill`

---

### Interrupted / Partial Debrief Banner

Amber banner — matches the design system's `error-container` semantic but uses amber for non-fatal states.

```tsx
<div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-3">
  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
  <div>
    <p className="text-sm font-semibold text-amber-800">Debrief incomplete</p>
    <p className="text-xs text-amber-600 mt-0.5">
      This session was interrupted. Results may be partial.
    </p>
  </div>
</div>
```

---

### Re-run Modal (when debrief already exists)

Uses `shadcn/ui` Dialog. Warns about coach history archival.

- Title: `text-lg font-bold text-gray-900` — "Re-run Debrief?"
- Body: `text-sm text-gray-500 leading-relaxed` — "A new debrief will be generated. Your current coach conversation will be archived and a new session will start."
- Cancel: `CTAButton variant="secondary"` — "Keep Current"
- Confirm: `CTAButton variant="primary"` — "Re-run"

---

## Coach Screen

The Coach screen (`/session/[id]/debrief/coach`) uses the same card shell but adapts the pattern for a conversational interface. Key rules:

1. **No chat bubble avatars.** Conversations render as text blocks in the card, separated by `border-t border-gray-100`.
2. **Coach messages**: `text-sm leading-relaxed text-gray-600` — same as Brief body prose.
3. **Founder messages**: `text-sm leading-relaxed text-gray-900 font-medium` — slightly heavier weight to distinguish.
4. **Input field**: `rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 w-full resize-none focus:outline-none focus:ring-2 focus:ring-gray-200`
5. **Send button**: Secondary pill, `rounded-full px-4 py-2 text-xs font-semibold border border-gray-200 bg-white hover:bg-gray-50`
6. **Opening prompts** (quick-start chips): Same pill style as `DebriefSectionNav` enabled state — `rounded-full px-4 py-1.5 text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:border-gray-400`

### Message rendering:
```tsx
<div className="flex flex-col divide-y divide-gray-100">
  {messages.map((msg, i) => (
    <div key={i} className={`py-5 ${i === 0 ? 'pt-0' : ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
        {msg.role === 'coach' ? 'Coach' : 'You'}
      </p>
      <p className={`text-sm leading-relaxed ${msg.role === 'coach' ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
        {msg.content}
      </p>
    </div>
  ))}
</div>
```

---

## Framer Motion Guidelines

All animations use `easeOut` or `easeInOut`. Never `spring` (too playful for institutional tone).

```ts
// Section reveal (each debrief section card animates in)
const sectionVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
}

// Score bar fill
const barVariant = {
  hidden: { width: '0%' },
  visible: (score: number) => ({
    width: `${score * 10}%`,
    transition: { duration: 0.8, ease: 'easeOut', delay: 0.1 },
  }),
}

// FractureMap stagger (parent)
const fractureMapParent = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.4, delayChildren: 0.4 } },
}
```

Critical pulse for score ≤ 3 (red bar):
```ts
const criticalPulse = {
  animate: {
    opacity: [1, 0.5, 1],
    transition: { duration: 0.6, repeat: 2, ease: 'easeInOut' },
  },
}
```

---

## What NOT to Do

- **No chat bubbles** — not even for the Coach screen. Text blocks divided by hairlines.
- **No colored backgrounds** inside the white card — except `NextDrillCard` (black) and score semantic badges.
- **No emojis or icons as decoration** — icons only for functional affordances (edit pencil, close X, alert triangle).
- **No skeleton loaders** — sections simply don't render until `STATE_DELTA` arrives. Smooth section-by-section appearance is the loading state.
- **No hover cards / popovers for persona attribution** — use inline `PersonaTag` pills instead.
- **No gradients on score bars** — solid semantic colors only.
