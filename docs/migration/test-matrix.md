# Phase 0 Test Matrix (Baseline)

Status: In Progress
Owner: tobiasMVT

## How to use this file
- Run each scenario on the current legacy flow before refactor.
- Mark Pass/Fail and add notes.
- Keep at least one screenshot/video for visual-sensitive scenarios.

## Environment Baseline
- Build: dev (`npm start`)
- Browser + version:
- Screen profile: desktop / mobile portrait / mobile landscape / tablet
- Date/time:
- Commit hash:

## Scenario Table

| ID | Scenario | Steps | Expected | Result | Notes |
|---|---|---|---|---|---|
| S01 | Normal spin lifecycle | Press spin once from idle | Spin starts, animations complete, returns idle | TODO | |
| S02 | Multi-cascade round | Trigger a known cascade-heavy round | Multiple respins, correct sequence, end at nextAction=spin | TODO | |
| S03 | Autoplay start/stop | Enable autoplay, then stop during/after round | Autoplay toggles correctly, no lockups | TODO | |
| S04 | Bet lock window | Try changing bet during active round | Bet blocked during round; enabled again at idle | TODO | |
| S05 | Sound toggle | Toggle sound off/on during runtime | SFX mute/unmute behavior remains consistent | TODO | |
| S06 | Pause/resume | Pause mid animation, then resume | No deadlock, scene continues correctly | TODO | |
| S07 | Balance correctness | Track debit on spin and credit on round end | Wallet updates are numerically correct | TODO | |
| S08 | Stop/quick interaction | Trigger stop/continue behavior while round active | No broken state, transitions remain valid | TODO | |
| S09 | Resize responsiveness | Resize viewport across profiles | Game area stays stable, no severe overlap | TODO | |
| S10 | Error handling smoke | Simulate/force failed round generation once | UI recovers without permanent lock | TODO | |

## Exit Criteria (Phase 0)
- At least S01-S09 marked Pass with notes.
- Any Fail has reproduction notes and a follow-up task.
- Baseline commit hash captured.
