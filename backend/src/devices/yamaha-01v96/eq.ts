import {
  DeviceEnumParameterOption,
  DeviceEqConfiguration,
  DeviceParameter,
} from '@remote-mixer/types'

import { DataConverter, intConverter, onConverter } from './converters'
import { eqFrequencyOptions, eqQOptions } from './eq-tables'

/**
 * The 4-band parametric EQ of the input, AUX, bus and stereo channels.
 *
 * All four have the same parameters, only the element of the message differs,
 * so this module derives both the device configuration and the mapping between
 * our property names and the Yamaha parameter names from one definition.
 *
 * Property names are the Yamaha names in lower camel case:
 * `kEQLowG` -> `eqLowG`, `kEQHPFOn` -> `eqHpfOn`.
 */

/** message element by category, the `kEQ...` parameters live in these */
export const eqElementByCategory: Record<string, string> = {
  ch: 'kInputEQ',
  aux: 'kAUXEQ',
  bus: 'kBusEQ',
  sum: 'kStereoEQ',
}

/** the attenuator is a separate element, but belongs to the EQ page */
export const attenuatorElementByCategory: Record<string, string> = {
  ch: 'kInputAttenuator',
  aux: 'kAUXAttenuator',
  bus: 'kBusAttenuator',
  sum: 'kStereoAttenuator',
}

export const attenuatorProperty = 'att'

function invert(elementByCategory: Record<string, string>) {
  return new Map(
    Object.entries(elementByCategory).map(([category, element]) => [
      element,
      category,
    ])
  )
}

export const eqCategoryByElement = invert(eqElementByCategory)
export const attenuatorCategoryByElement = invert(attenuatorElementByCategory)

interface EqBandFilterDefinition {
  property: string
  /** Yamaha parameter name without the `kEQ` prefix */
  name: string
  label: string
  /** Q values that select this filter instead of a numeric Q */
  qValues: number[]
}

interface EqBandDefinition {
  key: string
  label: string
  /** infix of the Yamaha parameter name, `Low` in `kEQLowG` */
  name: string
  /**
   * The low and high band double as a shelving filter and a pass filter,
   * selected through their Q value. The mid bands are always peaking.
   */
  filter?: EqBandFilterDefinition
}

const bands: EqBandDefinition[] = [
  {
    key: 'low',
    label: 'LOW',
    name: 'Low',
    filter: {
      property: 'eqHpfOn',
      name: 'HPFOn',
      label: 'HPF',
      // L.SHELF, HPF
      qValues: [41, 44],
    },
  },
  { key: 'lowMid', label: 'L-MID', name: 'LowMid' },
  { key: 'hiMid', label: 'H-MID', name: 'HiMid' },
  {
    key: 'hi',
    label: 'HIGH',
    name: 'Hi',
    filter: {
      property: 'eqLpfOn',
      name: 'LPFOn',
      label: 'LPF',
      // H.SHELF, LPF
      qValues: [42, 43],
    },
  },
]

/** the numeric Q values every band shares, 10.0 down to 0.10 */
const numericQValueMax = 40

function qOptions(band: EqBandDefinition): DeviceEnumParameterOption[] {
  const filterQValues = band.filter?.qValues ?? []
  return eqQOptions.filter(
    option =>
      option.value <= numericQValueMax || filterQValues.includes(option.value)
  )
}

/** the EQ frequencies stop short of the full table on both ends */
const frequencyValueMin = 5
const frequencyValueMax = 124

const frequencyOptions = eqFrequencyOptions.filter(
  option =>
    option.value >= frequencyValueMin && option.value <= frequencyValueMax
)

const gainParameter = {
  type: 'number',
  min: -180,
  max: 180,
  step: 1,
  scale: 0.1,
  unit: 'dB',
} as const

export const eqConfiguration: DeviceEqConfiguration = {
  label: 'EQ',
  on: 'eqOn',
  bands: bands.map(band => ({
    key: band.key,
    label: band.label,
    gain: `eq${band.name}G`,
    frequency: `eq${band.name}F`,
    q: `eq${band.name}Q`,
    on: band.filter?.property,
  })),
  extraParameters: ['eqMode', attenuatorProperty],
}

export const eqParameters: DeviceParameter[] = [
  { key: 'eqOn', label: 'EQ', type: 'boolean' },
  {
    key: 'eqMode',
    label: 'TYPE',
    type: 'enum',
    options: [
      { value: 0, label: 'I' },
      { value: 1, label: 'II' },
    ],
  },
  {
    key: attenuatorProperty,
    label: 'ATT',
    type: 'number',
    min: -960,
    max: 120,
    step: 1,
    scale: 0.1,
    unit: 'dB',
  },
  ...bands.flatMap((band): DeviceParameter[] => [
    {
      key: `eq${band.name}Q`,
      label: 'Q',
      type: 'enum',
      options: qOptions(band),
    },
    {
      key: `eq${band.name}F`,
      label: 'F',
      type: 'enum',
      options: frequencyOptions,
    },
    { key: `eq${band.name}G`, label: 'G', ...gainParameter },
    ...(band.filter
      ? [
          {
            key: band.filter.property,
            label: band.filter.label,
            type: 'boolean' as const,
          },
        ]
      : []),
  ]),
]

interface EqParameterMapping {
  /** Yamaha parameter name without the `kEQ` prefix */
  name: string
  converter: DataConverter
}

/** our property names to the Yamaha parameter names of the EQ element */
export const eqMappingByProperty = new Map<string, EqParameterMapping>([
  ['eqOn', { name: 'On', converter: onConverter }],
  ['eqMode', { name: 'Mode', converter: intConverter }],
  ...bands.flatMap((band): [string, EqParameterMapping][] => [
    [`eq${band.name}Q`, { name: `${band.name}Q`, converter: intConverter }],
    [`eq${band.name}F`, { name: `${band.name}F`, converter: intConverter }],
    [`eq${band.name}G`, { name: `${band.name}G`, converter: intConverter }],
    ...(band.filter
      ? ([
          [
            band.filter.property,
            { name: band.filter.name, converter: onConverter },
          ],
        ] as [string, EqParameterMapping][])
      : []),
  ]),
])

export const eqPropertyByParameterName = new Map<string, string>(
  [...eqMappingByProperty.entries()].map(([property, { name }]) => [
    name,
    property,
  ])
)
