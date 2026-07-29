import { EventEmitter } from 'events'

import type ws from 'ws'

import {
  broadcastToSockets,
  checkSockets,
  registerSocket,
  sockets,
} from '../websocket'

// the socket bookkeeping is what is under test, not the device or state layers
jest.mock('../../api', () => ({
  getApiHeartBeatMessage: () => ({ type: 'heartbeat' }),
  getSyncMessage: () => ({ type: 'sync', state: {}, mode: 'full' }),
  handleApiMessage: jest.fn(),
}))

// importing the real one would create an HTTP server we never listen on
jest.mock('../express', () => ({ httpServer: {} }))

/** A hand-driven stand-in for a connected client. */
class MockSocket extends EventEmitter {
  readonly OPEN = 1

  readyState = 1
  ping = jest.fn()
  terminate = jest.fn(() => {
    this.readyState = 3
    this.emit('close')
  })
  send = jest.fn()

  /** Answers a ping, the way a client that is still there would. */
  pong() {
    this.emit('pong')
  }
}

function connect() {
  const socket = new MockSocket()
  registerSocket(socket as unknown as ws)
  return socket
}

beforeEach(() => {
  sockets.length = 0
})

it('sends the sync message to a new client', () => {
  const socket = connect()

  expect(sockets).toHaveLength(1)
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'sync', state: {}, mode: 'full' })
  )
})

it('drops a client that closed', () => {
  const socket = connect()

  socket.emit('close')

  expect(sockets).toHaveLength(0)
})

it('drops a client that errored', () => {
  const socket = connect()

  socket.emit('error')

  expect(sockets).toHaveLength(0)
})

it('pings the connected clients', () => {
  const socket = connect()

  checkSockets()

  expect(socket.ping).toHaveBeenCalled()
  expect(sockets).toHaveLength(1)
})

it('keeps a client that answers every ping', () => {
  const socket = connect()

  for (let i = 0; i < 5; i++) {
    checkSockets()
    socket.pong()
  }

  expect(socket.terminate).not.toHaveBeenCalled()
  expect(sockets).toHaveLength(1)
})

// a client that leaves the network without closing cleanly would otherwise sit
// in the broadcast set forever, looking open
it('terminates a client that stops answering', () => {
  const socket = connect()

  checkSockets() // pings
  checkSockets() // no pong came back

  expect(socket.terminate).toHaveBeenCalled()
  expect(sockets).toHaveLength(0)
})

it('keeps the responsive clients when dropping an unresponsive one', () => {
  const quiet = connect()
  const alive = connect()

  checkSockets()
  alive.pong()
  checkSockets()

  expect(quiet.terminate).toHaveBeenCalled()
  expect(alive.terminate).not.toHaveBeenCalled()
  expect(sockets).toEqual([alive])
})

it('broadcasts to every client but the excluded one', () => {
  const first = connect()
  const second = connect()
  first.send.mockClear()
  second.send.mockClear()

  broadcastToSockets({ type: 'heartbeat' }, second as unknown as ws)

  expect(first.send).toHaveBeenCalledWith(JSON.stringify({ type: 'heartbeat' }))
  expect(second.send).not.toHaveBeenCalled()
})

it('skips clients that are no longer open', () => {
  const socket = connect()
  socket.send.mockClear()
  socket.readyState = 2 // CLOSING

  broadcastToSockets({ type: 'heartbeat' })

  expect(socket.send).not.toHaveBeenCalled()
})
