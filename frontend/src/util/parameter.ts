import {
  DeviceConfigurationCategory,
  DeviceEnumParameter,
  DeviceNumberParameter,
  DeviceParameter,
} from '@remote-mixer/types'

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
