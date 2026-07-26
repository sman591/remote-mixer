# EQ implementation plan

Working document for the `feat/eq` branch: adding channel EQ control, generically in
the protocol and specifically for the Yamaha 01v96 (4-band parametric).

## Goal

Control the EQ of each channel from the browser, without teaching the frontend or the
backend what an "EQ" is on a per-device basis. Any device controller that describes an
EQ in its `deviceConfig` gets the UI for free.

## Source data

Everything needed for the 01v96 is already in the repo:

- **Addresses** — [message-types.ts](backend/src/devices/yamaha-01v96/message-types.ts)
  already contains `kInputEQ/*`, and the parallel `kAUXEQ/*`, `kBusEQ/*`,
  `kStereoEQ/*` for the other categories. Generated from
  `shared/scripts/src/yamaha-01v96/source.xlsx`.
- **Ranges** — the same spreadsheet carries min/max/default (columns G–I) and a value
  table reference (column J), which the generator currently discards.
- **Encoding** — confirmed in
  [the device TODO](backend/src/devices/yamaha-01v96/TODO.md): gain `-180` is
  `7f 7f 7e 4c` and `+180` is `00 00 01 34`, i.e. 4 × 7-bit big-endian, 28-bit two's
  complement.

### Parameter ranges (`kInputEQ`, identical for AUX/Bus/Stereo)

| Property        | Min | Max        | Default          | Meaning              |
| --------------- | --- | ---------- | ---------------- | -------------------- |
| `kEQMode`       | 0   | 1          | 0                | Type I / Type II     |
| `kEQ{band}Q`    | 0   | 40/43/44   | 41/23/23/42      | index into Q table   |
| `kEQ{band}F`    | 5   | 124        | 36/72/96/112     | index into F table   |
| `kEQ{band}G`    | -180| 180        | 0                | dB × 10              |
| `kEQHPFOn`      | 0   | 1          | 1                | LOW band filter      |
| `kEQLPFOn`      | 0   | 1          | 1                | HIGH band filter     |
| `kEQOn`         | 0   | 1          | 1                | EQ on/off            |

Bands are `Low`, `LowMid`, `HiMid`, `Hi`.

**Q table** (PRM TABLE #11): `0 → 10.0` … `40 → 0.10`, then

- `41` = Low Shelving — LOW band only (max 44)
- `42` = High Shelving — HIGH band only
- `43` = LPF — HIGH band only (max 43)
- `44` = HPF — LOW band only

The mid bands stop at 40.

**F table** (PRM TABLE #12): `5 = 21.2 Hz` … `124 = 20.0 kHz`, 1/12-octave steps
(`f(n) = 16 Hz × 2^(n/12)`). The table itself runs 0–127, but the EQ parameters clamp
to 5–124.

## Design

### 1. Generic parameters in `DeviceConfiguration`

EQ values are ordinary `categories[cat][id][property]` numbers — no state-shape change,
no `StateManager` change. What's missing is a way to describe a property that is not a
0–255 fader. In [shared/types/device.d.ts](shared/types/device.d.ts):

```ts
export type DeviceParameter =
  | { key: string; label: string; type: 'boolean' }
  | {
      key: string
      label: string
      type: 'number'
      min: number
      max: number
      step?: number
      /** display value = value * scale */
      scale?: number
      unit?: string
    }
  | {
      key: string
      label: string
      type: 'enum'
      options: { value: number; label: string; /** for curve math */ number?: number }[]
    }
```

`DeviceConfigurationCategory` gains `parameters?: DeviceParameter[]`.

### 2. An EQ view over those parameters

So the frontend can draw a real EQ rather than a wall of sliders:

```ts
export interface DeviceEqBand {
  key: string        // 'low'
  label: string      // 'LOW'
  gain: string       // property key, e.g. 'eqLowG'
  frequency: string
  q: string
  /** filter enable for shelf/pass bands, e.g. 'eqHpfOn' */
  on?: string
}

export interface DeviceEqConfiguration {
  label: string
  on?: string                    // 'eqOn'
  bands: DeviceEqBand[]
  extraParameters?: string[]     // e.g. ['eqMode', 'att']
}
```

`DeviceConfigurationCategory` gains `eq?: DeviceEqConfiguration`. All plain JSON, so it
rides the existing `sync` message.

The `number` field on enum options is what makes the curve possible: Hz for frequency
options, Q factor for Q options. Shelf/HPF/LPF options leave it unset and are identified
by label.

### 3. Backend: 01v96 mapping

Property naming mirrors the Yamaha names in lower camel case: `eqLowQ`, `eqLowF`,
`eqLowG`, `eqLowMidQ`, …, `eqOn`, `eqHpfOn`, `eqLpfOn`, `eqMode`. This keeps the mapping
table-driven instead of 64 hand-written entries.

New converters in [converters.ts](backend/src/devices/yamaha-01v96/converters.ts):

```ts
const bits = 28
const range = 2 ** bits

export function int2Data(value: unknown): DataBytes {
  if (typeof value !== 'number') return [0, 0, 0, 0]
  const raw = value < 0 ? value + range : value
  return [(raw >> 21) & 0x7f, (raw >> 14) & 0x7f, (raw >> 7) & 0x7f, raw & 0x7f]
}

export function data2Int(data: DataBytes): number {
  const raw = (data[0] << 21) | (data[1] << 14) | (data[2] << 7) | data[3]
  return raw >= range / 2 ? raw - range : raw
}
```

One mapping entry in [mapping.ts](backend/src/devices/yamaha-01v96/mapping.ts) alongside
the aux-send one, driven by a category → element-name table:

```ts
const eqTypePrefixByCategory = {
  ch: 'kInputEQ', aux: 'kAUXEQ', bus: 'kBusEQ', sum: 'kStereoEQ',
}
```

Incoming matches `^(kInputEQ|kAUXEQ|kBusEQ|kStereoEQ)/kEQ(.+)$`; `*On` suffixes use the
existing `onConverter`, everything else uses the int converter.

### 4. Sync — request EQ lazily

[sync.ts](backend/src/devices/yamaha-01v96/sync.ts) requests every property of every
entry at startup. Adding 16 EQ parameters across 49 entries is ~780 extra request/
response round trips over a 31250-baud link — several seconds of pure MIDI bandwidth,
and the existing `// if we send all messages synchronously, we only get a part of them
back` comment shows the console's buffer already sets the pace. That would triple
startup for data nobody is looking at yet.

Instead:

- `DeviceController` gets an optional `syncEntry?(category: string, id: string): void`.
- New `ApiSyncEntryMessage { type: 'sync-entry'; category; id }` in
  [api.d.ts](shared/types/api.d.ts), handled in
  [backend/src/services/api.ts](backend/src/services/api.ts) next to `sync-device`.
- The frontend sends it when the EQ tab opens for an entry, and again on reconnect while
  it is open.
- `StateManager.handleMessage` needs a no-op case so `assertNever` stays exhaustive.

### 5. Frontend

Fill in the commented-out EQ tab in
[entry-dialog.tsx](frontend/src/controls/entry-dialog/entry-dialog.tsx), gated on
`categoryInfo.eq` so devices without an EQ simply do not get the tab. Hidden in IEM mode
like the other detail controls.

- **Header** — EQ ON toggle, TYPE I/II, ATT.
- **Band controls** — four columns (LOW / L-MID / H-MID / HIGH), each with Q, F, G. The
  existing `Fader` already takes `min`/`max`/`step`, so all three work directly on raw
  device values; F's index scale is 1/12-octave, i.e. already logarithmic, which is
  exactly what a fader wants. `FaderButton` needs a formatted-value display so the fader
  reads `+3.5 dB`, `1.00 kHz`, `Q 0.70`, `HPF`.
- **Curve** — SVG plot of the summed magnitude response via the RBJ biquad cookbook
  (peaking / low-shelf / high-shelf / HPF / LPF, chosen per band from the Q option).
  Draggable band handles are the natural follow-up.

## Order of work

1. ✅ Q and frequency value tables generated from `source.xlsx`
   (`generate-eq-tables.ts` -> `eq-tables.ts`); `DeviceParameter` and
   `DeviceEqConfiguration` types added.
2. ✅ `int2Data` / `data2Int` converters + unit tests. The encoding was already
   confirmed in the device TODO, so no hardware round-trip was needed first.
3. ✅ 01v96 mapping table + `deviceConfig.parameters` / `eq`, including the
   attenuator. Message bytes covered by `test/eq-mapping.test.ts`.
   Verified against the console on channels 1 and 16.
4. ✅ `sync-entry` plumbing, backend and frontend.
5. ✅ EQ tab with plain faders. Verified end to end against the dummy device,
   which now has an EQ of its own.
6. ✅ Curve display. The filter math lives in `frontend/src/util/eq-curve.ts`
   (RBJ biquads) and is unit tested; the band a device reports is translated
   into filter settings by `getEqBandSettings`. Devices declare the filter a Q
   value selects through `DeviceEnumParameterOption.filter`, so the frontend
   never has to guess a filter type from a display label.
7. ⬜ Draggable band handles on the curve.
8. ⬜ Rework the HPF/LPF controls (see below).

### Known rough edge: the HPF/LPF controls

Confirmed confusing in use on the console. The low and high band each carry two
overlapping controls: the Q fader runs off its numeric range into `L.SHELF` /
`HPF` (and `H.SHELF` / `LPF`), *and* there is a separate HPF/LPF on/off button,
which is what the `kEQHPFOn` / `kEQLPFOn` parameters map to. Worse, the manual
notes the LOW and HIGH gain controls "function as filter on/off controls when Q
is set to HPF or LPF respectively", so a third control overlaps the same state.

Ideas to try: make the band's filter type an explicit control (PEAK / SHELF /
PASS) that drives the Q value, and show the on/off button only when the band is
in pass mode. Needs the curve first to make the effect legible.

## Follow-ups (out of scope for the first pass)

- **EQ link groups** — `kInputGroup/kInGroupEQ{1-4}` and
  `kSceneInputGroup/kInEQGroup{1-4}` follow the exact pattern the Fader/Mute groups
  already use in [mapping.ts](backend/src/devices/yamaha-01v96/mapping.ts) (indices 1–4
  only). Adding `EQ` there plus a branch in `refreshDependentChannels` keeps linked and
  paired channels consistent in the UI.
- **Aux-send mapping bug** — the `outgoing` guard in
  [mapping.ts](backend/src/devices/yamaha-01v96/mapping.ts) uses `&&` where it means
  `||`. Harmless today only because the byte lookup then fails; worth fixing as more
  property namespaces appear.
- Dynamics, using the same generic parameter machinery.
