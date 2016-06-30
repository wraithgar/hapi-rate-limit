'use strict';

const Boom = require('boom');
const Hoek = require('hoek');
const Pkg = require('../package.json');

const internals = {};

internals.pluginName = Pkg.name;

internals.defaults = {
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
    userWhitelist: []
};

internals.getUser = function getUser(request, settings) {

    if (request.auth.isAuthenticated && request.auth.credentials.hasOwnProperty(settings.userAttribute)) {
        return request.auth.credentials[settings.userAttribute];
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
            count = 0;
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
            request.plugins[internals.pluginName].pathReset = new Date(Date.now() + ttl);

            return done(null, { count: count, remaining: remaining, reset: settings.pathCache.expiresIn });
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
            count = 0;
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

        const routeSettings = request.route.settings.plugins[internals.pluginName] || {};

        delete routeSettings.userCache;

        if (routeSettings.userLimit !== false) {
            delete routeSettings.userLimit;
        }

        const requestSettings = Object.assign({}, settings, routeSettings);

        request.plugins[internals.pluginName] = { requestSettings: requestSettings };

        internals.pathCheck(request, requestSettings, (pathCheckErr, path) => {

            if (pathCheckErr) {
                return reply(pathCheckErr);
            }

            internals.userCheck(request, requestSettings, (userCheckErr, user) => {

                if (userCheckErr) {
                    return reply(userCheckErr);
                }

                if (path.remaining < 1 || user.remaining < 1) {

                    const error = Boom.tooManyRequests('Rate limit exceeded');
                    if (requestSettings.pathLimit !== false && requestSettings.headers !== false) {
                        error.output.headers['X-RateLimit-PathLimit'] = request.plugins[internals.pluginName].pathLimit;
                        error.output.headers['X-RateLimit-PathRemaining'] = request.plugins[internals.pluginName].pathRemaining;
                        error.output.headers['X-RateLimit-PathReset'] = request.plugins[internals.pluginName].pathReset;
                    }
                    return reply(error);
                }
                return reply.continue();
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
        if (requestSettings.userLimit !== false && requestSettings.headers !== false && requestPlugin.userLimit !== false) {
            if (response.isBoom) {
                response.output.headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit;
                response.output.headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining;
                response.output.headers['X-RateLimit-UserReset'] = requestPlugin.userReset;
            }
            else {
                response.headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit;
                response.headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining;
                response.headers['X-RateLimit-UserReset'] = requestPlugin.userReset;
            }
        }
        reply.continue();
    });

    next();
};

exports.register.attributes = { pkg:  Pkg };
