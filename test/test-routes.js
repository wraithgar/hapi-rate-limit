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
}];
