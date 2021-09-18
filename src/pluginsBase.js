import {
  types,
  getType,
  getParentOfType,
  isType,
  getSnapshot,
  getMembers,
  resolveIdentifier,
  isAlive,
  getIdentifier,
} from 'mobx-state-tree'
import { Plugins, HandlerReference } from './handlersAndPlugins.js'
import { CssModel, EventsModel } from './coreModels.js'
import { Colors } from './colorsModel.js'
import { ensureGlobal } from './ensureGlobal.js'

/**
 * @template {*} T
 * @param {T} model
 * @return {ReferenceOptionsGetSet< T >}
*/
function defineReferenceOpts (model) {
  return {
    /**
     * @param {*} identifier
     * @param {*} parent
    */
    get (identifier, parent) {
      if (identifier == null || parent == null) return null
      return (
        // TODO Argument of type 'T' is not assignable to parameter of type 'IAnyModelType'.ts(2345)
        // @ts-ignore
        resolveIdentifier(model, parent, identifier) ||
        // @ts-ignore
        resolveIdentifier(model, window.store.root, identifier)
      )
    },
    /**
     * @param {*} value
    */
    set (value) {
      return getIdentifier(value) || 'id'
    },
  }
}

/**
 * @template {*} T
 * @param {T} model
 * @return {IReferenceType< T >}
*/
function rootReference (model) {
  // @ts-ignore
  return types.reference(model, defineReferenceOpts(model))
}

// TODO: move EventsBaseModel to coreModels.js
const EventsBaseModel = ensureGlobal('EventsBaseModel', types.compose('EventsBaseModel', EventsModel, types.model({
  /**
   * App colors schema
   * @see module:models.Colors
   * @public
   * @memberof module:components.EventsModel#
   * @data
  */
  appColors: types.optional(rootReference(Colors), 'AppColors'),
})).views(self => ({
  /**
   * @public
   * @memberof module:components.EventsModel#
   * @getter
  */
  get isPlugin () {
    return true
  },
  /**
   * corresponding DOM element
   * @public
   * @memberof module:components.EventsModel#
   * @getter
  */
  get element () {
    return document.getElementById(self.nodeId)
  },
})))


/* With respect to error boundary
@params typeFunc - function returning a type */
export function lateType (typeFunc) {
  // const typeFuncWrapper = () => {
  //   try {
  //     return typeFunc()
  //   } catch (e) {
  //     console.error(e)
  //     throw e
  //   }
  // }
  // return types.late(typeFuncWrapper)
  return types.late(typeFunc)
}

export function dynamicModelsTypes () {
  return Plugins.pluginTypeAny()
}

function serializeTemplate (args) {
  return args.map(
    (arg, idx) => {
      const type = typeof arg
      return {
        type,
        value: type === 'object' ? JSON.stringify(arg) : (
          arg !== undefined && arg !== null ? arg.toString() : ''
        ),
      }
    },
  )
}

function createCssModel (snapshot) {
  return snapshot
}

/*
  cssInject usage:
  cssInject('prop1', 'prop2') ``
  // combine props passed as func args and in js object
  cssInject('prop1', 'prop2', {
    id: 'css style name',
    props: ['prop3'],
    attrs: props => ({})
  })
  cssInject({
    id: 'css style name',
    props: ['prop1', 'prop2'],
    attrs: props => ({})
  })
*/
export function cssInject () {
  const args = [...arguments]
  let attrs
  const props = []
  let interpolated = []
  args.forEach(arg => {
    const argType = typeof arg
    if (argType === 'object') {
      if (Array.isArray(arg)) interpolated = arg
      else {
        if ('props' in arg) props.concat(arg.props)
        if ('attrs' in arg) {
          attrs = arg.attrs
          if (typeof attrs !== 'function') {
            throw new Error(`attrs is not a function, ${
              typeof attrs} ${attrs}`)
          }
        }
      }
    } else props.push(arg)
  })

  return createCssModel({
    source: 'cssInject',
    attrsFunc: attrs ? {
      type: 'function',
      value: attrs.toString(),
    } : null,
    props: props,
    // here arguments кelated to 'wrapper' function
    interpolated: serializeTemplate(interpolated),
  })
}

export function cssWrapper () {
  const args = [...arguments]

  // if called cssWrapper ``
  if (args.length && Array.isArray(args[0])) {
    return {
      source: 'cssWrapper',
      props: [],
      interpolated: serializeTemplate(args),
    }
  } else {
    /*
      usage:
      cssWrapper('prop1', 'prop2') ``
      // combine props passed as func args and in js object
      cssWrapper('prop1', 'prop2', {
        id: 'css style name',
        props: ['prop3'],
        attrs: props => ({})
      })
      cssWrapper({
        id: 'css style name',
        props: ['prop1', 'prop2'],
        attrs: props => ({})
      })
    */
    const wrapperArgs = [...arguments]
    const props = []
    let attrs
    wrapperArgs.forEach(arg => {
      if (typeof arg === 'object') {
        if ('props' in arg) props.concat(arg.props)
        if ('attrs' in arg) {
          if (typeof arg.attrs === 'function') attrs = arg.attrs
          else {
            throw new Error(`attrs is not a function, ${arg.attrs}`)
          }
        }
      } else props.push(arg)
    })

    const wrapper = (...args) => {
      return createCssModel({
        source: 'cssWrapper',
        attrsFunc: attrs ? {
          type: 'function',
          value: attrs.toString(),
        } : null,
        props: props,
        // here arguments is related to 'wrapper' function
        interpolated: serializeTemplate([...args]),
      })
    }
    return wrapper
  }
}

export function typePlugin (pluginOrName, pluginCreate) {
  return lateType(() => {
    let plugin = pluginOrName
    if (typeof pluginOrName === 'string') {
      plugin = Plugins.get(pluginOrName)
    } else if (typeof pluginOrName === 'function') {
      plugin = pluginOrName()
    }
    const model = plugin.Model || plugin
    return pluginCreate
      ? types.optional(model, () => pluginCreate(plugin))
      : model
  })
}

export function nodeByType (node, model) {
  if (!isType(model)) {
    throw new Error('nodeByType: \'model\' is not a node type')
  }
  if (getType(node) === model) return node
  return getParentOfType(node, model)
}

export function createModel (model, data = {}) {
  let node
  //try {
    node = model.create(Object.assign({ type: model.name }, data))
  //} catch (e) {
    // e.message = `Error creating a '${model.name}' model; ${e.message}`
    // console.error(
    //   `Error creating a model '${model.name}'`, 'using a data', data,
    // )
  //  throw e
  //}

  if (process.env.NODE_ENV === 'development') {
    const members = getMembers(node)

    // Warn if wrong keys passed into node create function
    const snapKeys = Object.keys(getSnapshot(node))
    const ignoreKeys = Object.keys(data).filter(key => !snapKeys.includes(key))
    if (ignoreKeys.length) {
      const name = members.name
      console.warn(
        `'${name}.create(...)' ignores following fields: `, ignoreKeys.join(', '),
      )
    }

    // Warn when accessing non existing fields: props, views, actions.
    // node = new Proxy(node, {
    //   get (target, key) {
    //     if (!(key === '$treenode' ||
    //       key in members.properties ||
    //       members.views.indexOf(key) >= 0 ||
    //       members.actions.indexOf(key) >= 0
    //     ) && typeof key !== 'symbol') {
    //       console.warn(`Bad property ${model.name}.${key}`)
    //     }
    //     return target[key]
    //   },
    // })
  }

  return node
}

export function pluginModel (pluginName) {
  const composeList = [...arguments].slice(1, -1)
  const modelProperties = [...arguments].slice(-1)[0]

  function defineStyle (props, styleKey) {
    const cssStyle = props[styleKey]
    // passed snapshot of CssModel
    if (typeof cssStyle === 'object' && !isType(cssStyle)) {
      props[styleKey] = types.optional(CssModel, cssStyle)
    }
  }
  function defineEvents (props, eventsKeyName, maybeNull) {
    const e = props[eventsKeyName]
    if (!isType(e) && typeof e === 'object' && Object.keys(e).length) {
      props[eventsKeyName] = types.optional(types.map(HandlerReference), e)
      if (maybeNull) {
        props[eventsKeyName] = types.maybeNull(props[eventsKeyName])
      }
    }
  }
  defineStyle(modelProperties, 'innerCss')
  defineStyle(modelProperties, 'outerCss')
  defineEvents(modelProperties, 'events')
  defineEvents(modelProperties, 'defaultEvents', true)

  const postProcessedModel = Object.assign(
    {
      type: types.literal(pluginName),
      testid: pluginName,
    },
    modelProperties,
  )
  return types.compose(
    pluginName, EventsBaseModel, ...composeList, types.model(postProcessedModel),
  )
}

let eventsWrapper
export function setEventsWrapper (wrapper) {
  eventsWrapper = wrapper
}

/**
 * cb is an original event handler provided by user,
 * 1st arg is dict:
 * { event, eventName, data, self, errHandlers, ... }
 * where errHandlers is an array of error handlers added by user:
 * errHandlers = [
 *   [someArg => { }, someArg],
 * ]
*/
function wrappedAsyncHandler (funcName, plugin, cb, noTx) {
  return async function (params) {
    const debugCmd = `${plugin.name}.${funcName}`
    const extraArgs = [...arguments].slice(1)
    // data, event, eventName is coming from component's handler
    const { data, eventName } = params
    // don't fail if self can't be resolved automatically
    let paramSelf
    try {
      paramSelf = plugin.self(data)
    } catch (e) {
    }
    const extendedParams = {
      root: window.store.root,
      store: window.store,
      self: paramSelf,
      errHandlers: [],
      ...params,
    }
    let res

    try {
      if (!isAlive(data) || data.disableEvents === true) {}
      // tx support
      else if (noTx !== 'noTx' && typeof handlersWrapper === 'function') {
        res = await handlersWrapper(() => cb(extendedParams, ...extraArgs))
      }
      else {
        res = cb(extendedParams, ...extraArgs)
      }
    } catch (e) {
      const { errHandlers } = extendedParams
      let handledByErrHandler
      errHandlers.forEach(errHandler => {
        if (Array.isArray(errHandler) && errHandler.length) {
          const errHandlerFunc = errHandler[0]
          handledByErrHandler = errHandlerFunc(e, ...errHandler.slice(1))
        }
      })
      // don't throw if handled by err handler
      if (!handledByErrHandler) {
        console.warn(data.nodeId, `Error handling ${eventName} command: '${debugCmd}'`)
        throw e
      }
    }
    return res
  }
}

/**
 * Known issues: In a model declaration should be used 'PluginXXX.Model'
 * and not just a 'PluginXXX', as MST considers them as different types
*/
export function pluginBaseProxy (model, state, ext) {
  if (!state) {
    state = {
      _deps: [],
      _create: (model, props) => createModel(model, {
        type: model.name,
        ...props,
      }),
      _handlers: {},
    }
  }
  if (window.pluginTypeId === undefined) window.pluginTypeId = 1
  else window.pluginTypeId++
  state._typeId = window.pluginTypeId
  state._model = model

  const proxy = new Proxy(model, {
    get: (target, name) => {
      switch (name) {
        case 'Model': return model
        case 'handlers': return state._handlers
        // deps supporting .register
        case 'deps': return state._deps
        case 'pluginTypeId': return state._typeId
        case 'views': return func => {
          return pluginBaseProxy(model.views(func), state, ext)
        }
        case 'actions': return func => {
          // return pluginBaseProxy(model.actions(self => ({
          //   ...func(self),
          // })), state, ext)
          return pluginBaseProxy(model.actions(func), state, ext)
        }
        /**
         * Add reactions in afterAttach callback
         * section example:
         * .reactionsA(self => [
         *   [
         *     () => self.cell.value,
         *     value => self.setTitle(value),
         *     'memo',
         *   ],
         * ])
        */
        case 'reactionsA': return func => {
          return pluginBaseProxy(model.actions(self => ({
            afterAttach () {
              // support .reactionsA section of plugin
              try {
                const reactions = func(self)
                reactions.forEach((reaction, idx) => {
                  const [reactOn, reactFunc, memo] = reaction
                  const name = memo || `${model.name}[${idx}]`
                  self.onTrack(name, reactOn, reactFunc)
                })
              } catch (e) {
                console.error('Bad reaction', model.name, func)
                throw e
              }
            },
          })), state, ext)
        }
        /**
         * Add reactions in afterCreate callback
        */
        case 'reactions': return func => {
          return pluginBaseProxy(model.actions(self => ({
            afterCreate () {
              // support .reactions section of plugin
              try {
                const reactions = func(self)
                reactions.forEach((reaction, idx) => {
                  const [reactOn, reactFunc, memo] = reaction
                  const name = memo || `${model.name}[${idx}]`
                  self.onTrack(name, reactOn, reactFunc)
                })
              } catch (e) {
                console.error('Bad reaction', model.name, func)
                throw e
              }
            },
          })), state, ext)
        }
        // deprecated
        // .links section added for simpler code generation
        // it's just adding a 'links' getter to a model
        case 'links': return func => {
          return pluginBaseProxy(model.views(self => ({
            get links () {
              return func(self)
            },
          })), state, ext)
        }
        case 'create': return (props = {}) => {
          try {
            // ensure do not passing null props
            props = props || {}
            const res = state._create(model, props)
            return res
          } catch (e) {
            console.error(
              `Error creating a '${model.name}' plugin instance`, 'using:', props,
            )
            // e.message = `'${model.name}.create(props)' error ${e.message}`
            // console.error('props is:', props, 'plugin type id:', proxy.pluginTypeId)
            throw e
          }
        }
        case 'constructor': return constructorAsArg => {
          state._create = constructorAsArg
          return proxy
        }
        case 'register': return pluginsList => {
          state._deps = pluginsList
          // console.log('plugin', model.name, 'deps:', state._deps.map(({ name }) => name))
          return proxy
        }
        case 'eventsNoTx':
        case 'events': return eventsHandlers => {
          for (const funcName in eventsHandlers) {
            const cb = eventsHandlers[funcName]
            state._handlers[funcName] = wrappedAsyncHandler(
              funcName, proxy, cb, name === 'eventsNoTx' ? 'noTx' : undefined,
            )
          }
          return proxy
        }
        case 'self': return node => nodeByType(node, model)
        default:
          if (ext && name in ext) {
            return ext[name](state, proxy)
          }
          // return underlying object's value
          else return target[name]
      }
    },
    // setting properties not supported
  })
  return proxy
}

export function pluginBase (pluginName, modelProperties = {}) {
  return pluginBaseProxy(
    pluginModel(...arguments),
  )
}

