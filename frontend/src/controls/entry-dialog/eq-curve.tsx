import { css } from '@linaria/core'
import {
  DeviceConfigurationCategory,
  DeviceEqConfiguration,
  StateCategoryEntry,
} from '@remote-mixer/types'

import { baseline, iconShade, primaryShade, textShade } from '../../ui/styles'
import { curveMagnitude } from '../../util/eq-curve'
import { getEqBandSettings } from '../../util/parameter'

/** the curve is drawn in its own coordinate system and scaled by the browser */
const width = 600
const height = 180

const minFrequency = 20
const maxFrequency = 20000

/** the vertical range in dB, a bit wider than a band can reach on its own */
const maxGain = 24

/** enough points that the steepest filter still looks smooth */
const points = 240

const frequencyLines = [100, 1000, 10000]
const gainLines = [-12, 12]

/**
 * The plot is stretched to the width of the dialog, so the labels are HTML
 * positioned over it rather than SVG text, which the stretching would distort.
 */
const container = css`
  position: relative;
  height: ${baseline(40)};
  margin-bottom: ${baseline(2)};
`

const plot = css`
  width: 100%;
  height: 100%;
  display: block;
`

const grid = css`
  stroke: ${iconShade(3)};
  stroke-width: 1;
  fill: none;
`

const zeroLine = css`
  stroke: ${iconShade(2)};
  stroke-width: 1;
  fill: none;
`

const curve = css`
  stroke: ${primaryShade(0)};
  stroke-width: 2;
  fill: none;
  stroke-linejoin: round;
`

const curveInactive = css`
  stroke: ${iconShade(2)};
`

const label = css`
  position: absolute;
  color: ${textShade(2)};
  font-size: 0.7rem;
  pointer-events: none;
`

function frequencyAt(fraction: number): number {
  return minFrequency * (maxFrequency / minFrequency) ** fraction
}

function xOf(frequency: number): number {
  return (
    (Math.log(frequency / minFrequency) /
      Math.log(maxFrequency / minFrequency)) *
    width
  )
}

function yOf(gain: number): number {
  return height / 2 - (gain / maxGain) * (height / 2)
}

function formatFrequency(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency)
}

export interface EqCurveProps {
  category: DeviceConfigurationCategory
  eq: DeviceEqConfiguration
  state: StateCategoryEntry
}

export function EqCurve({ category, eq, state }: EqCurveProps) {
  const bands = eq.bands
    .map(band => getEqBandSettings(category, band, state))
    .filter(band => band !== null)

  const path = Array.from({ length: points + 1 }, (_, index) => {
    const frequency = frequencyAt(index / points)
    const y = yOf(curveMagnitude(bands, frequency))
    return `${index === 0 ? 'M' : 'L'}${((index / points) * width).toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  // an EQ that is switched off still shows its curve, just not as the signal
  const isOn = !eq.on || !!state[eq.on]

  return (
    <div className={container}>
      <svg
        className={plot}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {frequencyLines.map(frequency => (
          <path
            key={frequency}
            className={grid}
            d={`M${xOf(frequency)} 0 L${xOf(frequency)} ${height}`}
          />
        ))}
        {gainLines.map(gain => (
          <path
            key={gain}
            className={grid}
            d={`M0 ${yOf(gain)} L${width} ${yOf(gain)}`}
          />
        ))}
        <path className={zeroLine} d={`M0 ${yOf(0)} L${width} ${yOf(0)}`} />
        <path className={isOn ? curve : `${curve} ${curveInactive}`} d={path} />
      </svg>

      {frequencyLines.map(frequency => (
        <span
          key={frequency}
          className={label}
          style={{
            left: `${(xOf(frequency) / width) * 100}%`,
            bottom: 0,
            marginLeft: baseline(),
          }}
        >
          {formatFrequency(frequency)}
        </span>
      ))}
      {gainLines.map(gain => (
        <span
          key={gain}
          className={label}
          style={{ left: 0, top: `${(yOf(gain) / height) * 100}%` }}
        >
          {gain > 0 ? `+${gain}` : gain}
        </span>
      ))}
    </div>
  )
}
