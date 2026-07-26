import {
  DeviceChangeMessage,
  DeviceConfiguration,
  DeviceController,
  DeviceEqConfiguration,
  DeviceMessageListener,
  DeviceMetersMessage,
  DeviceParameter,
} from '@remote-mixer/types'
import { logger } from '@remote-mixer/utils'

/** a plausible 4-band EQ, small enough to stay readable */
const bands = [
  { key: 'low', label: 'LOW', name: 'Low' },
  { key: 'lowMid', label: 'L-MID', name: 'LowMid' },
  { key: 'hiMid', label: 'H-MID', name: 'HiMid' },
  { key: 'hi', label: 'HIGH', name: 'Hi' },
]

const frequencies = [
  20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500,
  20000,
]

const qValues = [10, 5, 2.5, 1.4, 1, 0.7, 0.5, 0.25, 0.1]

function eqBandParameters(band: { name: string }): DeviceParameter[] {
  return [
    {
      key: `eq${band.name}Q`,
      label: 'Q',
      type: 'enum',
      options: qValues.map((q, index) => ({
        value: index,
        label: q.toFixed(q >= 1 ? 1 : 2),
        number: q,
      })),
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
  ]
}

const eqParameters: DeviceParameter[] = [
  { key: 'eqOn', label: 'EQ', type: 'boolean' },
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
  })),
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
