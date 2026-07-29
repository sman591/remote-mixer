# TODO

The working backlog. Design work that outgrows a bullet here gets its own plan document
— see [EQ-PLAN.md](EQ-PLAN.md) for the pattern, and for the current state of the EQ work.

## In progress

**EQ** — [EQ-PLAN.md](EQ-PLAN.md) carries the design and a step-by-step status; steps 1–6
have landed. What is left:

- Draggable band handles on the curve. Drag = frequency + gain together; needs the
  inverse of the index→Hz mapping to snap back to a valid F index.
- Rework the HPF/LPF controls. Confirmed confusing on the console: three overlapping
  controls for one state (Q running off-scale into `HPF`/`L.SHELF`, the separate on/off
  button, and the gain control doubling as an on/off in pass mode). Idea: an explicit
  PEAK / SHELF / PASS control that drives Q, with the on/off button shown only in pass
  mode.

## Roadmap

- Highlight pairs/groups
- On buttons for fader properties
- Show the dB value below each fader
- Mark the nominal / 0 point on the vertical fader bar, the way a traditional console
  scales its faders
- EQ link groups — `kInputGroup/kInGroupEQ{1-4}` and `kSceneInputGroup/kInEQGroup{1-4}`
  follow the Fader/Mute group pattern already in
  [mapping.ts](backend/src/devices/yamaha-01v96/mapping.ts) (indices 1–4 only), plus a
  branch in `refreshDependentChannels` to keep linked and paired channels consistent.
- Dynamics — should reuse the generic parameter machinery the EQ work built, so no
  device-specific frontend code.

## Bugs

- **01v96 EQ does not render on the Raspberry Pi** — confirmed, and not an EQ bug: the
  Pi serves a **stale frontend bundle**. Its backend is current (the `sync` from
  `10.0.0.104:8000` reports `mode: full` and carries `eq` plus all 17 `parameters` on
  every category), but the `main.js` it serves contains no EQ code at all — no
  `sync-entry`, no `lowShelf` / `highPass` / `peaking` — while still containing
  `bypassIemMode`. So `frontend/dist` was built somewhere between [f8bb91e] (IEM mode)
  and [06bfa83] (the first EQ commit), and `backend/dist` was rebuilt since.
  Fix is to rebuild the frontend on the Pi. Still open: *why* the two halves diverged —
  `yarn build` runs both under `run-p`, so a frontend build that failed (webpack +
  Linaria on Pi memory is the obvious suspect) would leave exactly this state, with the
  backend updated and the service restarted over an old `dist`. Worth confirming on the
  box, and worth making the failure loud if that is what happened.

## Tech

- Add heartbeat to improve connection loss scenario
- [CLAUDE.md](CLAUDE.md) claims tests only exist in `shared/utils/test`, which stopped
  being true once the EQ tests landed under `backend/` and `frontend/`.
