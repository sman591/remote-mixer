# remote-mixer

Simple web-based interface to remote-control mixing consoles.

- 🎚 Compatible with different mixers
- 📱Responsive and mobile-friendly
- 🚀 Lightweight and performant
- 🕸️ Connect multiple clients
- 🌓 Light and dark mode

![Screenshot](./assets/screenshot.png)

> **🚧 This project is still Work in Progress! 🛠️**
>
> It should be stable enough to use at small events, but do not rely on it as your only means of mixing. **Use at your own risk**.
>
> I'm still not sure about the general direction for this project.
> Feel free to fork and experiment - PRs welcome.

> 💡 Also check out this project's companion app [vlight](https://github.com/kryops/vlight) for controlling DMX lights.

## Features

This project is not meant to control every little functionality of a certain mixing console; usually, there are better alternatives around for that. However, many of them

- only work for a single mixing console model
- only run on a single platform like Windows or iOS
- only support a single connected client at the same time
- are not mobile-friendly

This project tries to bridge these limitations by supporting basic controls for different mixing consoles, accessible from any device (mouse or touch), and multiple devices at once.

### Supported Mixing Consoles

- [Yamaha 01v96](./backend/src/devices/yamaha-01v96/README.md)
- [Behringer X32 / Midas M32](./backend/src/devices/behringer-x32/README.md)
- _Add your own ([see below](#adding-support-for-other-mixing-consoles))_

### Available Controls

- Faders
- On/Off buttons
- Names
- Meters
- Categories (tabs), 2 levels deep
- Colors

## Getting Started

### Using a Docker container (EXPERIMENTAL)

You can build and run this project through Docker (in a Linux container):

```
> ./docker-build.sh
> ./docker-run.sh
```

### Normal installation

Software needed:

- [Node.js](https://nodejs.org/en/)
- [Yarn](https://yarnpkg.com/lang/en/)

Build tools for native Node.js addons are also needed depending on your platform. If the installation fails, install the tools listed in the [node-gyp documentation](https://github.com/nodejs/node-gyp/blob/master/README.md#installation).

Install and setup:

```shellscript
> yarn
```

Start in production mode:

```shellscript
> yarn start
```

### Raspberry Pi deployment

For a Pi that travels to gigs and has to come up on its own, `pi-install.sh` sets up a permanent install that runs as a systemd service, separate from the checkout you develop in:

| Path | |
| --- | --- |
| `~/remote-mixer` | the dev checkout — `yarn dev` on ports 8000/8001, unchanged |
| `~/remote-mixer-prod` | the permanent install the service runs from, on port 8080 |

Run the setup once:

```shellscript
> ./pi-install.sh
```

It creates the install dir with its own `config/remote-mixer-config.local.js`, installs and enables `remote-mixer.service`, allows your user to start/stop/restart that one service without a password, and adds an nftables rule redirecting port 80 to the app so phones can use a bare hostname.

Then deploy the current working tree — including uncommitted changes, so a fix during a show needs no commit:

```shellscript
> yarn deploy
```

That builds in the dev checkout, stops the service, rsyncs everything except the install's own config into `~/remote-mixer-prod`, starts the service again and waits for it to answer. A failed build aborts before the running service is touched. Use `yarn deploy --skip-build` to re-sync without rebuilding.

Day to day:

```shellscript
> journalctl -u remote-mixer -f      # logs
> sudo systemctl restart remote-mixer
> cat ~/remote-mixer-prod/.deploy-info   # what is actually running
```

The mixer is then at `http://<hostname>.local` (port 80 redirects to 8080).

Notes:

- Port and device for the permanent install live in `~/remote-mixer-prod/config/remote-mixer-config.local.js`. `yarn deploy` never overwrites it — edit it there and restart the service.
- The 01v96 controller throws at startup if the console is not connected, so the service restarts every 10 seconds until it appears. Booting the Pi before powering on the desk is fine; it will come up within about 10 seconds of the desk being switched on.
- `yarn dev` and the service can run at the same time, but both open the console's MIDI port. Fine for a quick check, not something to do during a show.
- `./pi-install.sh --uninstall` removes the service, the sudoers rule and the port 80 redirect.

## Configuration

Edit the `config/remote-mixer-config.js` file. Instructions on how to configure each compatible mixing console are usually contained in the corresponding README in `backend/src/devices`.

```js
const userConfig = {
  httpPort: 8080,
  logLevel: 'info',
  device: 'dummy',
}

module.exports = userConfig
```

### Machine-specific configuration

`config/remote-mixer-config.js` is tracked in git, so editing it directly puts your local setup into version control and causes conflicts when you pull.

For anything specific to one machine or venue — which console is connected, its IP address, the log level you debug with — create a `config/remote-mixer-config.local.js` instead. It is gitignored, and its values are merged over the tracked file:

```js
/** @type {Partial<import('../backend/src/services/config').RemoteMixerConfiguration>} */
const localConfig = {
  device: {
    type: 'behringer-x32',
    options: { remoteAddress: '192.168.2.7' },
  },
}

module.exports = localConfig
```

The merge is shallow, so a `device` defined here replaces the tracked one entirely rather than merging its `options`.

## Development

Start in development mode with hot reloading:

```shellscript
> yarn dev
```

### Adding support for other mixing consoles

Code to control different mixing consoles is located in `backend/src/devices`. Each file (or `index.ts` in a sub-directory) needs to have a `DeviceController` as default export.

```ts
import { DeviceController, DeviceMessageListener } from '@remote-mixer/types'

export default class MyDeviceController implements DeviceController {
  deviceConfig = {
    categories: [
      {
        key: 'ch',
        label: 'Channels',
        count: 32,
        meters: true,
        namePrefix: 'CH',
        faderProperties: [
          { key: 'value', label: 'CH' },
          { key: 'aux1', label: 'AUX1' },
          // ...
        ],
      },
      {
        key: 'aux',
        label: 'AUX',
        count: 4,
        namePrefix: 'AUX',
      },
      // ...
    ],
  }

  constructor(private listener: DeviceMessageListener) {
    // connect, sync, and call this.listener() for any change
  }

  change(category: string, id: string, property: string, value: string): void {
    // send the change to the mixing console
  }
}
```

Checkout the [dummy device](./backend/src/devices/dummy.ts) for a minimal example that sends periodic random changes.

You can use existing device controllers as a baseline for similar consoles:

- [Yamaha 01v96](./backend/src/devices/yamaha-01v96/index.ts) for a MIDI controller
- [Behringer X32](./backend/src/devices/behringer-x32/index.ts) for an OSC controller
