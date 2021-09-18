if (!window.hoctailPlugins) window.hoctailPlugins = {}

// Store sensitive objects we won't recreate if user bundled own copy of plugins-base / plugins-core 
export function ensureGlobal (name, value) {
  if (!(name in window.hoctailPlugins)) {
    window.hoctailPlugins[name] = value
  }
  return window.hoctailPlugins[name]
}
