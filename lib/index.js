'use strict';

const Boom = require('boom');
const Hoek = require('hoek');
const Pkg = require('../package.json');

const internals = {};

internals.pluginName = Pkg.name;

internals.defaults = {
    enabled: true,
    addressOnly: false,
    headers: true,
    ipWhitelist: [],
    pathCache: {
        getDecoratedValue: true,
        segment: `${internals.pluginName}-path`,
        expiresIn: 1 * 60 * 1000 //1 minute
    },
    pathLimit: 50,
    trustProxy: false,
    getIpFromProxyHeader: undefined,
    userAttribute: 'id',
    userCache: {
        getDecoratedValue: true,
        segment: `${internals.pluginName}-user`,
        expiresIn: 10 * 60 * 1000 //10 minutes
    },
    userLimit: 300,
    userWhitelist: [],
    userPathCache: {
        getDecoratedValue: true,
        segment: `${internals.pluginName}-userPath`,
        expiresIn: 1 * 60 * 1000 //1 minute
    },
    userPathLimit: false
};

internals.getUser = function getUser(request, settings) {

    if (request.auth.isAuthenticated && request.auth.credentials.hasOwnProperty(settings.userAttribute)) {
        const user = request.auth.credentials[settings.userAttribute].toString();
        return user;
    }
};

internals.getIP = function getIP(request, settings) {

    let ip;

    if (settings.trustProxy && request.headers['x-forwarded-for']) {
        if (settings.getIpFromProxyHeader) {
            ip = settings.getIpFromProxyHeader(request.headers['x-forwarded-for']);
        }
        else {
            const ips = request.headers['x-forwarded-for'].split(',');
            ip = ips[0];
        }
    }

    if (ip === undefined) {
        ip = request.info.remoteAddress;
    }

    return ip;
};

internals.pathCheck = async function (request, settings) {

    const path = request.path;

    if (settings.pathLimit === false) {
        request.plugins[internals.pluginName].pathLimit = false;
        return { remaining: 1 };
    }


    const { value, cached } = await internals.pathCache.get(path);
    let count;
    let ttl = settings.pathCache.expiresIn;

    if (value === null || cached.isStale) {
        count = 1;
    }
    else {
        count = value + 1;
        ttl = cached.ttl;
    }
    const remaining = settings.pathLimit - count;
    await internals.pathCache.set(path, count, ttl);

    request.plugins[internals.pluginName].pathLimit = settings.pathLimit;
    request.plugins[internals.pluginName].pathRemaining = remaining;
    request.plugins[internals.pluginName].pathReset = Date.now() + ttl;

    return { count, remaining, reset: settings.pathCache.expiresIn };
};

internals.userCheck = async function (request, settings) {

    const ip = internals.getIP(request, settings);
    let user = internals.getUser(request, settings);
    if (
        (settings.ipWhitelist.indexOf(ip) > -1) ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        (settings.userLimit === false)
    ) {
        request.plugins[internals.pluginName].userLimit = false;
        return { remaining: 1 };
    }

    if (settings.addressOnly || (user === undefined)) {
        user = ip;
    }

    const { value, cached } = await internals.userCache.get(user);

    let count;
    let ttl = settings.userCache.expiresIn;

    if (value === null || cached.isStale) {
        count = 1;
    }
    else {
        count = value + 1;
        ttl = cached.ttl;
    }
    const remaining = settings.userLimit - count;
    await internals.userCache.set(user, count, ttl);

    request.plugins[internals.pluginName].userLimit = settings.userLimit;
    request.plugins[internals.pluginName].userRemaining = remaining;
    request.plugins[internals.pluginName].userReset = Date.now() + ttl;

    return { count, remaining, reset: ttl };
};

internals.userPathCheck = async function (request, settings) {

    const ip = internals.getIP(request, settings);
    let user = internals.getUser(request, settings);
    const path = request.path;

    if (
        (settings.ipWhitelist.indexOf(ip) > -1) ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        (settings.userPathLimit === false)
    ) {
        request.plugins[internals.pluginName].userPathLimit = false;
        return { remaining: 1 };
    }

    if (settings.addressOnly || (user === undefined)) {
        user = ip;
    }

    const userPath = user + ':' + path;

    const { value, cached } = await internals.userPathCache.get(userPath);

    let count;
    let ttl = settings.userPathCache.expiresIn;

    if (value === null || cached.isStale) {
        count = 1;
    }
    else {
        count = value + 1;
        ttl = cached.ttl;
    }
    const remaining = settings.userPathLimit - count;
    await internals.userPathCache.set(userPath, count, ttl);

    request.plugins[internals.pluginName].userPathLimit = settings.userPathLimit;
    request.plugins[internals.pluginName].userPathRemaining = remaining;
    request.plugins[internals.pluginName].userPathReset = Date.now() + ttl;

    return { count, remaining, reset: ttl };
};

const register = function (plugin, options) {

    const settings = Hoek.applyToDefaults(internals.defaults, options);

    internals.userCache = plugin.cache(settings.userCache);
    internals.pathCache = plugin.cache(settings.pathCache);
    internals.userPathCache = plugin.cache(settings.userPathCache);

    plugin.ext('onPostAuth', async (request, h) => {

        const routeSettings = request.route.settings.plugins[internals.pluginName] || {};

        delete routeSettings.userCache;

        if (routeSettings.userLimit !== false) {
            delete routeSettings.userLimit;
        }

        const requestSettings = { ...settings, ...routeSettings };

        request.plugins[internals.pluginName] = { requestSettings };

        if (requestSettings.enabled === false) {
            return h.continue;
        }

        const [path, user, userPath] = await Promise.all([
            internals.pathCheck(request, requestSettings),
            internals.userCheck(request, requestSettings),
            internals.userPathCheck(request, requestSettings)
        ]);

        if (path.remaining < 0 || user.remaining < 0 || userPath.remaining < 0) {

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
            return error; //? or h.response(err0r);
        }
        return h.continue;
    });

    plugin.ext('onPreResponse', (request, h) => {

        const response = request.response;
        const requestPlugin = request.plugins[internals.pluginName];
        if (!requestPlugin) {
            return h.continue;
        }
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
        if (requestSettings.userLimit !== false && requestSettings.headers !== false) {

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
        return h.continue;
    });
};

module.exports = {
    register,
    pkg: Pkg
};
