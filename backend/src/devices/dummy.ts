import {
  DeviceChangeMessage,
  DeviceConfiguration,
  DeviceController,
  DeviceEqConfiguration,
  DeviceEqFilterType,
  DeviceMessageListener,
  DeviceMetersMessage,
  DeviceParameter,
} from '@remote-mixer/types'
import { logger } from '@remote-mixer/utils'

/**
 * A plausible 4-band EQ, small enough to stay readable. It mirrors the shape
 * of a real console — the outer bands double as shelving and pass filters,
 * selected through the top end of their Q range — so the UI can be worked on
 * without a device attached.
 */
interface Band {
  key: string
  label: string
  name: string
  filter?: {
    property: string
    label: string
    type: DeviceEqFilterType
    shelfLabel: string
    shelfType: DeviceEqFilterType
  }
}

const bands: Band[] = [
  {
    key: 'low',
    label: 'LOW',
    name: 'Low',
    filter: {
      property: 'eqHpfOn',
      label: 'HPF',
      type: 'highPass',
      shelfLabel: 'L.SHELF',
      shelfType: 'lowShelf',
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
      label: 'LPF',
      type: 'lowPass',
      shelfLabel: 'H.SHELF',
      shelfType: 'highShelf',
    },
  },
]

const frequencies = [
  20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500,
  20000,
]

const qValues = [10, 5, 2.5, 1.4, 1, 0.7, 0.5, 0.25, 0.1]

function qOptions(band: Band) {
  const numeric = qValues.map((q, index) => ({
    value: index,
    label: q.toFixed(q >= 1 ? 1 : 2),
    number: q,
  }))

  if (!band.filter) return numeric

  // the filter types sit past the numeric range, as they do on a real console
  return [
    ...numeric,
    {
      value: qValues.length,
      label: band.filter.shelfLabel,
      filter: band.filter.shelfType,
    },
    {
      value: qValues.length + 1,
      label: band.filter.label,
      filter: band.filter.type,
    },
  ]
}

function eqBandParameters(band: Band): DeviceParameter[] {
  return [
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
      options: frequencies.map((hertz, index) => ({
        value: index,
        label: hertz >= 1000 ? `${hertz / 1000}kHz` : `${hertz}Hz`,
        number: hertz,
      })),
    },
    {
      key: `eq${band.name}G`,
      label: 'G',
      type: 'number',
      min: -180,
      max: 180,
      step: 1,
      scale: 0.1,
      unit: 'dB',
    },
    ...(band.filter
      ? [
          {
            key: band.filter.property,
            label: band.filter.label,
            type: 'boolean' as const,
          },
        ]
      : []),
  ]
}

const eqParameters: DeviceParameter[] = [
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
    key: 'att',
    label: 'ATT',
    type: 'number',
    min: -960,
    max: 120,
    step: 1,
    scale: 0.1,
    unit: 'dB',
  },
  ...bands.flatMap(eqBandParameters),
]

const eqConfiguration: DeviceEqConfiguration = {
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
  extraParameters: ['eqMode', 'att'],
}

export default class DummyDeviceController implements DeviceController {
  deviceConfig: DeviceConfiguration = {
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
          { key: 'aux2', label: 'AUX2' },
          { key: 'aux3', label: 'AUX3' },
          { key: 'aux4', label: 'AUX4' },
        ],
        parameters: eqParameters,
        eq: eqConfiguration,
        modes: ['full', 'iem'],
      },
      {
        key: 'aux',
        label: 'AUX',
        count: 4,
        namePrefix: 'AUX',
        modes: ['full'],
      },
      {
        key: 'sum',
        label: 'Master',
        count: 1,
        namePrefix: 'SUM',
        modes: ['full'],
      },
    ],
    colors: true,
  }

  constructor(private listener: DeviceMessageListener) {
    setInterval(() => {
      const message: DeviceMetersMessage = {
        type: 'meters',
        meters: {},
      }
      for (let i = 1; i <= 32; i++) {
        message.meters['ch' + i] = Math.round(Math.random() * 255)
      }

      this.listener(message)
    }, 1000)

    setInterval(() => {
      const message: DeviceChangeMessage = {
        type: 'change',
        category: 'ch',
        id: String(1 + Math.round(Math.random() * 31)),
        property: 'value',
        value: Math.round(Math.random() * 255),
      }

      this.listener(message)
    }, 1000)
  }

  change(category: string, id: string, property: string, value: string): void {
    logger.debug('[dummy] change', category, id, property, value)
  }

  syncEntry(category: string, id: string): void {
    logger.debug('[dummy] syncEntry', category, id)

    const categoryConfig = this.deviceConfig.categories.find(
      it => it.key === category
    )

    for (const parameter of categoryConfig?.parameters ?? []) {
      const value =
        parameter.type === 'boolean'
          ? Math.random() > 0.5
          : parameter.type === 'enum'
            ? parameter.options[
                Math.floor(Math.random() * parameter.options.length)
              ].value
            : Math.round(
                parameter.min + Math.random() * (parameter.max - parameter.min)
              )

      this.listener({
        type: 'change',
        category,
        id,
        property: parameter.key,
        value,
      })
    }
  }
}
