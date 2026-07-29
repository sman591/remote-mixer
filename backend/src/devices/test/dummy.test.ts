import { DeviceChangeMessage, DeviceMessage } from '@remote-mixer/types'

import DummyDeviceController from '../dummy'

import { expectValidEqConfiguration } from './eq-contract'

// the controller emits meters and random changes on intervals it never clears,
// which would keep the test runner alive and pollute the captured messages
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

function createController() {
  const messages: DeviceMessage[] = []
  const controller = new DummyDeviceController(message =>
    messages.push(message)
  )
  return { controller, messages }
}

describe('dummy device', () => {
  it('describes a valid EQ', () => {
    const { controller } = createController()
    const channels = controller.deviceConfig.categories.find(
      category => category.key === 'ch'
    )

    expect(channels).toBeDefined()
    expectValidEqConfiguration(channels!)
  })

  it('reports every parameter it describes when an entry is synced', () => {
    const { controller, messages } = createController()
    const channels = controller.deviceConfig.categories.find(
      category => category.key === 'ch'
    )!

    controller.syncEntry('ch', '1')

    const changes = messages.filter(
      (message): message is DeviceChangeMessage => message.type === 'change'
    )

    expect(changes.map(change => change.property).sort()).toEqual(
      channels.parameters!.map(parameter => parameter.key).sort()
    )

    for (const change of changes) {
      expect(change.category).toBe('ch')
      expect(change.id).toBe('1')
    }
  })

  it('reports values the parameters actually allow', () => {
    const { controller, messages } = createController()
    const parameters = controller.deviceConfig.categories.find(
      category => category.key === 'ch'
    )!.parameters!

    function isAllowed(change: DeviceChangeMessage): boolean {
      const parameter = parameters.find(it => it.key === change.property)
      if (!parameter) return false

      if (parameter.type === 'boolean') return typeof change.value === 'boolean'

      if (parameter.type === 'enum') {
        return parameter.options.some(option => option.value === change.value)
      }

      return (
        typeof change.value === 'number' &&
        change.value >= parameter.min &&
        change.value <= parameter.max
      )
    }

    // the values are random, so this is worth repeating
    const rejected: DeviceChangeMessage[] = []
    for (let run = 0; run < 20; run++) {
      messages.length = 0
      controller.syncEntry('ch', '1')

      rejected.push(
        ...messages
          .filter(
            (message): message is DeviceChangeMessage =>
              message.type === 'change'
          )
          .filter(change => !isAllowed(change))
      )
    }

    expect(rejected).toEqual([])
  })

  it('ignores entries of categories without parameters', () => {
    const { controller, messages } = createController()
    controller.syncEntry('sum', '1')
    expect(messages).toHaveLength(0)
  })
})
