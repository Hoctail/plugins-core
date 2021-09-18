
import { terser } from 'rollup-plugin-terser'
import commonjs from '@rollup/plugin-commonjs'
import babel from '@rollup/plugin-babel'

export default {
  input: 'src/index.js',
  external: [
    'mobx-state-tree',
    'mobx',
    'mobx-react',
    'prop-types',
    'react',
    'react-dom',
    'react-router-dom',
    'styled-components',
    'react-is',
  ],
  output: {
    exports: 'named',
    format: 'es',
    file: 'dist/index.mjs',
    sourcemap: true,
  },
  plugins: [
    babel({
      exclude: /node_modules/,
      presets: ['@babel/preset-env', '@babel/preset-react'],
      plugins: [
        ['inline-react-svg'],
        ['@babel/plugin-transform-react-jsx'],
        ['@babel/plugin-proposal-class-properties', { loose: true }],
        ['transform-modern-regexp'],
      ],
      babelHelpers: 'bundled',
    }),
    commonjs(),
    terser(),
  ],
  context: 'window',
}
