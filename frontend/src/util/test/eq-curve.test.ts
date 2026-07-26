import { bandMagnitude, curveMagnitude, EqBandSettings } from '../eq-curve'

const peaking: EqBandSettings = {
  type: 'peaking',
  frequency: 1000,
  q: 1,
  gain: 12,
}

describe('bandMagnitude', () => {
  it('applies the full gain at the center frequency', () => {
    expect(bandMagnitude(peaking, 1000)).toBeCloseTo(12, 1)
    expect(bandMagnitude({ ...peaking, gain: -12 }, 1000)).toBeCloseTo(-12, 1)
  })

  it('leaves distant frequencies alone', () => {
    expect(bandMagnitude(peaking, 20)).toBeCloseTo(0, 1)
    expect(bandMagnitude(peaking, 18000)).toBeCloseTo(0, 1)
  })

  it('is flat at zero gain', () => {
    for (const frequency of [20, 100, 1000, 10000]) {
      expect(bandMagnitude({ ...peaking, gain: 0 }, frequency)).toBeCloseTo(
        0,
        6
      )
    }
  })

  it('narrows as Q rises', () => {
    const wide = bandMagnitude({ ...peaking, q: 0.5 }, 700)
    const narrow = bandMagnitude({ ...peaking, q: 8 }, 700)
    expect(wide).toBeGreaterThan(narrow)
  })

  it('passes and rejects on the right sides of a high pass', () => {
    const highPass: EqBandSettings = {
      type: 'highPass',
      frequency: 1000,
      q: 0.707,
      gain: 0,
    }

    // -3dB at the cutoff, rejecting below it, passing above
    expect(bandMagnitude(highPass, 1000)).toBeCloseTo(-3, 0)
    expect(bandMagnitude(highPass, 100)).toBeLessThan(-30)
    expect(bandMagnitude(highPass, 10000)).toBeCloseTo(0, 1)
  })

  it('passes and rejects on the right sides of a low pass', () => {
    const lowPass: EqBandSettings = {
      type: 'lowPass',
      frequency: 1000,
      q: 0.707,
      gain: 0,
    }

    expect(bandMagnitude(lowPass, 1000)).toBeCloseTo(-3, 0)
    expect(bandMagnitude(lowPass, 100)).toBeCloseTo(0, 1)
    expect(bandMagnitude(lowPass, 10000)).toBeLessThan(-30)
  })

  it('shelves below and above the corner', () => {
    const lowShelf: EqBandSettings = {
      type: 'lowShelf',
      frequency: 1000,
      q: 0.707,
      gain: 12,
    }

    expect(bandMagnitude(lowShelf, 50)).toBeCloseTo(12, 0)
    expect(bandMagnitude(lowShelf, 15000)).toBeCloseTo(0, 0)

    const highShelf: EqBandSettings = { ...lowShelf, type: 'highShelf' }

    expect(bandMagnitude(highShelf, 50)).toBeCloseTo(0, 0)
    expect(bandMagnitude(highShelf, 15000)).toBeCloseTo(12, 0)
  })
})

describe('curveMagnitude', () => {
  it('sums the bands', () => {
    const other: EqBandSettings = { ...peaking, frequency: 4000, gain: 6 }

    expect(curveMagnitude([peaking, other], 1000)).toBeCloseTo(
      bandMagnitude(peaking, 1000) + bandMagnitude(other, 1000),
      6
    )
  })

  it('is flat without bands', () => {
    expect(curveMagnitude([], 1000)).toBe(0)
  })
})
