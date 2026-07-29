import {
  DeviceConfigurationCategory,
  DeviceEnumParameter,
  DeviceEqBand,
  DeviceNumberParameter,
  StateCategoryEntry,
} from '@remote-mixer/types'

import {
  formatNumberParameterValue,
  getEnumParameterIndex,
  getEqBandSettings,
  getParameter,
  rendersAsButton,
} from '../parameter'

const gain: DeviceNumberParameter = {
  key: 'eqLowG',
  label: 'G',
  type: 'number',
  min: -180,
  max: 180,
  step: 1,
  scale: 0.1,
  unit: 'dB',
}

/**
 * The Q of an outer band, laid out like a real console: numeric values first,
 * then the filter types, with a gap in the values because the shelving and
 * pass filters of the other band sit in between.
 */
const q: DeviceEnumParameter = {
  key: 'eqLowQ',
  label: 'Q',
  type: 'enum',
  options: [
    { value: 0, label: '10.0', number: 10 },
    { value: 1, label: '1.0', number: 1 },
    { value: 41, label: 'L.SHELF', filter: 'lowShelf' },
    { value: 44, label: 'HPF', filter: 'highPass' },
  ],
}

const frequency: DeviceEnumParameter = {
  key: 'eqLowF',
  label: 'F',
  type: 'enum',
  options: [
    { value: 5, label: '21.2Hz', number: 21.2 },
    { value: 72, label: '1.00kHz', number: 1000 },
  ],
}

const filterOn = { key: 'eqHpfOn', label: 'HPF', type: 'boolean' } as const

const category: DeviceConfigurationCategory = {
  key: 'ch',
  label: 'Channels',
  count: 1,
  parameters: [gain, q, frequency, filterOn],
}

const band: DeviceEqBand = {
  key: 'low',
  label: 'LOW',
  gain: 'eqLowG',
  frequency: 'eqLowF',
  q: 'eqLowQ',
  on: 'eqHpfOn',
}

function state(values: Record<string, unknown>): StateCategoryEntry {
  return values as StateCategoryEntry
}

describe('getParameter', () => {
  it('finds a parameter by key', () => {
    expect(getParameter(category, 'eqLowQ')).toBe(q)
  })

  it('returns undefined for unknown keys', () => {
    expect(getParameter(category, 'nope')).toBeUndefined()
    expect(
      getParameter({ ...category, parameters: undefined }, 'eqLowQ')
    ).toBeUndefined()
  })
})

describe('rendersAsButton', () => {
  it('renders booleans and short enums as buttons', () => {
    expect(rendersAsButton(filterOn)).toBe(true)
    expect(
      rendersAsButton({
        ...q,
        options: [
          { value: 0, label: 'I' },
          { value: 1, label: 'II' },
        ],
      })
    ).toBe(true)
  })

  it('renders numbers and long enums as faders', () => {
    expect(rendersAsButton(gain)).toBe(false)
    expect(rendersAsButton(q)).toBe(false)
  })
})

describe('formatNumberParameterValue', () => {
  it('applies the scale with matching decimals', () => {
    expect(formatNumberParameterValue(gain, 35)).toBe('+3.5')
    expect(formatNumberParameterValue(gain, -180)).toBe('-18.0')
    expect(formatNumberParameterValue(gain, 180)).toBe('+18.0')
  })

  it('signs zero as neither positive nor negative', () => {
    expect(formatNumberParameterValue(gain, 0)).toBe('0.0')
  })

  it('leaves values that cannot be negative unsigned', () => {
    const level: DeviceNumberParameter = {
      key: 'value',
      label: 'CH',
      type: 'number',
      min: 0,
      max: 255,
    }
    expect(formatNumberParameterValue(level, 200)).toBe('200')
  })

  it('handles other scales', () => {
    expect(formatNumberParameterValue({ ...gain, scale: 0.01 }, 350)).toBe(
      '+3.50'
    )
    expect(formatNumberParameterValue({ ...gain, scale: 1 }, 35)).toBe('+35')
  })
})

describe('getEnumParameterIndex', () => {
  it('finds the index of a value, not the value itself', () => {
    // the gap between 1 and 41 is what makes these differ
    expect(getEnumParameterIndex(q, 41)).toBe(2)
    expect(getEnumParameterIndex(q, 44)).toBe(3)
  })

  it('falls back to the first option for unknown values', () => {
    expect(getEnumParameterIndex(q, undefined)).toBe(0)
    expect(getEnumParameterIndex(q, 999)).toBe(0)
  })

  it('round trips every option, so a fader sends back what it shows', () => {
    for (const parameter of [q, frequency]) {
      parameter.options.forEach((option, index) => {
        expect(getEnumParameterIndex(parameter, option.value)).toBe(index)
        expect(parameter.options[index].value).toBe(option.value)
      })
    }
  })
})

describe('getEqBandSettings', () => {
  it('reads a peaking band', () => {
    expect(
      getEqBandSettings(
        category,
        band,
        state({ eqLowQ: 1, eqLowF: 72, eqLowG: 35 })
      )
    ).toEqual({ type: 'peaking', frequency: 1000, q: 1, gain: 3.5 })
  })

  it('takes the filter type from the Q option', () => {
    expect(
      getEqBandSettings(
        category,
        band,
        state({ eqLowQ: 41, eqLowF: 72, eqLowG: 35 })
      )
    ).toMatchObject({ type: 'lowShelf' })
  })

  it('drops a pass filter that is switched off', () => {
    expect(
      getEqBandSettings(
        category,
        band,
        state({ eqLowQ: 44, eqLowF: 72, eqHpfOn: false })
      )
    ).toBeNull()

    expect(
      getEqBandSettings(
        category,
        band,
        state({ eqLowQ: 44, eqLowF: 72, eqHpfOn: true })
      )
    ).toMatchObject({ type: 'highPass' })
  })

  it('keeps a shelving band regardless of the pass filter switch', () => {
    expect(
      getEqBandSettings(
        category,
        band,
        state({ eqLowQ: 41, eqLowF: 72, eqHpfOn: false })
      )
    ).toMatchObject({ type: 'lowShelf' })
  })

  it('drops a band the device has not reported yet', () => {
    expect(getEqBandSettings(category, band, state({}))).toBeNull()
  })

  it('treats a missing gain as flat', () => {
    expect(
      getEqBandSettings(category, band, state({ eqLowQ: 1, eqLowF: 72 }))
    ).toMatchObject({ gain: 0 })
  })
})
