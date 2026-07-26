import { getChangeMessage, interpretIncomingMessage } from '../protocol'

jest.mock('../connection', () => ({
  connect: jest.fn(),
  sendMessage: jest.fn(),
}))

/**
 * Message layout, see message.ts:
 * f0 43 1n 3e | tt ee pp | cc | dd dd dd dd | f7
 */
const header = [0xf0, 0x43, 0x10, 0x3e, 0x7f, 0x01]
const end = 0xf7

describe('EQ change messages', () => {
  it('sends the channel EQ gain', () => {
    // kInputEQ/kEQLowG, -18.0dB
    expect(getChangeMessage('ch', '1', 'eqLowG', -180)).toEqual([
      ...header,
      0x20,
      0x03,
      0x00,
      0x7f,
      0x7f,
      0x7e,
      0x4c,
      end,
    ])

    // +18.0dB on channel 32
    expect(getChangeMessage('ch', '32', 'eqLowG', 180)).toEqual([
      ...header,
      0x20,
      0x03,
      0x1f,
      0x00,
      0x00,
      0x01,
      0x34,
      end,
    ])
  })

  it('sends the channel EQ on/off', () => {
    // kInputEQ/kEQOn
    expect(getChangeMessage('ch', '1', 'eqOn', true)).toEqual([
      ...header,
      0x20,
      0x0f,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01,
      end,
    ])
  })

  it('sends the band filter on/off', () => {
    // kInputEQ/kEQHPFOn
    expect(getChangeMessage('ch', '1', 'eqHpfOn', false)).toEqual([
      ...header,
      0x20,
      0x04,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      end,
    ])
  })

  it('uses the element of the category', () => {
    // kAUXEQ/kEQHiF on AUX 2
    expect(getChangeMessage('aux', '2', 'eqHiF', 96)).toEqual([
      ...header,
      0x3c,
      0x0c,
      0x01,
      0x00,
      0x00,
      0x00,
      0x60,
      end,
    ])

    // kBusEQ/kEQLowMidQ on bus 3
    expect(getChangeMessage('bus', '3', 'eqLowMidQ', 23)).toEqual([
      ...header,
      0x2e,
      0x05,
      0x02,
      0x00,
      0x00,
      0x00,
      0x17,
      end,
    ])

    // kStereoEQ/kEQMode
    expect(getChangeMessage('sum', '1', 'eqMode', 1)).toEqual([
      ...header,
      0x52,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x01,
      end,
    ])
  })

  it('sends the attenuator', () => {
    // kInputAttenuator/kAtt, -96.0dB
    expect(getChangeMessage('ch', '1', 'att', -960)).toEqual([
      ...header,
      0x1d,
      0x00,
      0x00,
      0x7f,
      0x7f,
      0x78,
      0x40,
      end,
    ])
  })
})

describe('EQ incoming messages', () => {
  it('interprets the channel EQ gain', () => {
    expect(
      interpretIncomingMessage([
        ...header,
        0x20,
        0x03,
        0x00,
        0x7f,
        0x7f,
        0x7e,
        0x4c,
        end,
      ])
    ).toEqual({
      type: 'change',
      category: 'ch',
      id: '1',
      property: 'eqLowG',
      value: -180,
    })
  })

  it('interprets the attenuator', () => {
    expect(
      interpretIncomingMessage([
        ...header,
        0x1d,
        0x00,
        0x07,
        0x00,
        0x00,
        0x00,
        0x78,
        end,
      ])
    ).toEqual({
      type: 'change',
      category: 'ch',
      id: '8',
      property: 'att',
      value: 120,
    })
  })

  it('interprets the AUX EQ', () => {
    expect(
      interpretIncomingMessage([
        ...header,
        0x3c,
        0x0e,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        end,
      ])
    ).toEqual({
      type: 'change',
      category: 'aux',
      id: '2',
      property: 'eqLpfOn',
      value: true,
    })
  })
})
