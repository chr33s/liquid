/*
 * liquidjs, https://github.com/harttle/liquidjs
 * (c) 2016-2026 harttle
 * Released under the MIT License.
 *
 * CommonJS adapter: re-exports the single ESM build so that `require('liquidjs')`
 * and `import 'liquidjs'` always share one module instance.
 */
module.exports = require('./liquid.node.mjs')
