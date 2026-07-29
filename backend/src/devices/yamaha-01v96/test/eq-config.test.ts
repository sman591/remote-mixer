import { DeviceEnumParameter } from '@remote-mixer/types'

import { expectValidEqConfiguration } from '../../test/eq-contract'
import { deviceConfig } from '../device-config'
import { eqConfiguration, eqMappingByProperty, eqParameters } from '../eq'

function parameter(key: string) {
  return eqParameters.find(it => it.key === key)
}

function enumOptionValues(key: string) {
  return (parameter(key) as DeviceEnumParameter).options.map(
    option => option.value
  )
}

describe('EQ configuration', () => {
  it('holds up as an EQ configuration', () => {
    for (const category of deviceConfig.categories) {
      expectValidEqConfiguration(category)
    }
  })

  it('can send every parameter to the device', () => {
    for (const { key } of eqParameters) {
      // the attenuator is not part of the EQ element, it is mapped separately
      if (key === 'att') continue
      expect(eqMappingByProperty.has(key)).toBe(true)
    }
  })

  it('offers the filter types of the low and high band only', () => {
    // 41 = L.SHELF, 42 = H.SHELF, 43 = LPF, 44 = HPF
    expect(enumOptionValues('eqLowQ').slice(-4)).toEqual([39, 40, 41, 44])
    expect(enumOptionValues('eqHiQ').slice(-4)).toEqual([39, 40, 42, 43])
    expect(enumOptionValues('eqLowMidQ').slice(-2)).toEqual([39, 40])
    expect(enumOptionValues('eqHiMidQ').slice(-2)).toEqual([39, 40])
  })

  it('limits the frequencies to the range the EQ accepts', () => {
    const values = enumOptionValues('eqLowF')
    expect(values[0]).toBe(5)
    expect(values[values.length - 1]).toBe(124)
  })

  it('is used by every category', () => {
    for (const category of deviceConfig.categories) {
      expect(category.eq).toBe(eqConfiguration)
      expect(category.parameters).toBe(eqParameters)
    }
  })
})
