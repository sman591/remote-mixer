import { DeviceParameter } from '@remote-mixer/types'

import { Button } from '../ui/buttons/button'
import { Fader } from '../ui/controls/fader/fader'
import {
  formatNumberParameterValue,
  getEnumParameterIndex,
  rendersAsButton,
} from '../util/parameter'

export interface ParameterControlProps {
  parameter: DeviceParameter
  value: unknown
  onChange: (value: number | boolean) => void
}

export function ParameterControl({
  parameter,
  value,
  onChange,
}: ParameterControlProps) {
  if (parameter.type === 'boolean') {
    return (
      <Button onDown={() => onChange(!value)} active={!!value}>
        {parameter.label}
      </Button>
    )
  }

  const numberValue = typeof value === 'number' ? value : undefined

  if (parameter.type === 'enum') {
    const index = getEnumParameterIndex(parameter, numberValue)

    if (rendersAsButton(parameter)) {
      return parameter.options.map(option => (
        <Button
          key={option.value}
          onDown={() => onChange(option.value)}
          active={option.value === numberValue}
        >
          {option.label}
        </Button>
      ))
    }

    return (
      <Fader
        value={index}
        onChange={newIndex => onChange(parameter.options[newIndex].value)}
        max={parameter.options.length - 1}
        step={1}
        label={parameter.options[index].label}
        subLabel={parameter.label}
      />
    )
  }

  return (
    <Fader
      value={numberValue ?? 0}
      onChange={onChange}
      min={parameter.min}
      max={parameter.max}
      step={parameter.step}
      label={formatNumberParameterValue(parameter, numberValue ?? 0)}
      subLabel={parameter.label}
    />
  )
}
