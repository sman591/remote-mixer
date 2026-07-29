/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'

import { ApiWrapper } from '../api-wrapper'

// the connection handling is what is under test here, not the state reducer
jest.mock('../state', () => ({ handleApiMessage: jest.fn() }))

/** A hand-driven stand-in for the browser WebSocket. */
class MockWebSocket {
  static instances: MockWebSocket[] = []

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3

  readyState = this.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }

  /** Completes the handshake, the way a reachable server would. */
  open() {
    this.readyState = this.OPEN
    this.onopen?.()
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  close() {
    this.readyState = this.CLOSED
    this.onclose?.()
  }

  send() {
    // the tests never assert on outgoing traffic
  }
}

/** The socket the wrapper is currently using. */
const currentSocket = () =>
  MockWebSocket.instances[MockWebSocket.instances.length - 1]

beforeEach(() => {
  jest.useFakeTimers()
  MockWebSocket.instances = []
  // @ts-expect-error -- the mock only implements the parts the wrapper uses
  global.WebSocket = MockWebSocket
})

afterEach(() => {
  jest.useRealTimers()
})

function renderWrapper() {
  const result = render(
    <ApiWrapper>
      <div>connected</div>
    </ApiWrapper>
  )
  act(() => {
    currentSocket().open()
  })
  return result
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms)
  })
}

it('opens a connection on mount', () => {
  renderWrapper()

  expect(MockWebSocket.instances).toHaveLength(1)
  expect(currentSocket().url).toContain('/websocket')
})

it('shows the children once the sync arrives', () => {
  const { queryByText } = renderWrapper()

  expect(queryByText('connected')).toBeNull()

  act(() => {
    currentSocket().receive({ type: 'sync' })
  })

  expect(queryByText('connected')).not.toBeNull()
})

it('stays connected while heartbeats keep arriving', () => {
  renderWrapper()

  for (let i = 0; i < 5; i++) {
    advance(2000)
    act(() => {
      currentSocket().receive({ type: 'heartbeat' })
    })
  }

  expect(MockWebSocket.instances).toHaveLength(1)
})

it('treats any traffic as a sign of life', () => {
  renderWrapper()

  for (let i = 0; i < 5; i++) {
    advance(2000)
    act(() => {
      currentSocket().receive({ type: 'meters', meters: {} })
    })
  }

  expect(MockWebSocket.instances).toHaveLength(1)
})

it('reconnects when the heartbeats stop', () => {
  renderWrapper()
  const stale = currentSocket()

  act(() => {
    stale.receive({ type: 'heartbeat' })
  })

  advance(6000)
  expect(stale.readyState).toBe(stale.CLOSED)

  advance(1000)
  expect(MockWebSocket.instances).toHaveLength(2)
})

// a socket that opens onto a server which then vanishes never delivers a single
// heartbeat, so the watchdog cannot wait for one before it starts counting
it('reconnects when no heartbeat ever arrives', () => {
  renderWrapper()

  advance(6000)
  advance(1000)

  expect(MockWebSocket.instances).toHaveLength(2)
})

it('hides the children again while reconnecting', () => {
  const { queryByText } = renderWrapper()

  act(() => {
    currentSocket().receive({ type: 'sync' })
  })
  expect(queryByText('connected')).not.toBeNull()

  advance(6000)

  expect(queryByText('connected')).toBeNull()
})

it('reconnects when the socket closes', () => {
  renderWrapper()

  act(() => {
    currentSocket().close()
  })
  advance(1000)

  expect(MockWebSocket.instances).toHaveLength(2)
})

// the browser can take minutes to notice a dropped TCP connection, so the close
// event for a socket the watchdog already gave up on arrives long afterwards
it('ignores a late close from a socket it already replaced', () => {
  renderWrapper()
  const stale = currentSocket()

  advance(6000)
  advance(1000)
  expect(MockWebSocket.instances).toHaveLength(2)

  act(() => {
    stale.onclose?.()
  })
  advance(2000)

  expect(MockWebSocket.instances).toHaveLength(2)
})

// likewise, a replaced socket must not go on feeding state into the app
it('ignores messages from a socket it already replaced', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { handleApiMessage } = require('../state')
  renderWrapper()
  const stale = currentSocket()

  advance(6000)
  advance(1000)
  ;(handleApiMessage as jest.Mock).mockClear()

  act(() => {
    stale.receive({ type: 'heartbeat' })
  })

  expect(handleApiMessage).not.toHaveBeenCalled()
})

it('does not reconnect after unmounting', () => {
  const { unmount } = renderWrapper()
  const original = currentSocket()

  act(() => {
    original.close()
  })
  unmount()
  advance(5000)

  expect(MockWebSocket.instances).toHaveLength(1)
})
