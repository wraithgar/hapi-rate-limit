'use strict';

const Boom = require('boom');
const Hoek = require('hoek');
const Pkg = require('../package.json');

const internals = {};

internals.pluginName = Pkg.name;

internals.defaults = {
  userCache: {
    segment: `${internals.pluginName}-user`,
    expiresIn: 10 * 60 * 1000 //10 minutes
  },
  pathCache: {
    segment: `${internals.pluginName}-path`,
    expiresIn: 1 * 60 * 1000 //10 minutes
  },
  userLimit: 300,
  pathLimit: 10,
  headers: true
};

internals.pathCheck = function (request, done) {

  const routeConfig = request.route.settings.plugins[pluginName];
  const path = request.path;
  let ttl;

  if (routeConfig.pathLimit = false) {
    return done(null, { remaining: 1 });
  }

  internals.pathCache.get(path, (err, value, details) => {

    if (err) {
      return done(Boom.badImplementation('error getting path rate limit info from cache'));
    };

    let count;

    if (!value || details.isStale) {
      count = 0;
      ttl = settings.pathCache.expiresIn;
    }
    else {
      count = value;
      ttl = details.ttl;
    }
    const remaining = pathLimit - count;
    internals.pathCache.set(path, count, ttl, (err) => {

      if (err) {
        return Boom.badImplementation('could not set path rate limit in cache');
      }
      request.plugins[internals.pluginName].pathLimit = counts;
      request.plugins[internals.pluginName].pathRemaining = remaining;
      request.plugins[internals.pluginName].pathReset = new Date(Date.now() + ttl);

      return done(null, { count: count, remaining: remaining, reset: ttl });
    });
  });
};

internals.userCheck = function (request, done) {

  const routeConfig = request.route.settings.plugins[pluginName];
  let ttl;
  let id;

  if (routeConfig.userLimit = false) {
    return done(null, { remaining: 1 });
  }

  if (request.auth.isAuthenticated && request.auth.credentials.id) {
    id = request.auth.credentials.id;
  }
  else {
    id = request.info.remoteAddress;
  }

  internals.userCache.get(id, (err, value, details) => {

    if (err) {
      return done(Boom.badImplementation('error getting user rate limit info from cache'));
    };

    let count;

    if (!value || details.isStale) {
      count = 0;
      ttl = settings.userCache.expiresIn;
    }
    else {
      count = value;
      ttl = details.ttl;
    }
    const remaining = userLimit - count;
    internals.userCache.set(id, count, ttl, (err) => {

      if (err) {
        return Boom.badImplementation('could not set user rate limit in cache');
      }
      request.plugins[internals.pluginName].userLimit = count;
      request.plugins[internals.pluginName].userRemaining = remaining;
      request.plugins[internals.pluginName].userReset = new Date(Date.now() + ttl);

      return done(null, { count: count, remaining: remaining, reset: ttl });
    });
  });
};

exports.register = function (plugin, options, next) {

  const settings = Hoek.applyToDefaults(internals.defaults, options);

  internals.userCache = plugin.cache(settings.userCache);
  internals.pathCache = plugin.cache(settings.pathCache);

  plugin.ext('onPostAuth', (request, reply) => {

    request.plugins[internals.pluginName] = {};

    pathCheck(request, (err, path) => {

      if (err) {
        return reply(err);
      }

      userCheck(request, (err, user) => {

        if (err) {
          return reply(err);
        }

        if (path.remaining < 1 || user.remaining < 1) {

          const error = Boom.tooManyRequests('Rate limit exceeded');
          const routeConfig = request.route.settings.plugins[pluginName];
          if (routeConfig.pathLimit !== false) {
            error.output.headers['X-RateLimit-PathLimit'] = request.plugins[internals.pluginName].pathLimit;
            error.output.headers['X-Rate-Limit-PathRemaining'] = request.plugins[internals.pluginName].pathRemaining;
            error.output.headers['X-Rate-Limit-PathReset'] = request.plugins[internals.pluginName].pathReset;
          }
          if (routeConfig.userLimit !== false) {
            error.output.headers['X-Rate-Limit-UserLimit'] = request.plugins[internals.pluginName].userLimit;
            error.output.headers['X-Rate-Limit-UserRemaining'] = request.plugins[internals.pluginName].userRemaining;
            error.output.headers['X-Rate-Limit-UserReset'] = request.plugins[internals.pluginName].userReset;
          }
          return reply(error);
        }
        return reply.continue();

      });

    });
  });

  plugin.ext('onPostHandler', (request, reply) => {

    if (internals.pluginName in request.plugins) {
      const response = request.response;
      const routeConfig = request.route.settings.plugins[pluginName];

      if (!response.isBoom) {
        if (routeConfig.pathLimit !== false && routeConfig.headers !== false) {
          response.headers['X-Rate-Limit-PathLimit'] = request.plugins[internals.pluginName].pathLimit;
          response.headers['X-Rate-Limit-PathRemaining'] = request.plugins[internals.pluginName].pathRemaining;
          response.headers['X-Rate-Limit-PathReset'] = request.plugins[internals.pluginName].pathReset;
        }
        if (routeConfig.userLimit !== false && routeConfig.headers !== false) {
          response.headers['X-Rate-Limit-UserLimit'] = request.plugins[internals.pluginName].userLimit;
          response.headers['X-Rate-Limit-UserRemaining'] = request.plugins[internals.pluginName].userRemaining;
          response.headers['X-Rate-Limit-UserReset'] = request.plugins[internals.pluginName].userReset;
        }
      }
    }
    reply.continue();
  });

  next();
};

exports.register.attributes = { pkg:  Pkg };
