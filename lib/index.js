'use strict'

const Joi = require('joi')
const Pkg = require('../package.json')

const internals = require('./internals')

const register = function (plugin, options) {
  const pluginSettings = Joi.attempt(Object.assign({}, options), internals.schema)

  // we call toString on the user attribute in getUser, so we have to do it here too.
  pluginSettings.userWhitelist = pluginSettings.userWhitelist.map(user => user.toString())

  const userCache = plugin.cache(pluginSettings.userCache)
  const pathCache = plugin.cache(pluginSettings.pathCache)
  const userPathCache = plugin.cache(pluginSettings.userPathCache)
  const authCache = plugin.cache(pluginSettings.authCache)

  // called regardless if authentication is performed, before authentication is performed
  plugin.ext('onPreAuth', async (request, h) => {
    const routeSettings = request.route.settings.plugins[internals.pluginName] || {}

    delete routeSettings.userCache

    if (routeSettings.userLimit !== false) {
      delete routeSettings.userLimit
    }

    const settings = { ...pluginSettings, ...routeSettings }

    request.plugins[internals.pluginName] = { settings }

    if (settings.enabled === false) {
      return h.continue
    }

    const remaining = await internals.authCheck(authCache, request)

    if (remaining < 0) {
      return settings.limitExceededResponse(request, h)
    }

    return h.continue
  })

  // called regardless if authentication is performed, but not if authentication fails
  plugin.ext('onPostAuth', async (request, h) => {
    const { settings } = request.plugins[internals.pluginName]

    if (settings.enabled === false) {
      return h.continue
    }

    const remaining = await Promise.all([
      internals.userCheck(userCache, request),
      internals.userPathCheck(userPathCache, request),
      internals.pathCheck(pathCache, request)
    ])

    if (remaining.some(r => r < 0)) {
      return settings.limitExceededResponse(request, h)
    }

    return h.continue
  })

  // always called, unless the request is aborted
  plugin.ext('onPreResponse', async (request, h) => {
    const requestPlugin = request.plugins[internals.pluginName]

    if (!requestPlugin) {
      // We never even made it to onPreAuth
      return h.continue
    }

    const { response } = request

    // Non 401s can include authToken in their data and if it's there it counts
    if (response.isBoom) {
      await internals.authFailure(authCache, request)
    }

    const { settings } = requestPlugin

    if (settings.headers !== false) {
      let headers = response.headers

      if (response.isBoom) {
        headers = response.output.headers
      }

      if (settings.pathLimit !== false) {
        headers['X-RateLimit-PathLimit'] = requestPlugin.pathLimit
        headers['X-RateLimit-PathRemaining'] = requestPlugin.pathRemaining
        headers['X-RateLimit-PathReset'] = requestPlugin.pathReset
      }

      if (settings.userPathLimit !== false) {
        headers['X-RateLimit-UserPathLimit'] = requestPlugin.userPathLimit
        headers['X-RateLimit-UserPathRemaining'] = requestPlugin.userPathRemaining
        headers['X-RateLimit-UserPathReset'] = requestPlugin.userPathReset
      }

      if (settings.userLimit !== false) {
        headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit
        headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining
        headers['X-RateLimit-UserReset'] = requestPlugin.userReset
      }
    }

    return h.continue
  })
}

module.exports = {
  register,
  pkg: Pkg
}
