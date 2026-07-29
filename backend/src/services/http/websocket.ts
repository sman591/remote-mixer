import { ApiInMessage, ApiOutMessage } from '@remote-mixer/types'
import ws from 'ws'
import { removeFromMutableArray, logger } from '@remote-mixer/utils'

import {
  getApiHeartBeatMessage,
  getSyncMessage,
  handleApiMessage,
} from '../api'

import { httpServer } from './express'

/** How often we send a heartbeat and ping every connected client. */
const heartBeatInterval = 2000

export const sockets: ws[] = []

/**
 * The sockets that have answered our most recent ping. A client that goes away
 * without closing cleanly — a musician carrying a phone out of Wi-Fi range —
 * leaves behind a socket that looks open indefinitely, so we drop any that
 * misses a round rather than broadcasting into a black hole.
 */
const responsiveSockets = new WeakSet<ws>()

function removeSocket(socket: ws) {
  logger.info('Socket disconnected')
  removeFromMutableArray(sockets, socket)
}

function sendSocketMessage(socket: ws, message: ApiOutMessage) {
  const messageString = JSON.stringify(message)
  socket.send(messageString)
}

/** Drops the clients that did not answer the previous ping, then pings again. */
export function checkSockets(): void {
  // terminating mutates the array, so iterate over a copy
  sockets.slice().forEach(socket => {
    if (!responsiveSockets.has(socket)) {
      logger.warn('Socket did not respond to ping, terminating')
      removeSocket(socket)
      socket.terminate()
      return
    }

    responsiveSockets.delete(socket)
    socket.ping()
  })
}

/** Takes a newly connected client into the broadcast set. */
export function registerSocket(socket: ws): void {
  logger.info('Socket connected')
  sockets.push(socket)
  // a fresh socket has not been pinged yet, so it starts out responsive
  responsiveSockets.add(socket)

  socket.on('message', (message: ApiInMessage) => {
    logger.trace('incoming message:', message)
    handleApiMessage(JSON.parse(message.toString()), socket)
  })

  socket.on('pong', () => responsiveSockets.add(socket))

  socket.on('close', () => removeSocket(socket))
  socket.on('error', () => removeSocket(socket))

  sendSocketMessage(socket, getSyncMessage())
}

export async function initWebSocketServer(): Promise<void> {
  const wsServer = new ws.Server({ server: httpServer, path: '/websocket' })
  wsServer.on('connection', registerSocket)

  setInterval(() => {
    checkSockets()
    broadcastToSockets(getApiHeartBeatMessage())
  }, heartBeatInterval)
}

export function broadcastToSockets(message: ApiOutMessage, exclude?: ws): void {
  if (!sockets.length) {
    return
  }
  logger.trace('broadcast WebSocket message', message)
  const messageString = JSON.stringify(message)
  sockets.forEach(socket => {
    // a socket that is closing throws on send, which would take down the rest
    // of the broadcast with it
    if (exclude !== socket && socket.readyState === socket.OPEN)
      socket.send(messageString)
  })
}
