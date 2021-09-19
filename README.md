# plugins-core
Opinionated library for creating Hoctail UI components

#Preamble
The project just recently open-sourced under MIT license, and earlier it was only available for use within the Hoctail platform.
Library itself has a pretty stable API, as a result of almost 2 years evolution while being a closed source.

#Api
* plugin (name, modelProperties) - create a pluginized component
  name - string that can is valid name for mobx-state-tree model name;
  modelProperties - mobx-state-tree types.model;
  It is returns an object that already has a pre-composed with a base model supporting core features of UI component. Returned object supporting calls chaining, and we use chaining for defining a component's sections:
  * eventsNoTx - see events
  * events - section for describing events handlers, like:
  ``` js
  // define a component type
  const Foo = plugin('Foo', {
    // Will become an event handler if not redefined during instantiation
    defaultEvents: {
      // onClick - react event name
      // naming convention:
      // Foo.ClickHandler define ClickHandler on a Foo component
      onClick: 'Foo.ClickHandler',
    },
  }).events({
    ClickHandler: ({ self, data, event }) => {
    },
  })
  ```
  * views - define mobx-state-tree view, for instance:
  ``` js
  plugin('Foo').views(self => ({
    get hello () { return 'hello' },
    color () {
      return self.appColors.appColor
    },
  }))
  ```
  * actions - define mobx-state-tree actions for mutations
  * reactionsA - same as reactions, but created in afterAttach hook
  * reactions - section for defining side effects (reactions).
  Reactions should not be extensively used, use actions where it's possible.
  ``` js
  import { plugin, getRootNode } from '@hoc/plugins-core'
  const Foo = plugin('Foo', {
    counter: 0,
  }).reactions(self => [
    [
      () => self.counter,
      // called when self.counter value changed
      counter => {
        getRootNode().getController('TooltipMessage').showTooltip(`Counter value is ${counter}`)
      },
      'counter tooltip',
    ],
  ])
  ```

# Instantiate a component
Component created with `plugin(...)` is just a definition and should be instantiated.
It's easy as `Foo.create()`, let's pretend we defined Foo component earlier:
``` js
const Foo2 = plugin('Foo2', {
  foo: typePlugin(Foo, () => Foo.create({
  }))
})

// instantiated but not rendered yet
Foo2.create({
  innerCss: cssInject(css`
    display: flex;
  `),
  foo: Foo.create({ counter: 100 })
})
```

# Rendering
In order to be rendered instantiated component should be part of the app tree, See [@hoc/app-root](https://github.com/Hoctail/app-root)


#Base model - is a model composed with every component returned by a plugin() function. Check EventsBaseModel docs [here](https://hoctail.github.io/hoctail/module-components.EventsModel.html). Here is the list of major state fields of a Hoctail component:
* innnerCss - styling of element a - component's instance.
``` js
import { css } from 'styled-components'
const Foo = plugin('Foo', {
  // use cssInject(css), either cssWrapper
  innerCss: cssInject(css`
    width: 100px;
    height: 100px;
  `),
  // use cssInject(css), either cssWrapper
  outerCss: cssWrapper`
    width: 100px;
    height: 100px;
  `,
})
```
* outerCss - if defined it creates a wrapper div around an element, the same styling methods can be used as for `innerCss`.
* defaultEvents - this field should be used only when defining a plugin, here we list  default events handlers that will be used
if no events defined during an instantiating a component.
* events - this field contains actual handlers assigned to an instance, pretending we already defined a 'Foo' plugin:
``` js
plugin('Foo2', {
  counter: 0,
  foo: typePlugin(Foo, () => Foo.create({
    // here we define events for newly created instance
    // it will redefine the same events defined in defaultEvents of a plugin definition (in our case Foo.ClickHandler will not be called).
    events: {
      onClick: 'Foo2.RedefinedClick',
    }
  }))
}).actions(self => ({
  increment () {
    self.counter++
  },
})).events({
  RedefinedClick (self) {
    self.increment()
  },
})
```
