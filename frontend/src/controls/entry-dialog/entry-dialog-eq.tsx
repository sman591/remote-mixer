import { css } from '@linaria/core'
import {
  DeviceEqBand,
  DeviceParameter,
  StateCategoryEntry,
} from '@remote-mixer/types'

import { sendApiMessage } from '../../api/api-wrapper'
import { useDeviceCategory, useEntryState } from '../../api/state'
import { useSyncEntry } from '../../hooks/sync-entry'
import { EntryContainer } from '../../ui/containers/entry-container'
import { baseline } from '../../ui/styles'
import { getParameter, rendersAsButton } from '../../util/parameter'
import { ParameterControl } from '../parameter-control'

const header = css`
  display: flex;
  align-items: center;
  margin-bottom: ${baseline(2)};
`

const group = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 0 auto;
  margin-right: ${baseline(3)};
`

const groupLabel = css`
  margin-bottom: ${baseline()};
`

const groupControls = css`
  display: flex;
`

export interface EntryDialogEqProps {
  category: string
  id: string
}

export function EntryDialogEq({ category, id }: EntryDialogEqProps) {
  const categoryInfo = useDeviceCategory(category)
  const state = useEntryState(category, id) ?? ({} as StateCategoryEntry)

  useSyncEntry(category, id)

  const eq = categoryInfo.eq
  if (!eq) return null

  function change(property: string, value: number | boolean) {
    sendApiMessage({ type: 'change', category, id, property, value })
  }

  function control(parameter: DeviceParameter) {
    return (
      <ParameterControl
        key={parameter.key}
        parameter={parameter}
        value={state[parameter.key]}
        onChange={value => change(parameter.key, value)}
      />
    )
  }

  function controlByKey(key: string | undefined) {
    const parameter = key ? getParameter(categoryInfo, key) : undefined
    return parameter ? control(parameter) : null
  }

  const extraParameters = (eq.extraParameters ?? [])
    .map(key => getParameter(categoryInfo, key))
    .filter(parameter => parameter !== undefined)

  function bandGroup(band: DeviceEqBand) {
    return (
      <div key={band.key} className={group}>
        <div className={groupLabel}>{band.label}</div>
        <div className={groupControls}>
          {controlByKey(band.q)}
          {controlByKey(band.frequency)}
          {controlByKey(band.gain)}
        </div>
        {controlByKey(band.on)}
      </div>
    )
  }

  return (
    <div>
      <div className={header}>
        {controlByKey(eq.on)}
        {extraParameters.filter(rendersAsButton).map(control)}
      </div>
      <EntryContainer noWrap>
        {extraParameters
          .filter(parameter => !rendersAsButton(parameter))
          .map(parameter => (
            <div key={parameter.key} className={group}>
              <div className={groupLabel}>&nbsp;</div>
              <div className={groupControls}>{control(parameter)}</div>
            </div>
          ))}
        {eq.bands.map(bandGroup)}
      </EntryContainer>
    </div>
  )
}
