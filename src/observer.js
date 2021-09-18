/**
 * @module @hoc/plugins-core
*/

import { types, isAlive, isProtected } from 'mobx-state-tree'
import { reaction } from 'mobx'

/**
 * @public
 * @class module:models.ObserverModel
 * @classdesc Observer model using on mobx reaction mechanism. Compose with other models.
 * @hideconstructor
*/

export const ObserverModel = types.model('ObserverModel', {
}).actions(self => {
  /** @type {Object< String, Function >} */
  const disposers = {}

  /**
   * @param {string} name
   * @param {Function} observableAsFunc
   * @param {Function} [func]
  */
  function autoFuncId (name, observableAsFunc, func) {
    return `${name} ${observableAsFunc.toString()} ${func ? func.toString() : ''}`
  }

  function beforeDestroy () {
    for (const funcId in disposers) {
      disposers[funcId]()
      delete disposers[funcId]
    }
  }
  /**
   * Setups {@link https://mobx.js.org/api.html#reaction mobx reaction}.
   * Reactions set in this way will be disposed automatically in beforeDestroy action.
   * Attempted call of onTrack with the same name will be ignored.
   * @example self.onTrack('CheckHandler', () => self.checked, checked => {
   *   if (checked) self.foo()
   * })
   * @public
   * @action
   * @memberof module:models.ObserverModel#
   * @param {string|object} name
   * if object passed
   * any text can be a hook name, suitable for debugging.
   * @param {Function} observableAsFunc Function watching(returning) model's data (primitive values?) changes.
   * @param {Function} func Reaction func to be called when watching value has changed.
   * All the actions called inside are related to the <b>ongoing transaction</b>.
   * @return {string} hook identifier that can be used as argument for stopTracking
  */
  function onTrack (name, observableAsFunc, func) {
    /** setup reaction
     * name - is only for info purposes
     * observableAsFunc - model's getter / prop returned by function
     * func - reaction func of a kind changedValue => {  }
     */
    let options = {}
    if (typeof name === 'object') {
      options = name
      name = options.name
    }
    if (name == null) {
      throw new Error('Cannot setup onTrack with no name')
    }

    /** @param {*} val */
    function loggerWrapped (funcType, name, f) {
      return function (val) {
        try {
          if (isAlive(self)) {
            // if tree is not in protected mode, do not run reaction function
            // we make it unprotected when making a transaction rollback
            //  so no reactions will be applied during a rollback
            if (funcType === 'handler' && !isProtected(self)) return
            else {
              const before = performance.now()
              const res = f(val)
              if (process.env.NODE_ENV === 'development') {
                const took = performance.now() - before
                if (took >= 1) {
                  console.log(`took ${took} for ${name} ${self.type} ${funcType}`)
                }
              }
              return res
            }
          }
        } catch (e) {
          // just logging an error
          // since error boundary is enabled in mobx reaction
          // (it's eating exception by design)
          console.error(`Error in onTrack reaction ${funcType} '${name || f}'`)
          throw e
        }
      }
    }

    const funcId = autoFuncId(name, observableAsFunc, func)

    if (!(funcId in disposers)) {
      disposers[funcId] = reaction(
        // @ts-ignore
        loggerWrapped('value', name, observableAsFunc),
        loggerWrapped('handler', name, func),
        options,
      )
    }
    return funcId
  }
  /**
   * @param {Function} cb
  */
  function onDestroy (cb) {
    const funcId = autoFuncId('', cb)
    disposers[funcId] = cb
    return funcId
  }
  /**
   * @public
   * @action
   * @memberof module:models.ObserverModel#
   * @param {string} hookId Value returned by `onTrack`
  */
  function stopTracking (hookId) {
    if (hookId in disposers) {
      const func = disposers[hookId]
      if (func) func()
      delete disposers[hookId]
    }
  }

  return { beforeDestroy, onTrack, onDestroy, stopTracking }
})
