import { DeviceMessage } from '@remote-mixer/types'

import {
  convertMeterLevel,
  data2Fader,
  data2On,
  DataConverter,
  fader2Data,
  faderConverter,
  intConverter,
  onConverter,
} from './converters'
import {
  attenuatorCategoryByElement,
  attenuatorElementByCategory,
  attenuatorProperty,
  eqCategoryByElement,
  eqElementByCategory,
  eqMappingByProperty,
  eqPropertyByParameterName,
} from './eq'
import { MidiMessage, MidiMessageArgs } from './message'
import { bytesByMessageType } from './message-types'
import { changeName, handleNameMessage } from './names'
import {
  updateChannelPair,
  updateGroupActive,
  updateGroupChannelMembership,
} from './pairs-groups'
import { sync } from './sync'

interface SimpleMapping {
  type: string
  category: string
  property: string
  converter: DataConverter
}

const simpleMapping: SimpleMapping[] = [
  // channel
  {
    type: 'kInputFader/kFader',
    category: 'ch',
    property: 'value',
    converter: faderConverter,
  },
  {
    type: 'kInputChannelOn/kChannelOn',
    category: 'ch',
    property: 'on',
    converter: onConverter,
  },

  // aux
  {
    type: 'kAUXFader/kFader',
    category: 'aux',
    property: 'value',
    converter: faderConverter,
  },
  {
    type: 'kAUXChannelOn/kChannelOn',
    category: 'aux',
    property: 'on',
    converter: onConverter,
  },

  // bus
  {
    type: 'kBusFader/kFader',
    category: 'bus',
    property: 'value',
    converter: faderConverter,
  },
  {
    type: 'kBusChannelOn/kChannelOn',
    category: 'bus',
    property: 'on',
    converter: onConverter,
  },

  // sum
  {
    type: 'kStereoFader/kFader',
    category: 'sum',
    property: 'value',
    converter: faderConverter,
  },
  {
    type: 'kStereoChannelOn/kChannelOn',
    category: 'sum',
    property: 'on',
    converter: onConverter,
  },
]

const simpleMappingByType = new Map<string, SimpleMapping>(
  simpleMapping.map(mapping => [mapping.type, mapping])
)

function hashChange(category: string, property: string) {
  return `${category}/${property}`
}

const simpleMappingByChange = new Map<string, SimpleMapping>(
  simpleMapping.map(mapping => [
    hashChange(mapping.category, mapping.property),
    mapping,
  ])
)

interface MessageMapping {
  incoming(message: MidiMessage): DeviceMessage | true | null
  outgoing?(
    category: string,
    id: string,
    property: string,
    value?: unknown
  ): MidiMessageArgs | true | null
}

export const messageMapping: MessageMapping[] = [
  // simple mapping
  {
    incoming: message => {
      const matchingMapping =
        message.type && simpleMappingByType.get(message.type)
      if (!matchingMapping || !message.data) return null

      return {
        type: 'change',
        category: matchingMapping.category,
        id: String(message.channel + 1),
        property: matchingMapping.property,
        value: matchingMapping.converter.incoming(message.data),
      }
    },
    outgoing: (category, id, property, value) => {
      const matchingMapping = simpleMappingByChange.get(
        hashChange(category, property)
      )
      if (!matchingMapping) return null

      return {
        type: matchingMapping.type,
        channel: parseInt(id) - 1,
        data:
          value !== undefined
            ? matchingMapping.converter.outgoing(value)
            : undefined,
      }
    },
  },

  // aux send
  {
    incoming: message => {
      if (!message.type || !message.data) return null
      const aux = message.type.match(/^kInputAUX\/kAUX(\d+)Level$/)?.[1]
      if (!aux) return null

      return {
        type: 'change',
        category: 'ch',
        id: String(message.channel + 1),
        property: 'aux' + aux,
        value: data2Fader(message.data),
      }
    },

    outgoing: (category, id, property, value) => {
      if (category !== 'ch' || !property.startsWith('aux')) return null

      const aux = property.slice(3)
      const type = `kInputAUX/kAUX${aux}Level`
      const bytes = bytesByMessageType.get(type)
      if (!bytes) return null

      return {
        type,
        channel: parseInt(id) - 1,
        data: value !== undefined ? fader2Data(value) : undefined,
      }
    },
  },

  // EQ
  {
    incoming: message => {
      if (!message.type || !message.data) return null
      const match = message.type.match(/^(\w+)\/kEQ(\w+)$/)
      if (!match) return null

      const category = eqCategoryByElement.get(match[1])
      const property = eqPropertyByParameterName.get(match[2])
      const mapping = property && eqMappingByProperty.get(property)
      if (!category || !property || !mapping) return null

      return {
        type: 'change',
        category,
        id: String(message.channel + 1),
        property,
        value: mapping.converter.incoming(message.data),
      }
    },

    outgoing: (category, id, property, value) => {
      const element = eqElementByCategory[category]
      const mapping = eqMappingByProperty.get(property)
      if (!element || !mapping) return null

      return {
        type: `${element}/kEQ${mapping.name}`,
        channel: parseInt(id) - 1,
        data:
          value !== undefined ? mapping.converter.outgoing(value) : undefined,
      }
    },
  },

  // attenuator
  {
    incoming: message => {
      if (!message.type || !message.data) return null
      const match = message.type.match(/^(\w+)\/kAtt$/)
      if (!match) return null

      const category = attenuatorCategoryByElement.get(match[1])
      if (!category) return null

      return {
        type: 'change',
        category,
        id: String(message.channel + 1),
        property: attenuatorProperty,
        value: intConverter.incoming(message.data),
      }
    },

    outgoing: (category, id, property, value) => {
      if (property !== attenuatorProperty) return null

      const element = attenuatorElementByCategory[category]
      if (!element) return null

      return {
        type: `${element}/kAtt`,
        channel: parseInt(id) - 1,
        data: value !== undefined ? intConverter.outgoing(value) : undefined,
      }
    },
  },

  // meters
  {
    incoming: message => {
      if (!message.deviceSpecific || message.dataType !== 0x21 || !message.data)
        return null
      // echo messages from meter requests are accidentally
      // recognized as meter messages
      if (message.raw.length < 71) return null

      const outMessage: DeviceMessage = {
        type: 'meters',
        meters: {},
      }

      for (let channel = 1; channel <= 32; channel++) {
        outMessage.meters[`ch${channel}`] = convertMeterLevel(
          message.data[2 * (channel - 1)]
        )
      }

      return outMessage
    },
  },

  // names
  {
    incoming: handleNameMessage,

    outgoing: (category, id, property, value) => {
      if (property !== 'name') return null
      changeName(category, id, value as string)

      // Changing the name usually requires multiple messages, which the handler
      // does internally
      return true
    },
  },

  // pairs
  {
    incoming: message => {
      if (message.type !== 'kInputPair/kPair' || !message.data) return null
      updateChannelPair(String(message.channel + 1), data2On(message.data))
      return true
    },
  },

  // groups: members
  {
    incoming: message => {
      if (!message.type || !message.data) return null
      const groupMatch = message.type.match(
        /^kInputGroup\/kInGroup((?:Fader|Mute)\d)$/
      )
      if (!groupMatch) return null

      updateGroupChannelMembership(
        groupMatch[1],
        String(message.channel + 1),
        data2On(message.data)
      )
      return true
    },
  },

  // groups: active
  {
    incoming: message => {
      if (!message.type || !message.data) return null
      const groupMatch = message.type.match(
        /^kSceneInputGroup\/kIn(Fader|Mute)Group(\d)$/
      )
      if (!groupMatch) return null

      updateGroupActive(groupMatch[1] + groupMatch[2], data2On(message.data))
      return true
    },
  },

  // program change -> sync
  {
    incoming: message => {
      if (message.dataType === 0x10) {
        sync()
      }
      return null
    },
  },
]
