import { ApiChangeMessage, ApiMetersMessage, RemoteMixerMode } from './api'

export type DeviceChangeMessage = ApiChangeMessage
export type DeviceMetersMessage = ApiMetersMessage
export type DeviceMessage = DeviceChangeMessage | DeviceMetersMessage

export type DeviceMessageListener = (message: DeviceMessage) => void

export interface FaderProperty {
  key: string
  label: string
}

export interface DeviceParameterBase {
  key: string
  label: string
}

export interface DeviceBooleanParameter extends DeviceParameterBase {
  type: 'boolean'
}

export interface DeviceNumberParameter extends DeviceParameterBase {
  type: 'number'
  min: number
  max: number
  step?: number
  /** displayed value = value * scale */
  scale?: number
  unit?: string
}

export interface DeviceEnumParameterOption {
  value: number
  label: string
  /**
   * Numeric equivalent of the option, for options that represent a number
   * (a frequency in Hz, a Q factor). Used to visualize the value —
   * options that are not numeric (a filter type) leave this unset.
   */
  number?: number
}

export interface DeviceEnumParameter extends DeviceParameterBase {
  type: 'enum'
  options: DeviceEnumParameterOption[]
}

/**
 * A property of a category entry that is not a fader — the device controller
 * describes its range so the frontend can render a control for it.
 */
export type DeviceParameter =
  | DeviceBooleanParameter
  | DeviceNumberParameter
  | DeviceEnumParameter

export interface DeviceEqBand {
  key: string
  label: string
  /** parameter keys of the band */
  gain: string
  frequency: string
  q: string
  /** parameter key of the band's filter on/off, for shelving/pass bands */
  on?: string
}

/**
 * A view over the category's `parameters` that describes them as an equalizer,
 * so the frontend can render an EQ instead of a list of controls.
 */
export interface DeviceEqConfiguration {
  label: string
  /** parameter key of the EQ on/off */
  on?: string
  bands: DeviceEqBand[]
  /** parameter keys to show alongside the bands */
  extraParameters?: string[]
}

export interface DeviceConfigurationCategory {
  key: string
  label: string
  count: number
  namePrefix?: string
  meters?: boolean
  faderProperties?: FaderProperty[]
  additionalProperties?: string[]
  /**
   * Properties that are not faders, with the range needed to render a control.
   * Unlike `faderProperties` and `additionalProperties`, these are not part of
   * the initial sync — they are requested per entry via `syncEntry`.
   */
  parameters?: DeviceParameter[]
  eq?: DeviceEqConfiguration
  /**
   * Optional modes in which this category should be visible.
   * If not specified, the category is visible in all modes.
   * - 'iem': Only show in In-Ear Monitor mode
   * - 'full': Only show in Full mode
   */
  modes?: RemoteMixerMode[]
}

export interface DeviceConfiguration {
  categories: DeviceConfigurationCategory[]
  colors?: boolean | string[]
}

export interface DeviceController {
  deviceConfig: DeviceConfiguration
  change(category: string, id: string, property: string, value: unknown): void
  sync?(): void
  /** Synchronizes the properties that the full sync leaves out */
  syncEntry?(category: string, id: string): void
}

export interface DeviceControllerConstructor {
  new (listener: DeviceMessageListener, options?: any): DeviceController
}
