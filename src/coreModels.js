
/**
 * @module components
*/

/**
 * @public
 * @namespace module:components
*/

import {
  types,
  getPath,
  getParent,
  isAlive,
  getNodeId,
} from 'mobx-state-tree'

import { ObserverModel } from './observer.js'
import { HandlerReference } from './handlersAndPlugins.js'
import { ensureGlobal } from './ensureGlobal.js'

const InterpolatedItemModel = ensureGlobal('InterpolatedItemModel', types.model('InterpolatedItem', {
  type: types.string,
  value: types.string,
}).views(self => ({
  token () {
    if (self.type === 'object') return JSON.parse(self.value)
    else if (self.type === 'function') {
      const cssModel = getParent(self, 2)
      return newStyledFunc(self.value, cssModel)
    } else return self.value
  },
})))

function newStyledFunc (arrowFunc, cssModel) {
  let body
  if (process.env.NODE_ENV === 'development') {
    body = `
    try {
      return (${arrowFunc})(props)
    } catch (e) {
      console.error('Error in styled component:',
        '${cssModel.reconstructCodeEscaped}', '\\n',
        'at func:', (${arrowFunc}),
        'at node:', '${getPath(cssModel)}',
        props, e,
      )
    }`
  } else body = `return (${arrowFunc})(props)`
  // eslint-disable-next-line no-new-func
  return new Function('props', body)
}

const hashedComponents = {}

/**
 * @classdesc
 * Describes a css style of a plugin component.
 * Usually users have to do nothing with that except of just creating a style.
 * <br>Define some default style:
 * ``` js
 * import { types } from 'mobx-state-tree'
 * import { css } from 'styled-components'
 * import { plugin, cssInject } from '@hoc/plugins-core'
 * const p = plugin('MyPlugin', {
 *   myStyle: types.optional(CssModel, cssInject(css`
 *     display: flex;
 *   `)),
 * })
 * ```
 * or 
 * ``` js
 * import { types } from 'mobx-state-tree'
 * import { plugin, cssWrapper } from '@hoc/plugins-core'
 * const p = plugin('MyPlugin', {
 *   myStyle: types.optional(CssModel, cssWrapper`
 *     display: flex;
 *   `),
 * })
 * ```
 * @public
 * @class module:components.CssModel
 * @hideconstructor
*/
export const CssModel = ensureGlobal('CssModel', types.model('CssModel', {
  props: types.array(types.string),
  interpolated: types.maybeNull(types.array(InterpolatedItemModel)),
  attrsFunc: types.maybeNull(InterpolatedItemModel),
  source: types.optional(
    types.enumeration('Source', ['cssInject', 'cssWrapper']),
    'cssWrapper',
  ),
}).views(self => ({
  get reconstructCodeEscaped () {
    return self.reconstructCode.replace(
      new RegExp('\'', 'gm'), '\\\'').replace(
      new RegExp('\\n', 'gm'), '\\n',
    )
  },
  get reconstructCode () {
    let res = ''
    if (self.source === 'cssWrapper') {
      if (self.interpolated.length) {
        const funcs = self.interpolated.slice(1).map(item => item.value)
        const str = self.interpolated[0].value
        const prepStr = str.replace(new RegExp('\\n', 'g'), '\\\\n')
        const templates = JSON.parse(prepStr)
        const items = templates.map(
          (template, idx) => idx < funcs.length
            ? `${template} \${${funcs[idx]}}`
            : template,
        )
        res = items.join('')
      }
    } else if (self.source === 'cssInject') {
      res = self.interpolated.map(item => item.value).join('')
    }
    return res
  },
  get templateKey () {
    return self.template.join('-')
  },
  get attrs () {
    if (!self.attrsFunc) return null
    const { type, value } = self.attrsFunc
    if (type === 'function') return newStyledFunc(value, self)
    else throw new Error(`Bad attrs ${value}`)
  },
  // pass array of serialized strings we got from cssWrapper
  // usage: self.innerCss.template
  get template () {
    if (isAlive(self) && self.interpolated) {
      return self.interpolated.map((item, idx) => item.token())
    } else return null
  },
  // just for outerCss wrapper <div> element
  get element () {
    return document.getElementById(self.nodeId)
  },
  getStatic (node) {
    if (self.interpolated.length) {
      const template = self.template
      const funcs = template.slice(1)
      return template[0].map((str1, idx) => (
        funcs[idx] ? str1.concat(funcs[idx](node)) : str1
      )).join('')
    } else return ''
  },
})).actions(self => ({
  /**
   * Set css style by replasing existing one.
   * Usually it should not be used as mostly we provide css when creating snapshot. 
   * @public
   * @memberof module:plugins-base.CssModel#
   * @param {string} cssString css as a plaint text
  */
  setCss (cssString) {
    self.props = []
    self.attrsFunc = null
    self.source = 'cssInject'
    self.interpolated = [{
      type: 'string',
      value: cssString.replace(/\n/g, '\\n'),
    }]
  },
})).actions(self => {
  let _key = null
  function setStyled (styled) {
    self.setKey(styled ? styled.toString() : null)
    hashedComponents[_key] = styled
  }
  function styled () {
    return hashedComponents[_key]
  }
  function setKey (key) {
    // console.log('setKey', Object.keys(hashedComponents).length, key)
    _key = key
  }
  function key () {
    return _key
  }
  return { setKey, key, setStyled, styled }
}))

export const CssStylesModel = ensureGlobal('CssStylesModel', types.model('CssStylesModel', {
  /**
   * Style of a component itself
   * @public
   * @memberof module:components.EventsModel#
   * @type {module:components.CssModel}
   * @data
  */
  innerCss: types.optional(CssModel, {}),
  /**
   * If specified then surrounding wrapper `div` will be created with this style.
   * @public
   * @memberof module:components.EventsModel#
   * @type {module:components.CssModel}
   * @data
  */  
  outerCss: types.optional(CssModel, {}),
}).actions(self => ({
  /**
   * Set inner css if not yet defined
   * ``` js
   * // pretend we already have a component's node: `node` 
   * node.setInnerCss(
   *   cssInject(css`
   *     display: flex;
   *   `)
   * )
   * ```
   * @public
   * @action
   * @memberof module:components.EventsModel#
   * @param {object} cssInjectCss accepts json snapshot returned by cssInject(css``)
  */
  setInnerCss (cssInjectCss) {
    self.innerCss = cssInjectCss
    // existing node was not replaced while assigning the snapshot
    // but reconciled, so need to reset old style explicitely
    self.innerCss.setKey(null)
    // create new styled
    self.innerComponent() // recreate component
  },
  /**
   * Set outer css if not yet defined

   * @public
   * @action
   * @memberof module:components.EventsModel#
   * @param {object} cssString
   * @see module:components.EventsModel#setInnerCss
  */
  setOuterCss (cssInjectCss) {
    self.outerCss = cssInjectCss
    self.outerCss.setKey(null)
    self.outerComponent() // recreate component
  },
})))

const TestModel = ensureGlobal('TestModel', types.model({
  /**
   * data-testid component's attribute
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {?string}
   * @see module:components.EventsModel#setTestId
  */  
  testid: types.maybeNull(types.string),
  /**
   * data-testkey component's attribute
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {?string}
   * @see module:components.EventsModel#setTestKey
  */
  testkey: types.maybeNull(types.string),
}).views(self => ({
  /**
   * object with data-testid, data-testkey attributes
   * using when rendering a component, like `<Comp {...test} />`
   * @public
   * @getter
   * @memberof module:components.EventsModel#
   * @type {?string}
   * @see module:components.EventsModel#setTestKey
  */  
  get test () {
    return self.testWrapper()
  },
  testWrapper (name) {
    // should be no nulls in resulted testid
    return {
      'data-testid': !name && !self.testid ? null : `${name || ''}${self.testid ? self.testid : ''}`,
      'data-testkey': self.testkey,
    }
  },
})).actions(self => ({
  /**
   * sets data-testid component's attribute
   * @public
   * @memberof module:components.EventsModel#
   * @param {string}
   * @action
   * @see module:components.EventsModel#testid
  */  
  setTestId (testid) {
    self.testid = testid
  },
  /**
   * sets data-testkey component's attribute
   * @public
   * @memberof module:components.EventsModel#
   * @param {string}
   * @action
   * @see module:components.EventsModel#testkey
  */
  setTestKey (testkey) {
    self.testkey = testkey
  },
})))

const BaseModel = ensureGlobal('BaseModel', types.compose(
  'BaseModel', CssStylesModel, TestModel, ObserverModel, types.model({
    /**
     * Node visible or not
     * @public
     * @data
     * @memberof module:components.EventsModel#
     * @type {boolean}
    */
    visible: true,
    /**
     * @public
     * @data
     * @memberof module:components.EventsModel#
     * @type {boolean}
    */    
    focusable: types.maybeNull(types.boolean),
    /**
     * data injected to a model, useful with nested nodes when creating dynamic css styles.
     * @public
     * @data
     * @deprecated
     * @memberof module:components.EventsModel#
     * @type {?string}
     * @see module:components.EventsModel#setPayload1
    */
    payload1: types.maybeNull(types.string),

    /**
     * data injected to a model, useful with nested nodes when creating dynamic css styles.
     * @public
     * @data
     * @memberof module:components.EventsModel#
     * @type {Map<string,string>}
     * @example
     * const p = plugin('MyPlugin', {
     * snapshot: typePlugin(List, p => p.create({
     *   items: [
     *     List.create({
     *       payload: { color: 'red' },
     *       innerCss: cssInject('payload', css`
     *         color: ${props => props.payload.get('color')};
     *       `),
     *     }),
     *   ],
     * })
     * @see module:components.EventsModel#setPayload
    */
    payload: types.map(types.union(types.string, types.boolean)),
  }).views(self => ({
    /**
     * Component is visible or not
     * @public
     * @getter
     * @memberof module:components.EventsModel#
     * @type {boolean}
     * @see module:components.EventsModel#visible
    */    
    get isVisible () {
      return self.visible
    },
    /**
     * Node id unique across whole tree, kind of '_1234'
     * @public
     * @getter
     * @memberof module:components.EventsModel#
     * @type {string}
    */    
    get nodeId () {
      return `_${getNodeId(self)}`
    },
  })).actions(self => ({
    /**
     * @public
     * @memberof module:components.EventsModel#
     * @param {boolean} visible
     * @see module:components.EventsModel#visible
     * @action
    */    
    setVisible (visible) {
      self.visible = visible
    },
    /**
     * set focusable flag only during creation phase in `afterCreate` or `afterAttach`
     * before component is not instantiated
     * @public
     * @memberof module:components.EventsModel#
     * @param {boolean} focusable
     * @see module:components.EventsModel#focusable
     * @action
    */
    setFocusable (focusable) {
      self.focusable = focusable !== undefined ? focusable : true
    },
    /**
     * @public
     * @deprecated
     * @memberof module:components.EventsModel#
     * @param {string} payload
     * @see module:components.EventsModel#payload1
     * @action
    */    
    setPayload1 (payload) {
      self.payload1 = payload
    },
    /**
     * @public
     * @memberof module:components.EventsModel#
     * @param {string|object} key
     * if object is provided it will be treated as a complete payload and value will be ignored
     * @param {string|boolean} value
     * @see module:components.EventsModel#payload
     * @action
    */    
    setPayload (key, value) {
      if (typeof key === 'object') {
        const payload = key
        self.payload = payload
      } else {
        self.payload.set(key, value)
      }
    },
  })),
))

/**
 * @public
 * @class module:components.EventsModel
 * @hideconstructor
*/
export const EventsModel = ensureGlobal('EventsModel', types.compose('EventsModel', BaseModel, types.model({
  /**
   * defaultEvents should be used only when defining a plugin model,
   * When creating instance with .create() it will set instance's events using this as a source.
   * Map <key - event name, value - handler name>
   * usage: {onClick: 'MyPlugin.HandlerName', ...}
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {Map<String, String>}
  */
  defaultEvents: types.maybeNull(types.map(HandlerReference)),
  /**
   * Map <key - event name, value - handler name>
   * usage: {onClick: 'MyPlugin.HandlerName', ...}
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {Map<String, String>}
  */
  events: types.map(HandlerReference),
  /**
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {Map<String, Boolean>}
  */
  disableEvents: types.optional(
    types.union(types.boolean, types.array(types.string)),
    false,
  ),
  /**
   * if focusable is true it will focus itself when rendering.
   * @public
   * @data
   * @memberof module:components.EventsModel#
   * @type {boolean}
  */
  autoFocus: types.maybeNull(types.boolean),
}).views(self => ({
  /**
   * get defined events count 
   * @public
   * @getter
   * @memberof module:components.EventsModel#
   * @type {number}
  */
  get eventsCount () {
    return self.events.size
  },
})).actions(self => ({
  /**
   * unlink event handler
   * @public
   * @memberof module:components.EventsModel#
   * @action
   * @param {string} eventName onClick, for example
  */
  unsetEvent (eventName) {
    self.events.delete(eventName)
  },
  /**
   * set event handler
   * @public
   * @memberof module:components.EventsModel#
   * @action
   * @param {string} eventName onClick, for example
   * @param {string} handlerName Name of function defined in `.events(...)` section
  */
  setEvent (eventName, handlerName) {
    self.events.set(eventName, handlerName)
  },
  /**
   * set multiple events
   * @public
   * @memberof module:components.EventsModel#
   * @action
   * @param {object} events
   * {
   *   onClick: 'MyPlugin.Handler1',
   *   onMouseEnter: 'MyPlugin.Handler2',
   * }
   * @param {boolean} [overwriteExisting=true]
   * if true do not overwrite existing events
  */
  setEvents (events, overwriteExisting=true) {
    for (const key in events) {
      if (!overwriteExisting && self.events.has(key)) {
        continue
      }
      self.events.set(key, events[key])
    }
  },
  setDefaultEvents () {
    if (self.defaultEvents) {
      self.setEvents(self.defaultEvents.toJSON(), false)
    }
    self.defaultEvents = null
  },
  /**
   * Disable event so it will not be called when event occur.
   * @public
   * @memberof module:components.EventsModel#
   * @action
   * @param {Array<string>|boolean} disableEvents false - no events disabled,
   * true if all events disabled, or array as a list of particular events
  */
  setDisableEvents (disableEvents) {
    self.disableEvents = disableEvents
  },
  /**
   * @public
   * @memberof module:components.EventsModel#
   * @action
   * @param {boolean} [autoFocus=true]
  */  
  setAutoFocus (autoFocus = true) {
    self.autoFocus = autoFocus
    if (self.autoFocus) self.setFocusable()
  },
  afterCreate () {
    // after instance is created set events from defaultEvents
    // not existing in events.
    // Why? We want to set such events even if instance
    // defined own events, not overlapped with defaults.
    self.setDefaultEvents()
  },
}))))
