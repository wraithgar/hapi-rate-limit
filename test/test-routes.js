'use strict';

module.exports = [{
    method: 'GET',
    path: '/defaults',
    config: {
        description: 'Route with no special config, letting defaults take over',
        handler: (request, reply) => {

            return reply('defaults');
        }
    }
}];
