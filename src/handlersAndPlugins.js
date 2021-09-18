/**
 * @module plugins-base
*/

/**
 * @public
 * @namespace module:plugins-base
*/

import { keys } from 'mobx'
import { types, resolveIdentifier } from 'mobx-state-tree'
import { ensureGlobal } from './ensureGlobal.js'

/**
 * All the plugins registered in (by) application, by `registerPlugin`
 * @public
 * @static
*/
export const plugins  = ensureGlobal('plugins', {})

export const Plugins = ensureGlobal('Plugins', {
  list: () => Object.values(plugins),
  dict: () => plugins,
  pluginTypeAny: () => {
    if (!Object.keys(plugins).length) {
      throw new Error('No registered plugins')
    }
    return types.union.apply(types,
      Object.values(plugins).map(plugin => plugin.Model),
    )
  },
  get: name => {
    try {
      return plugins[name]
    } catch {
      throw new Error(`Can't locate plugins of type: '${name}'`)
    }
  },
  register: plugin => {
    const { name, handlers: pluginHandlers, deps } = plugin
    // register plugin's deps plugins described in section .register([])
    if (deps && deps.length) {
      deps.forEach(dependencyPlugin => {
        registerPlugin(dependencyPlugin)
      })
    }
    if (pluginHandlers) setUiHandlers(name, pluginHandlers)
    plugins[name] = plugin
  },
})

export function registerPlugin (plugin) {
  Plugins.register(plugin)
}

const HandlerModel = ensureGlobal('HandlerModel', types.model('HandlerModel', {
  funcId: types.identifier,
}).views(self => {
  // save function here for quick handler resolution
  let _func
  function assignFunction (func) {
    _func = func
  }
  function func () {
    return _func
  }
  return { assignFunction, func }
}).views(self => ({
  get alias () {
    return self.funcId
  },
  get id () {
    return self.funcId
  },
})))

export const HandlersModel = ensureGlobal('HandlersModel', types.model('HandlersModel', {
  handlers: types.map(HandlerModel),
}).actions(self => ({
  addHandler (alias, func) {
    const handlerNode = HandlerModel.create({
      funcId: alias,
    })
    // save func in context
    handlerNode.assignFunction(func)
    self.handlers.put(handlerNode)
  },
})).views(self => ({
  handlerNode (alias) {
    return self.handlers.get(alias)
  },
  pluginHandlersNames (pluginName) {
    const key = `${pluginName}.`
    return keys(self.handlers).filter(alias => alias.startsWith(key))
  },
})))

const handlersStore = ensureGlobal('handlersStore', HandlersModel.create())

export const HandlerReference = ensureGlobal('HandlerReference', types.reference(HandlerModel, {
  get (identifier, parent) {
    if (identifier === null) return null
    const res = resolveIdentifier(HandlerModel, handlersStore.handlers, identifier)
    if (!res) {
      console.warn(`Failed to resolve command '${identifier}'`)
    }
    return res
  },
  set (handler) {
    return handler.funcId
  },
}))

function setUiHandlers (name, funcs) {
  for (const funcName in funcs) {
    const func = funcs[funcName]
    if (typeof func !== 'function') {
      throw new Error(`'${typeof func}' specified for ${
        name}.${funcName}. Expected 'function'`)
    }
    handlersStore.addHandler(
      `${name}.${funcName}`, func,
    )
  }
}

function bindUiHandler (alias, func) {
  // Known issue: Plugins can redefine handlers defined by other plugins

  // do bind without checking for existing handler
  // if (!handlers(.has(handlerName))
  handlersStore.addHandler(alias, func)
}

/**
 * @public
 * @memberof module:plugins-base#
*/
export function eventHandlerNode (aliasOrHandlerNode) {
  if (aliasOrHandlerNode && typeof aliasOrHandlerNode === 'object') {
    return aliasOrHandlerNode
  } else {
    return handlersStore.handlerNode(aliasOrHandlerNode)
  }
}

export function getEventHandlerFunc (aliasOrHandlerNode) {
  const node = eventHandlerNode(aliasOrHandlerNode)
  if (!node) {
    throw new Error(
    `Can't locate handler: '${aliasOrHandlerNode}', those are available: ` +
    `${keys(handlersStore.handlers)}`,
    )
  }
  const { alias } = node
  if (!alias) throw new Error(`Invalid handler ${alias}`)
  return node.func
}

/**
 * @param aliasOrNode handler id either HandlerModel node
 * @param externalParams object with various param values
 * { data } should provide data, events - optionally
*/
export async function callUiHandler (aliasOrNode, externalParams) {
  const restArgs = [...arguments].slice(2)
  let alias
  let node
  if (aliasOrNode && typeof aliasOrNode === 'object') {
    node = aliasOrNode
    alias = node.alias
  } else {
    alias = aliasOrNode
    node = handlersStore.handlerNode(alias)
  }
  if (!alias) throw new Error(`Invalid handler ${alias}`)
  if (!node) {
    throw new Error(
    `Can't locate handler: '${alias}', those are available: ` +
    `${keys(handlersStore.handlers)}`,
    )
  }
  const func = node.func()
  // add additional params into a handler
  const params = {
    root: window.store.root,
    store: window.store,
  }

  if (externalParams) {
    for (const externParam in externalParams) {
      params[externParam] = externalParams[externParam]
    }
  }
  const splitted = node.funcId.split('.')
  if (splitted.length === 2) {
    if ('data' in params && (!('self' in params) || params.self === undefined)) {
      // extract self object
      try {
        params.self = Plugins.get(splitted[0]).self(params.data)
      } catch (e) {}
    }
  }

  // const { data, ...restParams } = externalParams
  // console.log('callHandler', node.alias, restParams,
  //   data ? getPath(data) : null,
  //   data ? data.toJSON() : null,
  //   ...restArgs)
  return func(params, ...restArgs)
}
