/**
 * @jest-environment jsdom
 */
import { DeviceConfiguration } from '@remote-mixer/types'
import { fireEvent, render, screen } from '@testing-library/react'

import { sendApiMessage } from '../../../api/api-wrapper'
import { handleApiMessage } from '../../../api/state'
import { EntryDialogEq } from '../entry-dialog-eq'

jest.mock('../../../api/api-wrapper', () => ({
  sendApiMessage: jest.fn(),
}))

const sendApiMessageMock = sendApiMessage as jest.Mock

/** a device with the parts of an EQ that behave differently from each other */
const device: DeviceConfiguration = {
  categories: [
    {
      key: 'ch',
      label: 'Channels',
      count: 1,
      namePrefix: 'CH',
      parameters: [
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
        {
          key: 'eqLowQ',
          label: 'Q',
          type: 'enum',
          options: [
            { value: 0, label: '10.0', number: 10 },
            { value: 1, label: '1.0', number: 1 },
            { value: 41, label: 'L.SHELF', filter: 'lowShelf' },
            { value: 44, label: 'HPF', filter: 'highPass' },
          ],
        },
        {
          key: 'eqLowF',
          label: 'F',
          type: 'enum',
          options: [
            { value: 5, label: '21.2Hz', number: 21.2 },
            { value: 72, label: '1.00kHz', number: 1000 },
          ],
        },
        {
          key: 'eqLowG',
          label: 'G',
          type: 'number',
          min: -180,
          max: 180,
          step: 1,
          scale: 0.1,
          unit: 'dB',
        },
        { key: 'eqHpfOn', label: 'HPF', type: 'boolean' },
      ],
      eq: {
        label: 'EQ',
        on: 'eqOn',
        bands: [
          {
            key: 'low',
            label: 'LOW',
            gain: 'eqLowG',
            frequency: 'eqLowF',
            q: 'eqLowQ',
            on: 'eqHpfOn',
          },
        ],
        extraParameters: ['eqMode', 'att'],
      },
    },
  ],
}

function sync(entry: Record<string, unknown>) {
  handleApiMessage({
    type: 'sync',
    state: { categories: { ch: { '1': entry as never } }, meters: {} },
    device,
    mode: 'full',
  })
}

function press(element: HTMLElement) {
  if ('PointerEvent' in window) {
    fireEvent.pointerDown(element)
    fireEvent.pointerUp(element)
  } else {
    fireEvent.touchStart(element, { targetTouches: [{ clientX: 0 }] })
    fireEvent.touchEnd(element, { changedTouches: [{ clientX: 0 }] })
  }
}

beforeEach(() => {
  sendApiMessageMock.mockClear()
  sync({ eqOn: true, eqLowQ: 1, eqLowF: 72, eqLowG: 35, att: -120 })
})

describe('EntryDialogEq', () => {
  it('asks the backend for the parameters the full sync leaves out', () => {
    render(<EntryDialogEq category="ch" id="1" />)

    expect(sendApiMessageMock).toHaveBeenCalledWith({
      type: 'sync-entry',
      category: 'ch',
      id: '1',
    })
  })

  it('renders a control for every parameter the EQ references', () => {
    render(<EntryDialogEq category="ch" id="1" />)

    // the band and its three controls
    screen.getByText('LOW')
    screen.getByText('1.0')
    screen.getByText('1.00kHz')
    screen.getByText('+3.5')

    // the EQ on/off, the filter switch and the extra parameters
    screen.getByText('EQ')
    screen.getByText('HPF')
    screen.getByText('I')
    screen.getByText('II')
    screen.getByText('-12.0')
  })

  it('sends a change for the property the control belongs to', () => {
    render(<EntryDialogEq category="ch" id="1" />)

    press(screen.getByText('HPF'))
    expect(sendApiMessageMock).toHaveBeenCalledWith({
      type: 'change',
      category: 'ch',
      id: '1',
      property: 'eqHpfOn',
      value: true,
    })

    press(screen.getByText('II'))
    expect(sendApiMessageMock).toHaveBeenCalledWith({
      type: 'change',
      category: 'ch',
      id: '1',
      property: 'eqMode',
      value: 1,
    })

    press(screen.getByText('EQ'))
    expect(sendApiMessageMock).toHaveBeenCalledWith({
      type: 'change',
      category: 'ch',
      id: '1',
      property: 'eqOn',
      value: false,
    })
  })

  it('draws a curve', () => {
    const { container } = render(<EntryDialogEq category="ch" id="1" />)

    const paths = container.querySelectorAll('svg path')
    expect(paths.length).toBeGreaterThan(0)

    // the curve itself is the last path, and has to be a real line
    const curve = paths[paths.length - 1].getAttribute('d')
    expect(curve).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/)
    expect(curve).not.toMatch(/NaN/)
  })

  it('renders nothing for a category without an EQ', () => {
    handleApiMessage({
      type: 'sync',
      state: { categories: { sum: { '1': {} as never } }, meters: {} },
      device: {
        categories: [{ key: 'sum', label: 'Master', count: 1 }],
      },
      mode: 'full',
    })

    const { container } = render(<EntryDialogEq category="sum" id="1" />)
    expect(container.innerHTML).toBe('')
  })
})
