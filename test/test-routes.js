'use strict';

const Boom = require('boom');

module.exports = [{
    method: 'GET',
    path: '/defaults',
    config: {
        description: 'Route with no special config, letting defaults take over',
        handler: (request, reply) => {

            return reply(request.path);
        }
    }
}, {
    method: 'GET',
    path: '/auth',
    config: {
        description: 'Authenticated route',
        handler: (request, reply) => {

            return reply(request.path);
        },
        auth: {
            strategy: 'trusty'
        }
    }
}, {
    method: 'GET',
    path: '/addressOnly',
    config: {
        description: 'Authenticated route with addressOnly set',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                addressOnly: true
            }
        },
        auth: {
            strategy: 'trusty'
        }
    }
}, {
    method: 'GET',
    path: '/authName',
    config: {
        description: 'Authenticated route with name set as the userAttribute',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                userAttribute: 'name'
            }
        },
        auth: {
            strategy: 'trusty'
        }
    }
}, {
    method: 'GET',
    path: '/notfound',
    config: {
        description: 'Route that returns a 404',
        handler: (request, reply) => {

            return reply(Boom.notFound());
        }
    }
}, {
    method: 'GET',
    path: '/noUserLimit',
    config: {
        description: 'Route with userLimit disabled',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                userLimit: false
            }
        }
    }
}, {
    method: 'GET',
    path: '/noHeaders',
    config: {
        description: 'Route with rate limit headers disabled',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                headers: false
            }
        }
    }
}, {
    method: 'GET',
    path: '/noPathLimit',
    config: {
        description: 'Route with pathLimit disabled',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                pathLimit: false
            }
        }
    }
}, {
    method: 'GET',
    path: '/setPathLimit',
    config: {
        description: 'Route with set pathLimit',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                pathLimit: 50
            }
        }
    }
}, {
    method: 'GET',
    path: '/lowPathLimit',
    config: {
        description: 'Route with very low pathLimit',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                pathLimit: 2
            }
        }
    }
}, {
    method: 'GET',
    path: '/trustProxy',
    config: {
        description: 'Route with trustProxy set',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                trustProxy: true
            }
        }
    }
}, {
    method: 'GET',
    path: '/ipWhitelist',
    config: {
        description: 'Route with an ipWhitelist',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                ipWhitelist: ['127.0.0.1']
            }
        }
    }
}, {
    method: 'GET',
    path: '/userWhitelist',
    config: {
        description: 'Route with a userWhitelist',
        handler: (request, reply) => {

            return reply(request.path);
        },
        plugins: {
            'hapi-rate-limit': {
                userWhitelist: ['1']
            }
        },
        auth: {
            strategy: 'trusty'
        }
    }
}];
