import React from 'react'
import styled from 'styled-components'
import { observer } from 'mobx-react'
import PropTypes from 'prop-types'
import {
  getNodeId,
  isAlive,
  isArrayType,
} from 'mobx-state-tree'
import { plugins, registerPlugin } from './handlersAndPlugins'
import { pluginBaseProxy, pluginModel } from './pluginsBase'

const cachedStylesComponents = {}

function createStyledComponent (cssModel, component) {
  const template = cssModel.template
  if (!template) return component

  let styledComponent

  if (template) {
    let createStyle
    const attrs = cssModel.attrs

    if (component) createStyle = styled(component)
    else createStyle = styled.div

    if (attrs) {
      createStyle = createStyle.attrs(attrs)
    }

    if (cssModel.source === 'cssWrapper') {
      styledComponent = createStyle(...template)
    } else if (cssModel.source === 'cssInject') {
      styledComponent = createStyle`${template}`
    }
  }
  return styledComponent
}

function cachedStyledComponent (type, cssModel, component) {
  const styledComp = cssModel.styled()
  if (styledComp) return styledComp

  const template = cssModel.template
  if (!template) return component

  // To avoid wrong cache selection use full key
  const key = type + cssModel.templateKey
  if (!cachedStylesComponents[key]) {
    const styledComp = createStyledComponent(cssModel, component)
    cachedStylesComponents[key] = styledComp
  }
  const cachedComp = cachedStylesComponents[key]
  // console.log('cachedStyledComponent', cachedComp.toString())
  if (!cssModel.key()) {
    cssModel.setStyled(cachedComp)
  }
  return cachedComp
}

export function getStyle (node, cssModel, component) {
  if (!cssModel) return component
  else return cachedStyledComponent(node.type, cssModel, component)
}

function pluginComponent (node) {
  const { type } = node
  const plugin = plugins[type]
  if (!plugin) {
    throw new Error(`No plugin located for node.type: ${type}. Plugin isn't registered?`)
  }
  const component = plugin.Component
  if (!component) {
    throw new Error(`Couldn't locate component for node ${node} ${JSON.stringify(node.toJSON())} by type '${type}'`)
  }
  return component
}

// css argument can include innerCss, outerCss styles redifinition
/**
 * @public
 * @param {object} node Node to render
 * @param {object} [elementProps] - additional props for render
 * @param {object} [overrideComponent] Component with overrided styles,
 * for specific use case
*/
export function metaElement (node, elementProps = {}, overrideComponent) {
  function filterNodeData (data, propNames) {
    const dataProps = {}
    propNames.forEach(propName => {
      dataProps[propName] = data[propName]
    })
    return dataProps
  }

  // check if node isAlive, this check also fixes warn messages about detached node in some cases
  if (node && isAlive(node) && node.isVisible) {
    const innerCss = node.innerCss
    const outerCss = node.outerCss

    // Comp, Wrap are both caching
    const Comp = overrideComponent || node.innerComponent()
    const Wrap = node.outerComponent()

    const { nodeId, focusable, test } = node
    const props = {
      // following props are always present in a drawing metaElement
      data: node,
      id: nodeId,
      key: nodeId,
      tabIndex: focusable ? 0 : undefined,
      ...test,
      ...filterNodeData(node, innerCss.props),
    }

    if (Wrap) {
      const outerProps = filterNodeData(node, outerCss.props)
      const outerNodeId = getNodeId(outerCss)

      // Put only the 'key' prop to outerRect
      // Put rest of props as onClick, etc to a component itself
      const { key, ...restElementProps } = elementProps
      return (
        <Wrap id={outerNodeId} {...outerProps} key={key} >
          <Comp {...props} {...restElementProps}
          />
        </Wrap>
      )
    } else {
      return <Comp {...props} {...elementProps}
      />
    }
  } else return null
}

function createHandlers (props, handlers) {
  const { data } = props
  const events = data.events || []

  // Bind handlers to events
  events.forEach((handlerNode, eventName) => {
    async function handlerFunc (event) {
      // support extra arguments passed by event emitter to a handler
      const restArgs = [...arguments].slice(1)
      if (!isAlive(data) || data.disableEvents === true) return
      // check if disableEvents not a boolean (neither true nor false)
      else if (data.disableEvents !== false && data.disableEvents.indexOf(eventName) !== -1) return

      // For unknown reason stopPropagation won't work as expected
      // and event is coming with a cancelBubble = true
      if (eventName !== 'onComponentDidMount' && event && event.cancelBubble) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`${handlerNode} skip event as cancelbubble is set ${event.cancelBubble}`)
        }
        return
      }
      const handlerArgs = [
        Object.assign({}, props, { eventName, data, event }),
        ...restArgs,
      ]
      await handlerNode.func()(...handlerArgs)
    }
    try {
      // specify handler function name for debug purposes
      Object.defineProperty(handlerFunc, 'name', {
        value: `${eventName}@${handlerNode.alias}`,
        writable: false,
      })
    } catch (e) {
      console.error(`Error binding event handler: ${eventName}@${events.toJSON()[eventName]}`)
      throw e
    }
    handlers[eventName] = handlerFunc
  })
}

function withEventsHoc (Comp) {
  class HocWithEvents extends React.Component {
    constructor (props) {
      super(props)
      if (!this.isAlive()) return
      const { data } = props
      this.state = { id: data.nodeId }
      data.onTrack(
        'reallocate-hoc-handlers',
        () => data.eventsCount,
        () => this.allocateHandlers(),
      )
      this.allocateHandlers()
    }

    isAlive () {
      return isAlive(this.props.data)
    }

    allocateHandlers () {
      this.handlers = {}
      createHandlers(this.props, this.handlers)
    }

    async componentDidMount () {
      if (!this.isAlive()) return
      const { autoFocus, element } = this.props.data
      /** NOTE:
       * There is a risk that handler will not be called if mst
       * node is already rendered into a DOM element. When you create
       * a new node but component remained the same due to reconciliation.
       *
       * Here we are creating artificial event onComponentDidMount,
       * it is expected working like native events (e.g. onClick).
       * Suitable when need to access a just rendered DOM element.
      */
      if (this.handlers.onComponentDidMount) {
        await this.handlers.onComponentDidMount()
      }
      // alternative way to set autofocus
      if (autoFocus && element) {
        element.focus({})
      }
    }

    componentWillUnmount () {
      this.handlers = {}
    }

    componentDidUpdate (prevProps) {
      if (!this.isAlive()) return
      const { nodeId } = this.props.data
      const oldNodeId = this.state.id
      if (oldNodeId !== nodeId) {
        // Update event handlers and trigger redraw of a newly created node;
        // This prevents using old handlers linked to destroyed node.
        this.setState({ id: nodeId })
        this.allocateHandlers()
      }
    }

    render () {
      if (!this.isAlive()) return null
      const {
        onComponentDidMount,
        ...reactEventHandlers
      } = this.handlers
      const { data } = this.props
      const { autoFocus, eventsCount } = data
      // use eventsCount in render to trigger render when it changes
      if (eventsCount) {}
      return (
        <Comp {...this.props} autoFocus={autoFocus} {...reactEventHandlers} />
      )
    }
  }
  HocWithEvents.propTypes = {
    data: PropTypes.object,
  }
  return observer(HocWithEvents)
}

function pluginWithExtraActions (plugin) {
  return plugin.actions(self => ({
    /** not a view */
    innerComponent () {
      return getStyle(self, self.innerCss, pluginComponent(self))
    },
    /** not a view */
    outerComponent () {
      return getStyle(self, self.outerCss)
    },
    afterCreate () {
      /**
       * Create React components & cache them so they are
       * ready to use in render.
      */
      self.innerComponent()
      self.outerComponent()
    },
  }))
}

/**
 * example of usage:
 * const App = extendPlugin(BaseApp).component(...)
*/
export function extendPlugin (plugin) {
  // attach component's artefacts
  return pluginBaseProxy(pluginWithExtraActions(plugin), undefined, {
    // override default component
    component: (state, proxy) => component => {
      state._component = withEventsHoc(observer(component))
      return proxy
    },
    demo: (state, proxy) => (instanceFlagOrComponent, demoComponentOrCreateInstance) => {
      if (typeof instanceFlagOrComponent === 'boolean' && instanceFlagOrComponent === true) {
        // creating demo component by instance
        state._demo = componentByPluginNode(demoComponentOrCreateInstance)
      } else {
        // first argument is a component
        state._demo = instanceFlagOrComponent
      }
      return proxy
    },
    Component: state => {
      if (state._component) return state._component
      // return default component
      return withEventsHoc(observer(class ProxyComponent extends React.Component {
        static propTypes = { data: PropTypes.object }
        render () {
          const { data, ...restProps } = this.props
          let comps = data.render
          if (
            !(typeof comps === 'object' && Array.isArray(comps)) &&
            !isArrayType(comps)
          ) {
            comps = ['snapshot'] // default property to render
          }
          return (
            <div {...restProps} >
              {comps.map(name => metaElement(data[name]))}
            </div>
          )
        }
      }))
    },
    Demo: state => state._demo,
  })
}

export function plugin (pluginName, modelProperties = {}) {
  const plugin =  extendPlugin(
    pluginModel(...arguments),
  )
  registerPlugin(plugin)
  return plugin
}

export function componentByPluginNode (pluginNodeFunc) {
  class HocNodeComponent extends React.Component {
    constructor (props) {
      super(props)
      this.node = pluginNodeFunc()
    }

    render () {
      return metaElement(this.node)
    }
  }
  return observer(HocNodeComponent)
}
