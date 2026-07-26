import { existsSync } from 'fs'
import { join } from 'path'

import { RemoteMixerMode } from '@remote-mixer/types'
import { LogLevel } from '@remote-mixer/utils'

import { isDevelopment } from './env'

export interface RemoteMixerConfiguration {
  /** HTTP port the server is opened on. Defaults to 8000 */
  httpPort: number

  /** Level for logging. Defaults to info in production, debug in development */
  logLevel: LogLevel | `${LogLevel}`

  /**
   * Mixing console device controller to load.
   * Refer to the README of the device controller for configuration options
   */
  device: string | { type: string; options: any }

  /**
   * Mode for the mixer interface.
   * - 'iem': In-Ear Monitor mode - shows simplified controls for monitor mixing
   * - 'full': Full mode - shows all available controls and features
   * Defaults to 'full'
   */
  mode: RemoteMixerMode
}

export const configDirectoryPath = join(__dirname, '../../../config')

function loadConfigFile(name: string): Partial<RemoteMixerConfiguration> {
  const path = join(configDirectoryPath, name)
  if (!existsSync(`${path}.js`)) return {}
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path)
}

/**
 * The tracked `remote-mixer-config.js` holds defaults shared by everyone,
 * `remote-mixer-config.local.js` is gitignored and holds machine-specific
 * overrides (which device is connected, its IP address, ...).
 *
 * Note this is a shallow merge: a local `device` replaces the tracked one
 * entirely instead of merging its `options`.
 */
const userConfig: Partial<RemoteMixerConfiguration> = {
  ...loadConfigFile('remote-mixer-config'),
  ...loadConfigFile('remote-mixer-config.local'),
}

function c<T extends keyof RemoteMixerConfiguration>(
  key: T,
  defaultValue: RemoteMixerConfiguration[T]
): RemoteMixerConfiguration[T] {
  const userValue = userConfig[key] as RemoteMixerConfiguration[T] | undefined
  return userValue !== undefined ? userValue! : defaultValue
}

// technical config
export const httpPort = c('httpPort', 8000)
export const logLevel = c(
  'logLevel',
  isDevelopment ? LogLevel.Debug : LogLevel.Info
) as LogLevel
export const device = c('device', 'dummy')
export const mode = c('mode', 'full')
