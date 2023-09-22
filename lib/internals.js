const Pkg = require('../package.json')

const Crypto = require('crypto')
const Boom = require('@hapi/boom')
const Hoek = require('@hapi/hoek')
const Joi = require('joi')

const pluginName = Pkg.name

const schema = Joi.object({
  enabled: Joi.boolean().default(true),
  addressOnly: Joi.boolean().default(false),
  headers: Joi.boolean().default(true),
  ipWhitelist: Joi.array().default([]),
  authCache: Joi.object({
    getDecoratedValue: Joi.boolean().default(true),
    cache: Joi.string().optional(),
    segment: Joi.string().default(`${pluginName}-auth`),
    expiresIn: Joi.number().default(1 * 60 * 1000) // 1 minute
  }).default(),
  authToken: Joi.string().default('authToken'),
  authLimit: Joi.alternatives()
    .try(Joi.boolean(), Joi.number())
    .default(5),
  pathCache: Joi.object({
    getDecoratedValue: Joi.boolean().default(true),
    cache: Joi.string().optional(),
    segment: Joi.string().default(`${pluginName}-path`),
    expiresIn: Joi.number().default(1 * 60 * 1000) // 1 minute
  }).default(),
  pathLimit: Joi.alternatives()
    .try(Joi.boolean(), Joi.number())
    .default(50),
  ignorePathParams: Joi.boolean().default(false),
  trustProxy: Joi.boolean().default(false),
  getIpFromProxyHeader: Joi.func().default(null),
  proxyHeaderName: Joi.string().default('x-forwarded-for'),
  userAttribute: Joi.string().default('id'),
  userCache: Joi.object({
    getDecoratedValue: Joi.boolean().default(true),
    cache: Joi.string().optional(),
    segment: Joi.string().default(`${pluginName}-user`),
    expiresIn: Joi.number().default(10 * 60 * 1000) // 10 minutes
  }).default(),
  userLimit: Joi.alternatives()
    .try(Joi.boolean(), Joi.number())
    .default(300),
  userWhitelist: Joi.array().default([]),
  userPathCache: Joi.object({
    getDecoratedValue: Joi.boolean().default(true),
    cache: Joi.string().optional(),
    segment: Joi.string().default(`${pluginName}-userPath`),
    expiresIn: Joi.number().default(1 * 60 * 1000) // 1 minute
  }).default(),
  userPathLimit: Joi.alternatives()
    .try(Joi.boolean(), Joi.number())
    .default(false),
  limitExceededResponse: Joi.func().default(() => {
    return limitExceededResponse
  })
})

function getUser (request, settings) {
  if (request.auth.isAuthenticated) {
    const user = Hoek.reach(request.auth.credentials, settings.userAttribute)
    if (user !== undefined) {
      return user.toString()
    }
  }
}

function getIP (request, settings) {
  let ip

  if (settings.trustProxy && request.headers[settings.proxyHeaderName]) {
    if (settings.getIpFromProxyHeader) {
      ip = settings.getIpFromProxyHeader(request.headers[settings.proxyHeaderName])
    } else {
      const ips = request.headers[settings.proxyHeaderName].split(',')
      ip = ips[0]
    }
  }

  if (ip === undefined) {
    ip = request.info.remoteAddress
  }

  return ip
}

async function authFailure (authCache, request) {
  const requestPlugin = request.plugins[pluginName]
  const settings = requestPlugin.settings
  if (settings.authLimit === false) {
    return
  }

  const ip = getIP(request, settings)

  const { value, cached } = await authCache.get(ip)

  let token

  token = Hoek.reach(request, `auth.artifacts.${settings.authToken}`)

  if (!token) {
    token = Hoek.reach(request, `auth.error.data.${settings.authToken}`)
  }

  if (!token) {
    return
  }

  const tokenHash = Crypto.createHash('sha1')
    .update(token)
    .digest('hex')
    .slice(0, 6)

  let tokens
  let ttl = settings.userPathCache.expiresIn

  /* $lab:coverage:off$ */
  if (value === null || cached.isStale) {
    /* $lab:coverage:on$ */
    tokens = new Set([tokenHash])
  } else {
    ttl = cached.ttl
    tokens = new Set([...value, tokenHash])
  }

  // Sets don't stringify so we cast to an array before storing in the cache
  await authCache.set(ip, Array.from(tokens), ttl)
}

async function authCheck (authCache, request) {
  const requestPlugin = request.plugins[pluginName]
  const settings = requestPlugin.settings
  if (settings.authLimit === false) {
    requestPlugin.authLimit = false
    return
  }

  const ip = getIP(request, settings)
  const { value, cached } = await authCache.get(ip)

  /* $lab:coverage:off$ */
  if (value === null || cached.isStale) {
    /* $lab:coverage:on$ */
    return
  }

  const badIps = new Set(value)
  const remaining = settings.authLimit - badIps.size

  return remaining
}

async function pathCheck (pathCache, request) {
  const requestPlugin = request.plugins[pluginName]
  const settings = requestPlugin.settings
  const path = settings.ignorePathParams ? request.route.path : request.path

  if (settings.pathLimit === false) {
    requestPlugin.pathLimit = false
    return
  }

  const { value, cached } = await pathCache.get(path)
  let count
  let ttl = settings.pathCache.expiresIn

  /* $lab:coverage:off$ */
  if (value === null || cached.isStale) {
    /* $lab:coverage:on$ */
    count = 1
  } else {
    count = value + 1
    ttl = cached.ttl
  }

  let remaining = settings.pathLimit - count
  if (remaining < 0) {
    remaining = -1
  }

  await pathCache.set(path, count, ttl)

  requestPlugin.pathLimit = settings.pathLimit
  requestPlugin.pathRemaining = remaining
  requestPlugin.pathReset = Date.now() + ttl

  return remaining
}

async function userCheck (userCache, request) {
  const requestPlugin = request.plugins[pluginName]
  const settings = requestPlugin.settings
  const ip = getIP(request, settings)
  let user = getUser(request, settings)
  if (
    settings.ipWhitelist.indexOf(ip) > -1 ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        settings.userLimit === false
  ) {
    requestPlugin.userLimit = false
    return
  }

  if (settings.addressOnly || user === undefined) {
    user = ip
  }

  const { value, cached } = await userCache.get(user)

  let count
  let ttl = settings.userCache.expiresIn

  /* $lab:coverage:off$ */
  if (value === null || cached.isStale) {
    /* $lab:coverage:on$ */
    count = 1
  } else {
    count = value + 1
    ttl = cached.ttl
  }

  let remaining = settings.userLimit - count
  if (remaining < 0) {
    remaining = -1
  }

  await userCache.set(user, count, ttl)

  requestPlugin.userLimit = settings.userLimit
  requestPlugin.userRemaining = remaining
  requestPlugin.userReset = Date.now() + ttl

  return remaining
}

async function userPathCheck (userPathCache, request) {
  const requestPlugin = request.plugins[pluginName]
  const settings = requestPlugin.settings
  const ip = getIP(request, settings)
  let user = getUser(request, settings)
  const path = settings.ignorePathParams ? request.route.path : request.path

  if (
    settings.ipWhitelist.indexOf(ip) > -1 ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        settings.userPathLimit === false
  ) {
    requestPlugin.userPathLimit = false
    return
  }

  if (settings.addressOnly || user === undefined) {
    user = ip
  }

  const userPath = `${user}:${path}`

  const { value, cached } = await userPathCache.get(userPath)

  let count
  let ttl = settings.userPathCache.expiresIn

  /* $lab:coverage:off$ */
  if (value === null || cached.isStale) {
    /* $lab:coverage:on$ */
    count = 1
  } else {
    count = value + 1
    ttl = cached.ttl
  }

  let remaining = settings.userPathLimit - count
  if (remaining < 0) {
    remaining = -1
  }

  await userPathCache.set(userPath, count, ttl)

  requestPlugin.userPathLimit = settings.userPathLimit
  requestPlugin.userPathRemaining = remaining
  requestPlugin.userPathReset = Date.now() + ttl

  return remaining
}

function limitExceededResponse () {
  return Boom.tooManyRequests('Rate limit exceeded')
}

module.exports = {
  authCheck,
  authFailure,
  getIP,
  getUser,
  limitExceededResponse,
  pathCheck,
  pluginName,
  schema,
  userCheck,
  userPathCheck
}
