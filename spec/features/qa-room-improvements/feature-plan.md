# Q&A Room Improvements (UX Overhaul)

## What It Is
An overarching UX and product improvement to the Q&A Room (Phase 4). The goal is to transform the UI from a "Zoom call" into a visceral, high-stakes "Hot Seat" simulation. This feature introduces visual tension, real-time coaching indicators, and dramatic state transitions.

## Selected Features
1. **The "Barge-in" Affordance & Active Speaker Pulse**: Visual indicators (glowing rings/pulses) for both the active judge and the user's mic to encourage continuous, debate-style interaction.
2. **The "Aggro-Meter" / Pacing Indicator**: A dedicated visual mechanism to detect if the user is rambling or monologuing for >45s continuously without engaging the judges.
3. **Contextual "Attack Vectors" (Dynamic Sub-labels)**: Instead of static titles, judges' labels update dynamically (e.g., "Probing Go-to-Market") based on real-time keyword matching in the transcript stream.
4. **The "Deliberation" Transition**: A dramatic 3-5 second loading state when the room ends, blurring out the judges before advancing to the debrief. Provides a narrative bridge and time for backend finalization.
5. **Google Meet-style Stage Layout (Founder-Dominant)**: The founder's webcam is the dominant visual element (left, ~70% width), with the 3 judge tiles stacked in a vertical right rail (~30% width). This re-frames the room as a *rehearsal subject under examination* rather than a panel-of-three with the founder as observer. Mirrors the visual language of presenter mode in Google Meet / Zoom.

   ### Layout Rationale
   - The founder is the rehearsal subject — they should see themselves prominently, the way a presenter sees their own video on a real call.
   - Judges remain visually present (3 stacked tiles, right) but no longer compete with the founder for attention.
   - Active-speaker glow on judge tiles still draws the eye when a judge speaks; founder tile keeps the BargeInRing for audio-reactive feedback.
   - Captions strip remains at the bottom, full-width.

   ### Component Changes
   - `UserPiP.tsx`: gains a `variant: 'pip' | 'dominant'` prop. In `dominant` mode it fills its parent (no fixed 256x192), shows a larger label, and the BargeInRing scales up. **Single camera capture preserved** — still one `getUserMedia({ video: true })` call.
   - `JudgeTile.tsx`: gains a `compact?: boolean` prop. In compact mode renders avatar (56px) + name + active glow only. Title and persona tag move to a `title=` HTML tooltip on hover. Dynamic attack-vector label remains visible *only when active speaker* as a small line under the name (it's the most valuable runtime signal).
   - `QARoom.tsx`: stage `<main>` becomes a 2-column flex: left = `<UserPiP variant="dominant">` filling available space, right = vertical column of 3 `<JudgeTile compact>` tiles.

   ### Constraints
   - Single camera capture: never call `getUserMedia({ video: true })` more than once. Variant prop is the only allowed switch.
   - All MotionValue wiring (mic level → BargeInRing) preserved with identical refs.
   - `LiveCaptionsPanel` placement and props unchanged.
   - `SessionProgressBar`, `SessionTimer`, `ConnectionStatusBanner`, `QAControls`, `EndSessionModal`, `DeliberatingScreen`, 3-min warning toast — all unchanged.

## Component Inventory
### Modified
- `src/components/qa/QARoom.tsx` (Layout refactoring: Inverted Grid, handling Deliberation state)
- `src/components/qa/JudgeTile.tsx` (Integrating active speaker glow/pulse)
- `src/components/qa/UserPiP.tsx` (Integrating barge-in ring and aggro-meter styling)

### New
- `src/components/qa/BargeInRing.tsx` (Framer motion audio-visualizer wrapper)
- `src/components/qa/PacingIndicator.tsx` (Circular progress/timer warning for monologues)
- `src/components/qa/DeliberationScreen.tsx` (Full-screen overlay state)

## Data Flow & Architecture
- **Audio Analysis**: Use `AudioContext` and `AnalyserNode` directly in a custom hook `useAudioVolume` to monitor the user's raw `MediaStream` volume. 
- **Performance**: We will *avoid* putting high-frequency (60fps) volume data into React state. Instead, we will directly mutate a DOM node's CSS variable (`--volume`) or use Framer Motion's `useMotionValue` to ensure 60fps animations without component unmounting/re-rendering.
- **Pacing Engine**: A simple React `useRef` timer interval that starts incrementing when user volume > threshold, and resets when the server sends a `serverContent` event (model speaking).
