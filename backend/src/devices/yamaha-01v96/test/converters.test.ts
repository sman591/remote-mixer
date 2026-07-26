import { data2Int, int2Data } from '../converters'

describe('int2Data', () => {
  it('converts positive values', () => {
    expect(int2Data(0)).toEqual([0, 0, 0, 0])
    expect(int2Data(1)).toEqual([0, 0, 0, 1])
    expect(int2Data(127)).toEqual([0, 0, 0, 0x7f])
    // documented in the device TODO: channel EQ gain +18.0dB
    expect(int2Data(180)).toEqual([0, 0, 1, 0x34])
  })

  it('converts negative values', () => {
    expect(int2Data(-1)).toEqual([0x7f, 0x7f, 0x7f, 0x7f])
    // documented in the device TODO: channel EQ gain -18.0dB
    expect(int2Data(-180)).toEqual([0x7f, 0x7f, 0x7e, 0x4c])
  })

  it('falls back to zero for non-numbers', () => {
    expect(int2Data(undefined)).toEqual([0, 0, 0, 0])
    expect(int2Data('180')).toEqual([0, 0, 0, 0])
  })
})

describe('data2Int', () => {
  it('converts positive values', () => {
    expect(data2Int([0, 0, 0, 0])).toBe(0)
    expect(data2Int([0, 0, 0, 1])).toBe(1)
    expect(data2Int([0, 0, 1, 0x34])).toBe(180)
  })

  it('converts negative values', () => {
    expect(data2Int([0x7f, 0x7f, 0x7f, 0x7f])).toBe(-1)
    expect(data2Int([0x7f, 0x7f, 0x7e, 0x4c])).toBe(-180)
  })

  it('reverses int2Data', () => {
    for (const value of [-1000, -180, -1, 0, 1, 180, 1023, 16383]) {
      expect(data2Int(int2Data(value))).toBe(value)
    }
  })
})
