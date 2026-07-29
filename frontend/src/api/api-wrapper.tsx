import { ApiInMessage } from '@remote-mixer/types'
import { logger } from '@remote-mixer/utils'
import { JSX, useEffect, useState } from 'react'

import { LoadingScreen } from '../ui/main/loading-screen'

import { handleApiMessage } from './state'

/** How often the backend sends a heartbeat — mirrored from the server. */
const heartBeatInterval = 2000
/**
 * How long we tolerate silence before treating the connection as lost. The
 * backend sends a heartbeat every `heartBeatInterval`, so a couple of missed
 * beats means the socket is dead even when the browser still reports it open.
 */
const connectionTimeout = 5000
const reconnectDelay = 1000

let socket: WebSocket | undefined
/**
 * The last time we heard anything at all from the server. Seeded when the
 * socket opens, so a connection that never delivers a single heartbeat still
 * times out.
 */
let lastMessage: number | undefined

export function sendApiMessage(message: ApiInMessage) {
  logger.trace('Sending WebSocket message', message)
  if (!socket || socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(message))

  // we keep the UI more responsive by applying the new state straight away
  // instead of waiting for the response
  if (message.type === 'change') handleApiMessage(message)
}

export function ApiWrapper({ children }: { children: JSX.Element }) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    /**
     * Identifies the connection we currently care about. A socket we have given
     * up on can still fire events long afterwards — the browser only notices a
     * dropped TCP connection minutes later — and acting on those would apply
     * state from a dead link and stack a second reconnect on top of the live one.
     */
    let generation = 0

    /** Drops a socket for good, so none of its events can reach us again. */
    function discardSocket(dead: WebSocket) {
      dead.onopen = null
      dead.onmessage = null
      dead.onclose = null
      dead.onerror = null
      dead.close()
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimeout) return
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = undefined
        connectWebSocket()
      }, reconnectDelay)
    }

    /** Tears the current connection down and queues a fresh one. */
    function reconnect() {
      setConnected(false)
      lastMessage = undefined
      generation++
      if (socket) discardSocket(socket)
      socket = undefined
      scheduleReconnect()
    }

    function connectWebSocket() {
      if (disposed) return

      const thisGeneration = ++generation
      const thisSocket = new WebSocket(`ws://${self.location.host}/websocket`)
      socket = thisSocket
      // the attempt itself counts as a sign of life, so that a socket which
      // opens but never receives a heartbeat is still timed out below
      lastMessage = Date.now()

      thisSocket.onopen = () => {
        if (thisGeneration !== generation) return
        logger.info('WebSocket connection established')
        lastMessage = Date.now()
      }

      thisSocket.onmessage = event => {
        if (thisGeneration !== generation) return
        // any traffic proves the connection is alive, not just heartbeats
        lastMessage = Date.now()

        try {
          const message = JSON.parse(event.data)
          logger.trace('WebSocket message', message)
          handleApiMessage(message)
          if (message.type === 'sync') setConnected(true)
        } catch (e) {
          logger.error(
            'WebSocket message parse error',
            e,
            'message was:',
            event.data
          )
        }
      }

      thisSocket.onclose = () => {
        if (thisGeneration !== generation) return
        logger.warn('WebSocket connection was closed, reconnecting...')
        reconnect()
      }

      thisSocket.onerror = e => {
        if (thisGeneration !== generation) return
        logger.error('WebSocket error', e)
      }
    }

    if (!socket || socket.readyState !== socket.OPEN) connectWebSocket()

    const interval = setInterval(() => {
      if (!lastMessage || Date.now() - lastMessage < connectionTimeout) return

      logger.error('No heartbeat received, reconnecting...')
      reconnect()
    }, heartBeatInterval)

    return () => {
      disposed = true
      // stop any in-flight socket from reconnecting after we are gone
      generation++
      clearInterval(interval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (socket) {
        discardSocket(socket)
        socket = undefined
      }
      lastMessage = undefined
    }
  }, [])

  if (!connected) {
    return <LoadingScreen />
  }

  return children
}
