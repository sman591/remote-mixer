/**
 * @jest-environment jsdom
 */
import { DeviceParameter } from '@remote-mixer/types'
import { fireEvent, render, screen } from '@testing-library/react'

import { ParameterControl } from '../parameter-control'

const filterOn: DeviceParameter = {
  key: 'eqHpfOn',
  label: 'HPF',
  type: 'boolean',
}

const mode: DeviceParameter = {
  key: 'eqMode',
  label: 'TYPE',
  type: 'enum',
  options: [
    { value: 0, label: 'I' },
    { value: 1, label: 'II' },
  ],
}

const frequency: DeviceParameter = {
  key: 'eqLowF',
  label: 'F',
  type: 'enum',
  options: [
    { value: 5, label: '21.2Hz', number: 21.2 },
    { value: 72, label: '1.00kHz', number: 1000 },
    { value: 124, label: '20.0kHz', number: 20000 },
    { value: 125, label: '21.2kHz', number: 21200 },
  ],
}

const gain: DeviceParameter = {
  key: 'eqLowG',
  label: 'G',
  type: 'number',
  min: -180,
  max: 180,
  step: 1,
  scale: 0.1,
  unit: 'dB',
}

/** the controls listen through Touchable, which uses touch or pointer events */
function press(element: HTMLElement) {
  if ('PointerEvent' in window) {
    fireEvent.pointerDown(element)
    fireEvent.pointerUp(element)
  } else {
    fireEvent.touchStart(element, { targetTouches: [{ clientX: 0 }] })
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 0 }] })
  }
}

describe('ParameterControl', () => {
  it('toggles a boolean', () => {
    const onChange = jest.fn()
    render(
      <ParameterControl
        parameter={filterOn}
        value={false}
        onChange={onChange}
      />
    )

    press(screen.getByText('HPF'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles a boolean back off', () => {
    const onChange = jest.fn()
    render(
      <ParameterControl parameter={filterOn} value={true} onChange={onChange} />
    )

    press(screen.getByText('HPF'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('sends the value of a short enum option, not its index', () => {
    const onChange = jest.fn()
    render(<ParameterControl parameter={mode} value={0} onChange={onChange} />)

    press(screen.getByText('II'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('shows the label of the current option of a long enum', () => {
    render(
      <ParameterControl
        parameter={frequency}
        value={124}
        onChange={jest.fn()}
      />
    )

    screen.getByText('20.0kHz')
    screen.getByText('F')
  })

  it('falls back to the first option when the device has not reported one', () => {
    render(
      <ParameterControl
        parameter={frequency}
        value={undefined}
        onChange={jest.fn()}
      />
    )

    screen.getByText('21.2Hz')
  })

  it('shows a number scaled and signed', () => {
    render(
      <ParameterControl parameter={gain} value={35} onChange={jest.fn()} />
    )

    screen.getByText('+3.5')
    screen.getByText('G')
  })
})
