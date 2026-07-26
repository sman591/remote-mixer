/**
 * Magnitude response of the EQ bands, so the curve can be drawn from the
 * values a device reports.
 *
 * The filters are the biquads of the "Audio EQ Cookbook" (Robert
 * Bristow-Johnson). A console's own filters are not exactly these — the 01v96
 * alone has two EQ types — so the curve is a faithful picture of the settings
 * rather than a measurement of the device.
 */

import { DeviceEqFilterType } from '@remote-mixer/types'

/** the filters are evaluated at a fixed rate, the curve stops well below it */
const sampleRate = 48000

export interface EqBandSettings {
  type: DeviceEqFilterType
  /** center or cutoff frequency in Hz */
  frequency: number
  q: number
  /** in dB, ignored by the pass filters */
  gain: number
}

interface Biquad {
  b0: number
  b1: number
  b2: number
  a0: number
  a1: number
  a2: number
}

function biquad({ type, frequency, q, gain }: EqBandSettings): Biquad {
  const w0 = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  const alpha = sin / (2 * q)
  const a = Math.pow(10, gain / 40)
  const sqrtA = Math.sqrt(a)

  switch (type) {
    case 'peaking':
      return {
        b0: 1 + alpha * a,
        b1: -2 * cos,
        b2: 1 - alpha * a,
        a0: 1 + alpha / a,
        a1: -2 * cos,
        a2: 1 - alpha / a,
      }

    case 'lowShelf':
      return {
        b0: a * (a + 1 - (a - 1) * cos + 2 * sqrtA * alpha),
        b1: 2 * a * (a - 1 - (a + 1) * cos),
        b2: a * (a + 1 - (a - 1) * cos - 2 * sqrtA * alpha),
        a0: a + 1 + (a - 1) * cos + 2 * sqrtA * alpha,
        a1: -2 * (a - 1 + (a + 1) * cos),
        a2: a + 1 + (a - 1) * cos - 2 * sqrtA * alpha,
      }

    case 'highShelf':
      return {
        b0: a * (a + 1 + (a - 1) * cos + 2 * sqrtA * alpha),
        b1: -2 * a * (a - 1 + (a + 1) * cos),
        b2: a * (a + 1 + (a - 1) * cos - 2 * sqrtA * alpha),
        a0: a + 1 - (a - 1) * cos + 2 * sqrtA * alpha,
        a1: 2 * (a - 1 - (a + 1) * cos),
        a2: a + 1 - (a - 1) * cos - 2 * sqrtA * alpha,
      }

    case 'highPass':
      return {
        b0: (1 + cos) / 2,
        b1: -(1 + cos),
        b2: (1 + cos) / 2,
        a0: 1 + alpha,
        a1: -2 * cos,
        a2: 1 - alpha,
      }

    case 'lowPass':
      return {
        b0: (1 - cos) / 2,
        b1: 1 - cos,
        b2: (1 - cos) / 2,
        a0: 1 + alpha,
        a1: -2 * cos,
        a2: 1 - alpha,
      }
  }
}

/** magnitude of a band at a frequency, in dB */
export function bandMagnitude(band: EqBandSettings, frequency: number): number {
  const { b0, b1, b2, a0, a1, a2 } = biquad(band)
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w)
  const sin = Math.sin(w)
  const cos2 = Math.cos(2 * w)
  const sin2 = Math.sin(2 * w)

  // H(e^jw), the negative exponents flipping the sign of the imaginary parts
  const numeratorReal = b0 + b1 * cos + b2 * cos2
  const numeratorImaginary = -(b1 * sin + b2 * sin2)
  const denominatorReal = a0 + a1 * cos + a2 * cos2
  const denominatorImaginary = -(a1 * sin + a2 * sin2)

  const numerator = Math.hypot(numeratorReal, numeratorImaginary)
  const denominator = Math.hypot(denominatorReal, denominatorImaginary)
  if (!denominator) return 0

  return 20 * Math.log10(numerator / denominator)
}

/** summed magnitude of all bands at a frequency, in dB */
export function curveMagnitude(
  bands: EqBandSettings[],
  frequency: number
): number {
  return bands.reduce((sum, band) => sum + bandMagnitude(band, frequency), 0)
}
