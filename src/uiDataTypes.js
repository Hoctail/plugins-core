import { types } from 'mobx-state-tree'
import { ensureGlobal } from './ensureGlobal.js'

const uiDataTypes = ensureGlobal('uiDataTypes', {})

export const UiDataType = ensureGlobal('UiDataType', {
  register: (name, storageType, inPersistentSchemasOnly,
    defVal, iconName, typePlugin, settingsPlugin, tooltip, focus) => {
    uiDataTypes[name] = {
      name,
      storageType,
      inPersistentSchemasOnly,
      defaultValue: defVal,
      iconName,
      typePlugin,
      tooltip,
      focus,
      settingsPlugin,
    }
  },
  list: () => {
    return Object.values(uiDataTypes)
  },
  create: (name, props) => {
    try {
      return uiDataTypes[name].typePlugin.create(props)
    } catch (e) {
      console.error(`Error creating '${name}' uiDataType component`)
      throw e
    }
  },
  get: name => {
    return uiDataTypes[name] || uiDataTypes.singleLine
  },
  type: () => {
    return types.late(
      () => types.enumeration('DataType', Object.keys(uiDataTypes)),
    )
  },
  embedInTooltip: (name) => uiDataTypes[name].tooltip,
  model: () => {
    return types.late(() => types.union.apply(
      types,
      Object.values(uiDataTypes).map(type => type.typePlugin.Model),
    ))
  },
  settingsPlugin: name => uiDataTypes[name].settingsPlugin,
})

export function registerUiDataType (name, storageType, inPersistentSchemasOnly,
  defVal, iconName, typePlugin, settingsPlugin, tooltip, focus) {
  UiDataType.register(...arguments)
}
