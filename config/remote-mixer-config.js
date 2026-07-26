// Use this file to override the default configuration
// found in /backend/src/config.ts
//
// This file is tracked in git. For machine-specific settings (which device
// is connected, its IP address, ...) create a gitignored
// remote-mixer-config.local.js next to it, which is merged over this one.

// @ts-check
/** @type {Partial<import('../backend/src/services/config').RemoteMixerConfiguration>} */
const userConfig = {
  // httpPort: 8080,
  // logLevel: 'debug',
  // device: 'dummy',

  // Mode for the mixer interface:
  // - 'iem': In-Ear Monitor mode - shows simplified controls for monitor mixing
  // - 'full': Full mode (default) - shows all available controls and features
  // mode: 'full',
}

module.exports = userConfig
