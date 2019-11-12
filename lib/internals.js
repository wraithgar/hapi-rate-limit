const Pkg = require('../package.json');

const Boom = require('@hapi/boom');
const Hoek = require('@hapi/hoek');
const Joi = require('@hapi/joi');

const pluginName = Pkg.name;

const schema = Joi.object({
    enabled: Joi.boolean().default(true),
    addressOnly: Joi.boolean().default(false),
    headers: Joi.boolean().default(true),
    ipWhitelist: Joi.array().default([]),
    pathCache: Joi.object({
        getDecoratedValue: Joi.boolean().default(true),
        cache: Joi.string().optional(),
        segment: Joi.string().default(`${pluginName}-path`),
        expiresIn: Joi.number().default(1 * 60 * 1000) //1 minute
    }).default(),
    pathLimit: Joi.alternatives()
        .try(Joi.boolean(), Joi.number())
        .default(50),
    trustProxy: Joi.boolean().default(false),
    getIpFromProxyHeader: Joi.func().default(null),
    userAttribute: Joi.string().default('id'),
    userCache: Joi.object({
        getDecoratedValue: Joi.boolean().default(true),
        cache: Joi.string().optional(),
        segment: Joi.string().default(`${pluginName}-user`),
        expiresIn: Joi.number().default(10 * 60 * 1000) //10 minutes
    }).default(),
    userLimit: Joi.alternatives()
        .try(Joi.boolean(), Joi.number())
        .default(300),
    userWhitelist: Joi.array().default([]),
    userPathCache: Joi.object({
        getDecoratedValue: Joi.boolean().default(true),
        cache: Joi.string().optional(),
        segment: Joi.string().default(`${pluginName}-userPath`),
        expiresIn: Joi.number().default(1 * 60 * 1000) //1 minute
    }).default(),
    userPathLimit: Joi.alternatives()
        .try(Joi.boolean(), Joi.number())
        .default(false),
    limitExceededResponse: Joi.func().default(() => {
        return limitExceededResponse;
    })
});

function getUser(request, settings) {
    if (request.auth.isAuthenticated) {
        const user = Hoek.reach(request.auth.credentials, settings.userAttribute);
        if (user !== undefined) {
            return user.toString();
        }
    }
}

function getIP(request, settings) {
    let ip;

    if (settings.trustProxy && request.headers['x-forwarded-for']) {
        if (settings.getIpFromProxyHeader) {
            ip = settings.getIpFromProxyHeader(request.headers['x-forwarded-for']);
        } else {
            const ips = request.headers['x-forwarded-for'].split(',');
            ip = ips[0];
        }
    }

    if (ip === undefined) {
        ip = request.info.remoteAddress;
    }

    return ip;
}

async function pathCheck(pathCache, request) {
    const path = request.path;
    const plugin = request.plugins[pluginName];
    const settings = plugin.requestSettings;

    if (settings.pathLimit === false) {
        plugin.pathLimit = false;
        return { remaining: 1 };
    }

    const { value, cached } = await pathCache.get(path);
    let count;
    let ttl = settings.pathCache.expiresIn;

    /* $lab:coverage:off$ */
    if (value === null || cached.isStale) {
        /* $lab:coverage:on$ */
        count = 1;
    } else {
        count = value + 1;
        ttl = cached.ttl;
    }

    let remaining = settings.pathLimit - count;
    if (remaining < 0) {
        remaining = -1;
    }

    await pathCache.set(path, count, ttl);

    plugin.pathLimit = settings.pathLimit;
    plugin.pathRemaining = remaining;
    plugin.pathReset = Date.now() + ttl;

    return { count, remaining, reset: settings.pathCache.expiresIn };
}

async function userCheck(userCache, request) {
    const plugin = request.plugins[pluginName];
    const settings = plugin.requestSettings;
    const ip = getIP(request, settings);
    let user = getUser(request, settings);
    if (
        settings.ipWhitelist.indexOf(ip) > -1 ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        settings.userLimit === false
    ) {
        plugin.userLimit = false;
        return { remaining: 1 };
    }

    if (settings.addressOnly || user === undefined) {
        user = ip;
    }

    const { value, cached } = await userCache.get(user);

    let count;
    let ttl = settings.userCache.expiresIn;

    /* $lab:coverage:off$ */
    if (value === null || cached.isStale) {
        /* $lab:coverage:on$ */
        count = 1;
    } else {
        count = value + 1;
        ttl = cached.ttl;
    }

    let remaining = settings.userLimit - count;
    if (remaining < 0) {
        remaining = -1;
    }

    await userCache.set(user, count, ttl);

    plugin.userLimit = settings.userLimit;
    plugin.userRemaining = remaining;
    plugin.userReset = Date.now() + ttl;

    return { count, remaining, reset: ttl };
}

async function userPathCheck(userPathCache, request) {
    const plugin = request.plugins[pluginName];
    const settings = plugin.requestSettings;
    const ip = getIP(request, settings);
    let user = getUser(request, settings);
    const path = request.path;

    if (
        settings.ipWhitelist.indexOf(ip) > -1 ||
        (user && settings.userWhitelist.indexOf(user) > -1) ||
        settings.userPathLimit === false
    ) {
        plugin.userPathLimit = false;
        return { remaining: 1 };
    }

    if (settings.addressOnly || user === undefined) {
        user = ip;
    }

    const userPath = `${user}:${path}`;

    const { value, cached } = await userPathCache.get(userPath);

    let count;
    let ttl = settings.userPathCache.expiresIn;

    /* $lab:coverage:off$ */
    if (value === null || cached.isStale) {
        /* $lab:coverage:on$ */
        count = 1;
    } else {
        count = value + 1;
        ttl = cached.ttl;
    }

    let remaining = settings.userPathLimit - count;
    if (remaining < 0) {
        remaining = -1;
    }

    await userPathCache.set(userPath, count, ttl);

    plugin.userPathLimit = settings.userPathLimit;
    plugin.userPathRemaining = remaining;
    plugin.userPathReset = Date.now() + ttl;

    return { count, remaining, reset: ttl };
}

function limitExceededResponse() {
    return Boom.tooManyRequests('Rate limit exceeded');
}

module.exports = {
    getIP,
    getUser,
    limitExceededResponse,
    pathCheck,
    pluginName,
    schema,
    userCheck,
    userPathCheck
};
