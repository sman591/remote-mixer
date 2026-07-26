import { delay } from '../../util/time'

import { sendMessage } from './connection'
import { deviceConfig } from './device-config'
import { requestName } from './names'
import { syncPairsAndGroups } from './pairs-groups'
import { getRequestMessage } from './protocol'

/**
 * Requests the parameters that the full sync leaves out — there are enough of
 * them per entry that syncing all of them up front would take the MIDI
 * connection several seconds, so they are requested when a client needs them.
 */
export async function syncEntry(category: string, id: string): Promise<void> {
  const categoryConfig = deviceConfig.categories.find(it => it.key === category)
  if (!categoryConfig?.parameters) return

  let messageCount = 0

  for (const { key } of categoryConfig.parameters) {
    const message = getRequestMessage(category, id, key)
    if (!message) continue

    sendMessage(message)
    messageCount++
    if (messageCount % 20 === 0) await delay(20)
  }
}

export async function sync(): Promise<void> {
  for (const category of deviceConfig.categories) {
    for (let id = 1; id <= category.count; id++) {
      const properties = [
        ...(category.faderProperties?.map(property => property.key) ?? []),
        ...(category.additionalProperties ?? []),
      ]

      if (!properties.includes('value')) properties.push('value')

      for (const property of properties) {
        const message = getRequestMessage(category.key, String(id), property)
        if (message) sendMessage(message)
      }

      // if we send all messages synchronously, we only get a part of them back
      await delay(20)

      requestName(category.key, String(id))

      await delay(20)
    }
  }

  await syncPairsAndGroups()
}
