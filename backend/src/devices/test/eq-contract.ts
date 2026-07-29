import { DeviceConfigurationCategory } from '@remote-mixer/types'

/**
 * The contract between a device's `eq` and its `parameters`: the EQ names the
 * property keys, the parameters describe them, and the frontend renders from
 * both. A key on one side without the other renders nothing, silently, so
 * every device with an EQ is held to this.
 */
export function expectValidEqConfiguration(
  category: DeviceConfigurationCategory
): void {
  const { eq, parameters } = category
  expect(eq).toBeDefined()
  expect(parameters).toBeDefined()
  if (!eq || !parameters) return

  const describedKeys = new Set(parameters.map(parameter => parameter.key))

  const referencedKeys = [
    eq.on,
    ...(eq.extraParameters ?? []),
    ...eq.bands.flatMap(band => [band.gain, band.frequency, band.q, band.on]),
  ].filter(key => key !== undefined)

  for (const key of referencedKeys) {
    expect(describedKeys).toContain(key)
  }

  expect(eq.bands.length).toBeGreaterThan(0)

  // duplicate keys would make one of the parameters unreachable
  expect(describedKeys.size).toBe(parameters.length)

  for (const band of eq.bands) {
    const q = parameters.find(parameter => parameter.key === band.q)
    const frequency = parameters.find(
      parameter => parameter.key === band.frequency
    )
    const gain = parameters.find(parameter => parameter.key === band.gain)

    // the curve needs a Q it can read a filter type or a number from,
    // a frequency in Hz, and a gain it can scale to dB
    expect(q?.type).toBe('enum')
    expect(frequency?.type).toBe('enum')
    expect(gain?.type).toBe('number')

    if (frequency?.type === 'enum') {
      for (const option of frequency.options) {
        expect(typeof option.number).toBe('number')
      }
    }

    if (q?.type === 'enum') {
      for (const option of q.options) {
        // an option is either a bandwidth or a filter type, never neither
        expect(option.number !== undefined || option.filter !== undefined).toBe(
          true
        )
      }
    }
  }
}
