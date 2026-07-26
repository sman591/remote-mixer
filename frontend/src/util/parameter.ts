import {
  DeviceConfigurationCategory,
  DeviceEnumParameter,
  DeviceEnumParameterOption,
  DeviceNumberParameter,
  DeviceParameter,
  DeviceEqBand,
  StateCategoryEntry,
} from '@remote-mixer/types'

import { EqBandSettings } from './eq-curve'

export function getParameter(
  category: DeviceConfigurationCategory,
  key: string
): DeviceParameter | undefined {
  return category.parameters?.find(parameter => parameter.key === key)
}

/**
 * Enums with few options are easier to use as a row of buttons than as a
 * fader you have to hit exactly.
 */
const maxButtonOptions = 3

/** whether `ParameterControl` renders the parameter as a button rather than a fader */
export function rendersAsButton(parameter: DeviceParameter): boolean {
  return (
    parameter.type === 'boolean' ||
    (parameter.type === 'enum' && parameter.options.length <= maxButtonOptions)
  )
}

function decimals(scale: number): number {
  return Math.max(0, Math.round(-Math.log10(scale)))
}

export function formatNumberParameterValue(
  parameter: DeviceNumberParameter,
  value: number
): string {
  const scale = parameter.scale ?? 1
  const scaled = value * scale
  const formatted = scaled.toFixed(decimals(scale))

  // values that can be negative are easier to read with an explicit sign
  return parameter.min < 0 && scaled > 0 ? `+${formatted}` : formatted
}

export function getEnumParameterIndex(
  parameter: DeviceEnumParameter,
  value: number | undefined
): number {
  const index = parameter.options.findIndex(option => option.value === value)
  return index === -1 ? 0 : index
}

function enumOption(
  category: DeviceConfigurationCategory,
  key: string,
  state: StateCategoryEntry
): DeviceEnumParameterOption | undefined {
  const parameter = getParameter(category, key)
  if (parameter?.type !== 'enum') return undefined
  return parameter.options[getEnumParameterIndex(parameter, state[key])]
}

/** Q the pass and shelving filters are drawn with, they have no Q of their own */
const defaultFilterQ = Math.SQRT1_2

/**
 * Translates what a device reports for a band into filter settings the curve
 * can be computed from. Returns null for bands that do not affect the curve,
 * either because the device has not reported them yet or because the band is
 * a pass filter that is switched off.
 */
export function getEqBandSettings(
  category: DeviceConfigurationCategory,
  band: DeviceEqBand,
  state: StateCategoryEntry
): EqBandSettings | null {
  const frequency = enumOption(category, band.frequency, state)?.number
  if (frequency === undefined) return null

  const q = enumOption(category, band.q, state)
  const type = q?.filter ?? 'peaking'

  // the pass filters have their own on/off, the rest of the band is always live
  const isPassFilter = type === 'highPass' || type === 'lowPass'
  if (isPassFilter && band.on && !state[band.on]) return null

  const gainParameter = getParameter(category, band.gain)
  const gainValue = state[band.gain]
  const gain =
    gainParameter?.type === 'number' && typeof gainValue === 'number'
      ? gainValue * (gainParameter.scale ?? 1)
      : 0

  return { type, frequency, q: q?.number ?? defaultFilterQ, gain }
}
