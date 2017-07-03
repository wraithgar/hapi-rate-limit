'use strict';

const Boom = require('boom');
const Hoek = require('hoek');
const Pkg = require('../package.json');
const https = require('https');

const internals = {};

internals.pluginName = Pkg.name;

internals.defaults = {
    enabled: true,
    addressOnly: false,
    headers: true,
    ipWhitelist: [],
    pathCache: {
        segment: `${internals.pluginName}-path`,
        expiresIn: 1 * 60 * 1000 //1 minute
    },
    pathLimit: 50,
    trustProxy: false,
    userAttribute: 'id',
    userCache: {
        segment: `${internals.pluginName}-user`,
        expiresIn: 10 * 60 * 1000 //10 minutes
    },
    userLimit: 300,
    userWhitelist: [],
    userPathCache: {
        segment: `${internals.pluginName}-userPath`,
        expiresIn: 10 * 60 * 1000 //10 minutes
    },
    userPathLimit: false,
    recaptchaOptions: {
      hostname: 'www.google.com',
      port: 443,
      path: '/recaptcha/api/siteverify',
      method: 'GET'
    },
    recaptchaSecret: false
};

internals.getUser = function getUser(request, settings) {

    if (request.auth.isAuthenticated && request.auth.credentials.hasOwnProperty(settings.userAttribute)) {
        return request.auth.credentials[settings.userAttribute].toString();
    }
};

internals.getIP = function getIP(request, settings) {

    let user;

    if (settings.trustProxy && request.headers['x-forwarded-for']) {
        const ips = request.headers['x-forwarded-for'].split(',');
        user = ips[0];
    }

    if (user === undefined) {
        user = request.info.remoteAddress;
    }

    return user;
};

internals.pathCheck = function (request, settings, done) {

    const path = request.path;

    if (settings.pathLimit === false) {
        request.plugins[internals.pluginName].pathLimit = false;
        return done(null, { remaining: 1 });
    }

    internals.pathCache.get(path, (getErr, value, details) => {

        if (getErr) {
            request.log([Pkg.name, 'error'], getErr);
            return done(Boom.badImplementation('error getting path rate limit info from cache'));
        };

        let count;
        let ttl = settings.pathCache.expiresIn;

        if (value === null || details.isStale) {
            count = 1;
        }
        else {
            count = value + 1;
            ttl = details.ttl;
        }
        const remaining = settings.pathLimit - count;
        internals.pathCache.set(path, count, ttl, (setErr) => {

            if (setErr) {
                request.log([Pkg.name, 'error'], setErr);
                return done(Boom.badImplementation('could not set path rate limit in cache'));
            }

            request.plugins[internals.pluginName].pathLimit = settings.pathLimit;
            request.plugins[internals.pluginName].pathRemaining = remaining;
            request.plugins[internals.pluginName].pathReset = Date.now() + ttl;

            return done(null, { count, remaining, reset: settings.pathCache.expiresIn });
        });
    });
};

internals.userCheck = function (request, settings, done) {

    const ip = internals.getIP(request, settings);
    let user = internals.getUser(request, settings);

    if (
        (settings.ipWhitelist.indexOf(ip) > -1) ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        (settings.userLimit === false)
    ) {
        request.plugins[internals.pluginName].userLimit = false;
        return done(null, { remaining: 1 });
    }

    if (settings.addressOnly || (user === undefined)) {
        user = ip;
    }

    internals.userCache.get(user, (getErr, value, details) => {

        if (getErr) {
            request.log([Pkg.name, 'error'], getErr);
            return done(Boom.badImplementation('error getting user rate limit info from cache'));
        };

        let count;
        let ttl = settings.userCache.expiresIn;

        if (value === null || details.isStale) {
            count = 1;
        }
        else {
            count = value + 1;
            ttl = details.ttl;
        }
        const remaining = settings.userLimit - count;
        internals.userCache.set(user, count, ttl, (setErr) => {

            if (setErr) {
                request.log([Pkg.name, 'error'], setErr);
                return done(Boom.badImplementation('could not set user rate limit in cache'));
            }

            request.plugins[internals.pluginName].userLimit = settings.userLimit;
            request.plugins[internals.pluginName].userRemaining = remaining;
            request.plugins[internals.pluginName].userReset = Date.now() + ttl;

            return done(null, { count, remaining, reset: ttl });
        });
    });
};

internals.userPathCheck = function (request, settings, done) {

    const ip = internals.getIP(request, settings);
    let user = internals.getUser(request, settings);
    const path = request.path;

    if (
        (settings.ipWhitelist.indexOf(ip) > -1) ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        (settings.userPathLimit === false)
    ) {
        request.plugins[internals.pluginName].userPathLimit = false;
        return done(null, { remaining: 1 });
    }

    if (settings.addressOnly || (user === undefined)) {
        user = ip;
    }

    const userPath = user+':'+path;

    internals.userPathCache.get(userPath, (getErr, value, details) => {

        if (getErr) {
            request.log([Pkg.name, 'error'], getErr);
            return done(Boom.badImplementation('error getting user-path rate limit info from cache'));
        };

        let count;
        let ttl = settings.userPathCache.expiresIn;

        if (value === null || details.isStale) {
            count = 1;
        }
        else {
            count = value + 1;
            ttl = details.ttl;
        }
        const remaining = settings.userPathLimit - count;
        internals.userPathCache.set(userPath, count, ttl, (setErr) => {

            if (setErr) {
                request.log([Pkg.name, 'error'], setErr);
                return done(Boom.badImplementation('could not set user-path rate limit in cache'));
            }

            request.plugins[internals.pluginName].userPathLimit = settings.userPathLimit;
            request.plugins[internals.pluginName].userPathRemaining = remaining;
            request.plugins[internals.pluginName].userPathReset = Date.now() + ttl;

            if (remaining < 0 && settings.recaptchaSecret !== false && request.query && request.query.recaptcha) {
                internals.verifyCaptcha(request, settings, (err, success) => {
                    if (err) {
                    return done(err);
                  }
                  return done(null, { count, remaining, reset: ttl, success });
                });
            } else {
                return done(null, { count, remaining, reset: ttl, success: false });
            }
        });
    });
};

internals.verifyCaptcha = function verifyCaptcha(request, settings, done) {

    let options = {
      hostname: settings.recaptchaOptions.hostname,
      port: settings.recaptchaOptions.port,
      path: settings.recaptchaOptions.path + '?secret=' + settings.recaptchaSecret + '&response=' + request.query.recaptcha,
      method: settings.recaptchaOptions.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    let get_request = https.request(options, (res) => {
      res.setEncoding('utf8');
      res.on('data', (body) => {
        return done(null, JSON.parse(body).success);
      });
    })

    get_request.end();
    get_request.on('error', (err) => {
      request.log([Pkg.name, 'error'], setErr);
      return done(Boom.badImplementation('could not call API recaptcha verify'));
    });
};

exports.register = function (plugin, options, next) {

    const settings = Hoek.applyToDefaults(internals.defaults, options);

    internals.userCache = plugin.cache(settings.userCache);
    internals.pathCache = plugin.cache(settings.pathCache);
    internals.userPathCache = plugin.cache(settings.userPathCache);

    plugin.ext('onPostAuth', (request, reply) => {

        const routeSettings = request.route.settings.plugins[internals.pluginName] || {};

        delete routeSettings.userCache;

        if (routeSettings.userLimit !== false) {
            delete routeSettings.userLimit;
        }

        const requestSettings = Object.assign({}, settings, routeSettings);

        request.plugins[internals.pluginName] = { requestSettings };

        if (requestSettings.enabled === false) {
            return reply.continue();
        }

        internals.pathCheck(request, requestSettings, (pathCheckErr, path) => {

            if (pathCheckErr) {
                return reply(pathCheckErr);
            }

            internals.userCheck(request, requestSettings, (userCheckErr, user) => {

                if (userCheckErr) {
                    return reply(userCheckErr);
                }

                internals.userPathCheck(request, requestSettings, (userPathCheckErr, userPath) => {

                    if (userPathCheckErr) {
                        return reply(userPathCheckErr);
                    }
                    if (path.remaining < 0 || user.remaining < 0 || (userPath.remaining < 0 && !userPath.success)) {

                        const error = Boom.tooManyRequests('Rate limit exceeded');
                        if (requestSettings.pathLimit !== false && requestSettings.headers !== false) {
                            error.output.headers['X-RateLimit-PathLimit'] = request.plugins[internals.pluginName].pathLimit;
                            error.output.headers['X-RateLimit-PathRemaining'] = request.plugins[internals.pluginName].pathRemaining;
                            error.output.headers['X-RateLimit-PathReset'] = request.plugins[internals.pluginName].pathReset;
                        }
                        if (requestSettings.userPathLimit !== false && requestSettings.headers !== false) {
                            error.output.headers['X-RateLimit-UserPathLimit'] = request.plugins[internals.pluginName].userPathLimit;
                            error.output.headers['X-RateLimit-UserPathRemaining'] = request.plugins[internals.pluginName].userPathRemaining;
                            error.output.headers['X-RateLimit-UserPathReset'] = request.plugins[internals.pluginName].userPathReset;
                        }
                        if (requestSettings.userLimit !== false && requestSettings.headers !== false) {
                            error.output.headers['X-RateLimit-UserLimit'] = request.plugins[internals.pluginName].userLimit;
                            error.output.headers['X-RateLimit-UserRemaining'] = request.plugins[internals.pluginName].userRemaining;
                            error.output.headers['X-RateLimit-UserReset'] = request.plugins[internals.pluginName].userReset;
                        }
                        return reply(error);
                    }
                    return reply.continue();
                });
            });
        });
    });

    plugin.ext('onPostHandler', (request, reply) => {

        const response = request.response;
        const requestPlugin = request.plugins[internals.pluginName];
        const requestSettings = requestPlugin.requestSettings;

        if (!response.isBoom && requestSettings.pathLimit !== false && requestSettings.headers !== false) {
            response.headers['X-RateLimit-PathLimit'] = requestPlugin.pathLimit;
            response.headers['X-RateLimit-PathRemaining'] = requestPlugin.pathRemaining;
            response.headers['X-RateLimit-PathReset'] = requestPlugin.pathReset;
        }
        if (!response.isBoom && requestSettings.userPathLimit !== false && requestSettings.headers !== false) {
            response.headers['X-RateLimit-UserPathLimit'] = requestPlugin.userPathLimit;
            response.headers['X-RateLimit-UserPathRemaining'] = requestPlugin.userPathRemaining;
            response.headers['X-RateLimit-UserPathReset'] = requestPlugin.userPathReset;
        }
        if (!response.isBoom && requestSettings.userLimit !== false && requestSettings.headers !== false) {
            response.headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit;
            response.headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining;
            response.headers['X-RateLimit-UserReset'] = requestPlugin.userReset;
        }
        reply.continue();
    });

    next();
};

exports.register.attributes = { pkg:  Pkg };
