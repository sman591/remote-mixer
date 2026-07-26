# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Web-based remote control for mixing consoles. A Node backend talks to a physical mixer (MIDI/OSC) and mirrors its state over WebSocket to any number of browser clients.

## Commands

Yarn 4 workspaces monorepo — run everything from the repo root.

```bash
yarn dev
```

Runs the backend (port 8000) plus the webpack dev server (port 8001, opens a browser, proxies `/websocket` and `/api` to 8000), and watch-mode compilers for both. Use port 8001 during development.

| Task | Command |
| --- | --- |
| Everything CI does | `yarn all` (lint + test + build) |
| Lint (eslint + tsc + prettier + stylelint, all in parallel) | `yarn lint` |
| Typecheck only | `yarn lint:ts` (or `yarn lint:ts:watch`) |
| Autoformat | `yarn prettier` |
| Test | `yarn test` |
| Single test file | `yarn test shared/utils/test/number.test.ts` |
| Single test by name | `yarn test -t 'name of the test'` |
| Production build | `yarn build` |
| Run production build | `yarn start` (port 8000) |
| Run a script in one workspace | `yarn backend <script>` / `yarn frontend <script>` |

Note `yarn build` runs `yarn clean` first, which wipes `dist` and the Linaria/eslint caches — a full rebuild takes a while. Tests currently only exist in `shared/utils/test`.

Runtime config lives in `config/remote-mixer-config.js`, which is tracked in git — this fork commits its own setup (`yamaha-01v96`, debug logging). It sets `device`, `mode`, `httpPort`, `logLevel`; defaults are in [backend/src/services/config.ts](backend/src/services/config.ts). `device: 'dummy'` emits random changes and meters, so the whole stack runs without hardware.

## Architecture

### One protocol, one state shape, both sides

Everything flows through a single WebSocket at `/websocket`. Message types are defined once in [shared/types/api.d.ts](shared/types/api.d.ts) and used verbatim by the mixer device controllers, the backend, and the browser.

State is deliberately generic — the backend never knows what a "channel" is:

```
state.categories[categoryKey][id][property] = value   // e.g. categories.ch['3'].aux1 = 200
state.meters[categoryKey + id]                        // e.g. meters.ch3 = 0..255
```

The same [`StateManager`](shared/controls/src/state-manager.ts) class reduces messages into that shape on **both** backend ([backend/src/services/state.ts](backend/src/services/state.ts)) and frontend ([frontend/src/api/state.ts](frontend/src/api/state.ts)). Its `handleMessage` returns `false` for no-op changes, and both sides use that to suppress redundant broadcasts/renders — preserve that return value when touching it.

Message flow:

- **Client change** → `sendApiMessage` applies it locally immediately (optimistic, keeps faders responsive) → backend `handleApiMessage` → `deviceController.change()` **and** broadcast to all *other* sockets.
- **Mixer change** → device controller calls its listener → backend applies to state → broadcast to all sockets.
- On connect the backend sends a full `sync` (state + device config + mode); it also broadcasts a `heartbeat` every 2s, and the client reconnects if none arrives for 5s.

### Device controllers are plugins

[backend/src/services/device.ts](backend/src/services/device.ts) does `require('../devices/' + deviceName)` based on the config, and expects a default-exported class implementing `DeviceController` ([shared/types/device.d.ts](shared/types/device.d.ts)). The controller's `deviceConfig` (categories, counts, fader properties, colors, meters) is what drives the entire UI — the frontend renders purely from it, so adding a mixer means adding a directory under `backend/src/devices/`, not touching the frontend.

Existing controllers follow a consistent file split worth copying: `index.ts` (the controller class), `device-config.ts`, `connection.ts` (transport), `protocol.ts` (wire ↔ internal messages), `mapping.ts` / `converters.ts` (address and value translation), `sync.ts` (full state pull). See [dummy.ts](backend/src/devices/dummy.ts) for the minimal shape, `yamaha-01v96` for MIDI, `behringer-x32` for OSC. Each device directory has its own README with console-side setup — keep those updated.

### Frontend state is not React state

There is no Redux/Context store for mixer state. `frontend/src/api/state.ts` holds module-level singletons plus an [Emittery](https://github.com/sindresorhus/emittery) bus, and components subscribe to narrowly-scoped events:

- `stateEvents.emit(category + id)` — one event name per entry, so a fader change re-renders only that entry (`useEntryState`).
- Meters bypass React entirely: [`useMeter`](frontend/src/hooks/meter.ts) writes `style.transform` on a ref at ~10–20 Hz.
- `useDeviceConfiguration` / `useDeviceCategory` throw if read before the first `sync` — `ApiWrapper` gates the tree behind a loading screen, so anything below it can assume config exists.

UI composition: `MainContainer` → `Tabs` over categories → `CategoryControl` → `Tabs` over fader properties → `EntryControl` per channel.

### IEM mode

`mode: 'iem'` in the config produces a stripped-down musician-facing view: categories are filtered by their `modes` field, each entry shows a single selected send (chosen in a dialog, persisted to `localStorage` with a 24h TTL), and On/details controls are hidden. `useEffectiveRemoteMixerMode()` is the accessor to use — it applies the bypass (`?bypassIemMode=true`, automatic on localhost) that lets an engineer get the full UI from the same server. Never read `useRemoteMixerMode()` directly for rendering decisions.

## Conventions

- **Linaria/wyw-in-js** for styling (`css` / `styled` from `@linaria/*`) — it is extracted at build time, so template literals can only interpolate compile-time constants, never runtime props. Theme colors come from CSS variables generated in [frontend/src/ui/styles.ts](frontend/src/ui/styles.ts): use `primaryShade(2)`, `textShade(0)`, `baseline(3)` rather than raw values. Light/dark is a variable swap. Stylelint runs over `.ts`/`.tsx`.
- **React Compiler** is enabled (`babel-plugin-react-compiler`, must stay first in [babel.config.js](babel.config.js)); `react-hooks/exhaustive-deps` is an error.
- Cross-package imports go through `@remote-mixer/{types,utils,controls}`; importing `**/shared/src/**` paths directly is an eslint error. Frontend code additionally may not import Node builtins, and `@mdi/js` may only be imported in [frontend/src/ui/icons/index.ts](frontend/src/ui/icons/index.ts) (bundle size).
- Prettier: no semicolons, single quotes, no parens on single arrow args. `import/order` requires blank lines between import groups.
- TypeScript project references: `shared/controls` and `shared/utils` compile to `dist` and both apps consume that output (`shared/types` is types-only and resolves straight to source), which is why `yarn dev` runs compilers in watch mode alongside the servers.
