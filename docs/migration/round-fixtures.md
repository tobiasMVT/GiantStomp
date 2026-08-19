# Phase 0 Round Fixtures

Purpose: keep representative round payloads for deterministic regression checks during refactor.

## Fixture Rules
- Keep 5-10 fixtures.
- Include at least: no-win spin, single-cascade win, multi-cascade win, edge-case long sequence.
- Store both raw payload and short expected summary.

## Fixture Index

| Fixture ID | Type | Source | Expected Summary | File |
|---|---|---|---|---|
| F01 | TODO | runtime capture | TODO | `docs/migration/fixtures/F01.json` |
| F02 | TODO | runtime capture | TODO | `docs/migration/fixtures/F02.json` |
| F03 | TODO | runtime capture | TODO | `docs/migration/fixtures/F03.json` |
| F04 | TODO | runtime capture | TODO | `docs/migration/fixtures/F04.json` |
| F05 | TODO | runtime capture | TODO | `docs/migration/fixtures/F05.json` |

## Capture Procedure
1. Run a normal game session in legacy mode.
2. Capture the full `roundStates[]` payload before playback starts.
3. Save raw payload into `docs/migration/fixtures/<ID>.json`.
4. Add one-line expected behavior summary in the table.

## Verification Usage
- During each phase, replay/compare against fixtures.
- Confirm state progression and visual milestones are unchanged unless intended.
