# Requirements: Q&A Room Improvements

## Functional Requirements
### 1. Barge-In Ring
- Must capture the user's microphone `MediaStream`.
- Must analyze volume levels in real-time.
- Must visually scale/pulse a ring around the user's video feed based on the detected volume. 
- The ring must react even when the AI judge is actively speaking.

### 2. Aggro-Meter (Pacing Indicator)
- Must track continuous user speaking time. 
- Time threshold: If user talks for > 30 seconds continuously, show a subtle amber indicator. If > 45 seconds, pulse red and show a tooltip warning ("Rambling detected - let them speak").
- Timer must reset when an AI judge starts speaking (incoming audio stream).

### 3. Contextual "Attack Vectors" (Dynamic Sub-labels)
- Must scan the active AI judge's text payload (from the Gemini WebSocket) for predefined keywords.
- Must map keyword matches to pre-configured attack vector phrases (e.g., ["market", "users"] -> "Probing Go-to-Market").
- The judge's sub-label must default back to their persona fallback (e.g., "VC Partner") when they finish their turn.

### 4. Deliberation Transition
- Triggered exclusively when the user clicks "End Session" or the 15-minute global cap is hit.
- Must halt all media tracks and close the Gemini Live WebSocket.
- Must fade out the main Q&A grid and mount a fullscreen "Panel is Deliberating..." overlay.
- Must stay on-screen for 3.0 seconds.
- Must route to `/session/[id]/debrief` when complete.

## Non-Functional Requirements
- **Performance**: Audio visualization must run at 60fps without causing React re-renders. Bound volume logic exclusively to a specific component's `style` attribute or `MotionValue`. 
- **Mobile Guard**: UI enhancements must gracefully fall back or hide on screens < 1024px (already handled by global MobileGuard, but code must remain responsive purely as best practice).
- **Design Tokens**: All colors must use `var(--foreground)`, `var(--background)`, internal Tailwind rings, or raw HEX tokens from `DESIGN.md`.

## Acceptance Criteria
- [ ] Speaking into the mic causes a real-time reactive pulse around the user video.
- [ ] Holding a monologue for 45s triggers a visual warning.
- [ ] Ending the session plays the deliberation animation before navigation.
