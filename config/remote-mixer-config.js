// Use this file to override the default configuration
// found in /backend/src/config.ts

// @ts-check
/** @type {Partial<import('../backend/src/services/config').RemoteMixerConfiguration>} */
const userConfig = {
  // httpPort: 8080,
  logLevel: 'debug',
  device: 'yamaha-01v96',
  
  // Mode for the mixer interface:
  // - 'iem': In-Ear Monitor mode - shows simplified controls for monitor mixing
  // - 'full': Full mode (default) - shows all available controls and features
  // mode: 'full',
}

module.exports = userConfig
