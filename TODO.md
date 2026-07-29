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
- Group the band faders visually. The three faders of each band (F / G / Q) sit so close
  to the neighbouring band's that it is hard to tell at a glance which band a given
  fader belongs to — needs spacing, a per-band container, or a band label.

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

## Tech

- Make a failed production build loud. Left over from the Pi's stale-bundle bug (EQ not
  rendering, now fixed): `yarn build` runs the frontend and backend under `run-p`, so a
  frontend build that dies — webpack + Linaria on Pi memory being the suspect — leaves
  the backend updated and the service restarted over an old `frontend/dist`, with
  nothing to signal it.
