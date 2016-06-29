# hapi-rate-limit

[![Build Status](https://travis-ci.org/wraithgar/hapi-rate-limit.svg?branch=master)](http://travis-ci.org/wraithgar/hapi-rate-limit)

Lead Maintainer: [Gar](https://github.com/wraithgar)

## Introduction

**hapi-rate-limit** is a plugin for [hapi](http://hapijs.com) that enables rate limiting.

It relies on `cache` being defined in the server.

## Use

```javascript
const Hapi = require('hapi');

const server = new Hapi.Server({
    cache: { engine: require('catbox-memory') }
});
server.connection();
server.register({
    register: require('hapi-rate-limit'),
    options: {}
});
```

## Options

Defaults are given here

- `userLimit`: `300` number of total requests a user can make per period. Set to `false` to disable limiting requests per user.
- `pathLimit`: `50` number of total requests that can be made on a given path per period. Set to `false` to disable limiting requests per user.
- `userCache`: Object with the following properties:
    *  `segment`: `hapi-rate-limit-user` Name of the cache segment to use for storing user rate limit info
    * `expiresIn`: `600000` Time (in seconds) of period for `userLimit`
- `pathCache`: Object with the following properties:
	- `segment`: `hapi-rate-limit-path` Name of the cache segment to use for storing path rate limit info
	- `expiresIn`: `60000` Time (in seconds) of period for `pathLimit`
- `headers`: `true` Whether or not to include headers in responses

## Users

A user is considered a single `remoteAddress` for routes that are unauthenticated. On authenticated routes it is the `id` attribute of the authenticated user.

## Headers

The following headers will be included if their respective limits are enabled

- `x-ratelimit-pathlimit`: Will equal `pathLimit`
- `x-ratelimit-pathremaining`: Remaining number of requests path has this - period
- `x-ratelimit-pathreset`: Time (in seconds) until reset of `pathLimit` period
- `x-ratelimit-userlimit`: Will equal `userLimit`
- `x-ratelimit-userremaining`: Remaining number of requests user has this period
- `x-ratelimit-userreset`: Time (in seconds) until reset of `userLimit` period

## Per-route settings

All of the settings (except for `userLimit` and `userCache`) can be overridden in your route's config.

For instance, to disable `pathLimit` for a route you would add this to its `config` attribute

```javascript
    plugins: {
        'hapi-rate-limit': {
            pathLimit: false
        }
    }
```

##

License: MIT
