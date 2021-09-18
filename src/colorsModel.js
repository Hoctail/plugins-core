import { types } from 'mobx-state-tree'

function parseColors (color) {
  return color.match(/[0-9A-F]{2}/gi).map((c) => {
    const num = parseInt(c, 16)
    return isNaN(num) ? 0 : num
  })
}

function blendColors (colorA, colorB, amount) {
  const [rA, gA, bA] = parseColors(colorA)
  const [rB, gB, bB] = parseColors(colorB)
  const r = Math.round(rA + (rB - rA) * amount).toString(16).padStart(2, '0')
  const g = Math.round(gA + (gB - gA) * amount).toString(16).padStart(2, '0')
  const b = Math.round(bA + (bB - bA) * amount).toString(16).padStart(2, '0')
  return '#' + r + g + b
}

/**
 * @classdesc
 * Api for working with color schema.
 * <br>`Colors` node is already accessible from any plugin by
 * {@link module:components.EventsModel#appColors appColors}.
 * <br>Also instance can be returned by `rootModel().getController('AppColors')`.
 * <br>To discover colors in console:
 * <br>`> window.store.root.getController('AppColors').colors.map(color => color.toJSON())`
 * @public
 * @class module:models.Colors
 * @static
 * @hideconstructor
*/
export const Colors = types.model('Colors', {
  /**
   * id that can be used for referencing a node of this type.
   * @public
   * @memberof module:models.Colors#
   * @type {string}
   * @default 'AppColors'
   * @data
  */
  id: types.optional(types.identifier, 'AppColors'),
  /**
   * Main color
   * @public
   * @memberof module:models.Colors#
   * @type {string}
   * @data
  */
  appColor: types.maybeNull(types.string),
  /**
   * derivative app colors
   * @public
   * @memberof module:models.Colors#
   * @type {Map< String, object >}
   * @data
  */
  colors: types.array(types.model('Color', {
    alias: types.maybeNull(types.string),
    color: types.string,
  })),
}).views(self => ({
  /**
   * Color by name. some names: 'text', 'shadow', 'bg2', 'highlight1'
   * @public
   * @memberof module:models.Colors#
   * @type {Map< String, object >}
   * @view
  */
  name (name) {
    return self.colors.find(el => el.alias === name).color
  },
  /**
   * Color by index
   * @public
   * @memberof module:models.Colors#
   * @type {Map< String, object >}
   * @view
  */
  idx (idx) {
    return self.colors[idx].color
  },
})).actions(self => ({
  afterCreate () {
    self.setColors()
  },
  setAppColor (color) {
    self.appColor = color
    self.setColors()
  },
  setColors () {
    const appColor = self.appColor || '#EF2D56'
    self.colors = [
      /* 0 */ { color: appColor },
      /* 1 */ { color: appColor },
      /* 2 */ { color: '#ffffff' },
      /* 3 */ { alias: 'text', color: '#637280' },
      /* 4 */ { color: blendColors(appColor, '#FFFFFF', 0.9) },
      /* 5 */ { alias: 'shadow', color: 'rgba(99,114,128,0.5)' },
      /* 6 */ { alias: 'delim', color: '#f0f3f4' },
      /* 7 */ { alias: 'bg2', color: '#f9f9f9' },
      /* 8 */ { alias: 'highlight1', color: appColor },
      /* 9 */ { alias: 'errtext', color: 'rgba(244,67,54,0.7)' },
    ]
  },
}))

export default Colors
