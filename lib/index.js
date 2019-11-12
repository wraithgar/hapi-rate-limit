'use strict';

const Joi = require('@hapi/joi');
const Pkg = require('../package.json');

const internals = require('./internals');

const register = function(plugin, options) {
    const settings = Joi.attempt(Object.assign({}, options), internals.schema);

    //We call toString on the user attribute in getUser, so we have to do it here too.
    settings.userWhitelist = settings.userWhitelist.map(user => user.toString());

    const userCache = plugin.cache(settings.userCache);
    const pathCache = plugin.cache(settings.pathCache);
    const userPathCache = plugin.cache(settings.userPathCache);

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
            internals.pathCheck(pathCache, request),
            internals.userCheck(userCache, request),
            internals.userPathCheck(userPathCache, request)
        ]);

        if (path.remaining < 0 || user.remaining < 0 || userPath.remaining < 0) {
            return requestSettings.limitExceededResponse(request, h);
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

        if (requestSettings.headers !== false) {
            if (requestSettings.pathLimit !== false) {
                if (response.isBoom) {
                    response.output.headers['X-RateLimit-PathLimit'] = requestPlugin.pathLimit;
                    response.output.headers['X-RateLimit-PathRemaining'] = requestPlugin.pathRemaining;
                    response.output.headers['X-RateLimit-PathReset'] = requestPlugin.pathReset;
                } else {
                    response.headers['X-RateLimit-PathLimit'] = requestPlugin.pathLimit;
                    response.headers['X-RateLimit-PathRemaining'] = requestPlugin.pathRemaining;
                    response.headers['X-RateLimit-PathReset'] = requestPlugin.pathReset;
                }
            }

            if (requestSettings.userPathLimit !== false) {
                if (response.isBoom) {
                    response.output.headers['X-RateLimit-UserPathLimit'] = requestPlugin.userPathLimit;
                    response.output.headers['X-RateLimit-UserPathRemaining'] = requestPlugin.userPathRemaining;
                    response.output.headers['X-RateLimit-UserPathReset'] = requestPlugin.userPathReset;
                } else {
                    response.headers['X-RateLimit-UserPathLimit'] = requestPlugin.userPathLimit;
                    response.headers['X-RateLimit-UserPathRemaining'] = requestPlugin.userPathRemaining;
                    response.headers['X-RateLimit-UserPathReset'] = requestPlugin.userPathReset;
                }
            }

            if (requestSettings.userLimit !== false) {
                if (response.isBoom) {
                    response.output.headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit;
                    response.output.headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining;
                    response.output.headers['X-RateLimit-UserReset'] = requestPlugin.userReset;
                } else {
                    response.headers['X-RateLimit-UserLimit'] = requestPlugin.userLimit;
                    response.headers['X-RateLimit-UserRemaining'] = requestPlugin.userRemaining;
                    response.headers['X-RateLimit-UserReset'] = requestPlugin.userReset;
                }
            }
        }

        return h.continue;
    });
};

module.exports = {
    register,
    pkg: Pkg
};
