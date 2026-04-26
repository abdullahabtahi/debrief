# Validation & Edge Cases: Q&A Room Improvements

## Manual Test Cases
| ID | Test Case | Steps | Expected Result |
|----|-----------|-------|-----------------|
| QA-UX-1 | Real-time Volume Reactivity | Unmute mic. Speak quietly, then loudly. | Ring scales proportionally to volume level. |
| QA-UX-2 | Independent Reactivity | Speak while the AI judge is simultaneously speaking. | User's ring continues to pulse independently of the judge's audio. |
| QA-UX-3 | Aggro-Meter Trigger | Mute local speakers (so AI doesn't interrupt). Speak continuously for 46 seconds. | UI circle turns amber at 30s, red at 45s, displaying "Rambling" warning. |
| QA-UX-4 | Aggro-Meter Reset | Stop speaking, wait for AI judge to reply. | The monologue timer resets to 0 immediately when AI takes a turn. |
| QA-UX-5 | Dynamic Sub-labels | Have the AI judge say the word "competitor" or "market" in their response. | The active speaking judge's label changes from their static title to a dynamic attack vector string. |
| QA-UX-6 | Deliberation Bridge | Click the "End Session / Finish" button while in active Q&A. | UI blurs/fades. "Deliberating..." message appears for 3s. Routes to `/debrief`. WebSocket closes cleanly. |

## Edge Cases to Audit
- **Hardware Disconnect**: If the microphone is unplugged during the session, the `AnalyserNode` might throw an error. Wrap audio context hook in a `try/catch`.
- **Memory Leaks**: `setInterval` for the Aggro-Meter must be cleared on component unmount to prevent state updates on an unmounted component after routing to the Debrief segment.
- **AudioContext Autoplay Policy**: Browsers block `AudioContext` from starting without a user gesture. Ensure the audio context is created *after* the user has clicked "Join Room" or "Start Recording".
