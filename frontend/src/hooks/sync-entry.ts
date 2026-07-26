import { useEffect } from 'react'

import { sendApiMessage } from '../api/api-wrapper'
import { stateEvents, syncEvent } from '../api/state'

/**
 * Requests the properties of an entry that the backend leaves out of the full
 * sync, for as long as the component using it is mounted.
 */
export function useSyncEntry(category: string, id: string): void {
  useEffect(() => {
    const request = () => sendApiMessage({ type: 'sync-entry', category, id })

    request()

    // the state is sent from scratch after a reconnect
    stateEvents.on(syncEvent, request)

    return () => {
      stateEvents.off(syncEvent, request)
    }
  }, [category, id])
}
