'use strict'

const Boom = require('@hapi/boom')

module.exports = [
  {
    method: 'GET',
    path: '/defaults',
    config: {
      description: 'Route with no special config, letting defaults take over',
      handler: request => {
        return request.path
      }
    }
  },
  {
    method: 'GET',
    path: '/auth',
    config: {
      description: 'Authenticated route',
      handler: function (request) {
        return request.path
      },
      auth: {
        strategy: 'trusty'
      }
    }
  },
  {
    method: 'GET',
    path: '/addressOnly',
    config: {
      description: 'Authenticated route with addressOnly set',
      handler: function (request) {
        return request.path
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
  },
  {
    method: 'GET',
    path: '/addressOnlyUserPathLimit',
    config: {
      description: 'Authenticated route with addressOnly set with userPathLimit and no user limit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          addressOnly: true,
          userLimit: false,
          userPathLimit: 50
        }
      },
      auth: {
        strategy: 'trusty'
      }
    }
  },
  {
    method: 'GET',
    path: '/authName',
    config: {
      description: 'Authenticated route with name set as the userAttribute',
      handler: function (request) {
        return request.path
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
  },
  {
    method: 'GET',
    path: '/notfound',
    config: {
      description: 'Route that returns a 404',
      handler: function () {
        return Boom.notFound()
      }
    }
  },
  {
    method: 'GET',
    path: '/noUserLimit',
    config: {
      description: 'Route with userLimit disabled',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userLimit: false
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/noHeaders',
    config: {
      description: 'Route with rate limit headers disabled',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: true,
          headers: false
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/noPathLimit',
    config: {
      description: 'Route with pathLimit disabled',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          pathLimit: false
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/noUserPathLimit',
    config: {
      description: 'Route with userPathLimit disabled',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: false
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/setPathLimit',
    config: {
      description: 'Route with set pathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          pathLimit: 50
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/setUserPathLimit',
    config: {
      description: 'Route with set userPathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: 50
        }
      },
      auth: {
        strategy: 'trusty'
      }
    }
  },
  {
    method: 'GET',
    path: '/setUserPathLimit2',
    config: {
      description: 'Route with set userPathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: 50
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/setUserPathLimitOnly',
    config: {
      description: 'Route with set userPathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: 50,
          userLimit: false,
          pathLimit: false
        }
      },
      auth: {
        strategy: 'trusty'
      }
    }
  },
  {
    method: 'GET',
    path: '/lowPathLimit',
    config: {
      description: 'Route with very low pathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          pathLimit: 2
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/lowUserPathLimit',
    config: {
      description: 'Route with very low userPathLimit',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          userPathLimit: 2
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/trustProxy',
    config: {
      description: 'Route with trustProxy set',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          trustProxy: true
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/ipWhitelist',
    config: {
      description: 'Route with an ipWhitelist',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          ipWhitelist: ['127.0.0.1']
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/userWhitelist',
    config: {
      description: 'Route with a userWhitelist',
      handler: function (request) {
        return request.path
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
  },
  {
    method: 'GET',
    path: '/pathDisabled',
    config: {
      description: 'Route that has disabled rate limiting',
      handler: function (request) {
        return request.path
      },
      plugins: {
        'hapi-rate-limit': {
          enabled: false
        }
      }
    }
  }
]
