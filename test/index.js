'use strict';

const lab = (exports.lab = require('@hapi/lab').script());
const expect = require('@hapi/code').expect;

const beforeEach = lab.beforeEach;
const describe = lab.describe;
const it = lab.it;
const { promisify } = require('util');

const timeout = promisify(setTimeout);

const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');
const HapiRateLimit = require('../');

describe('hapi-rate-limit', () => {
    describe('defaults', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        if (request.query.fail) {
                            return h.unauthenticated(Boom.unauthorized(), { credentials: {}, artifacts: request.query })
                        }
                        if (request.query.error) {
                            throw Boom.notAcceptable(null, request.query)
                        }
                        return h.authenticated({
                            credentials: { ...request.query }
                        });
                    }
                };
            });
            server.auth.strategy('trusty', 'trusty');

            await server.register(HapiRateLimit);

            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('no route settings', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/defaults' });

            expect(res.statusCode).to.equal(200);
            const pathReset = res.headers['x-ratelimit-pathreset'];
            const userReset = res.headers['x-ratelimit-userreset'];

            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-pathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-pathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-pathreset'] - Date.now()).to.be.within(59900, 60100);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(300);
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
            expect(res.headers['x-ratelimit-userreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-userreset'] - Date.now()).to.be.within(599900, 600100);

            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-pathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(48);
            expect(res.headers['x-ratelimit-pathreset'] - pathReset).to.be.within(-100, 100);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(300);
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);
            expect(res.headers['x-ratelimit-userreset'] - userReset).to.be.within(-100, 100);
        });

        it('authenticated request', async () => {
            let res;

            res = await server.inject({ method: 'GET', url: '/auth?id=1' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({ method: 'GET', url: '/auth?id=1' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({ method: 'GET', url: '/auth?id=2' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

        })

        it('bad auth tokens', async () => {

            let res
            await server.inject({ method: 'GET', url: '/auth?authToken=one&id=3&fail=true' })
            await server.inject({ method: 'GET', url: '/auth?authToken=two&id=3&fail=true' })
            await server.inject({ method: 'GET', url: '/auth?authToken=three&id=3&fail=true' })
            await server.inject({ method: 'GET', url: '/auth?authToken=four&id=3&fail=true' })
            await server.inject({ method: 'GET', url: '/auth?authToken=five&id=3&fail=true' })
            await server.inject({ method: 'GET', url: '/auth?authToken=six&id=3&fail=true' })
            // token list is now over the default limit of 5

            res = await server.inject({ method: 'GET', url: '/auth?authToken=seven&id=3&fail=true' })
            expect(res.statusCode).to.equal(429)

            await server.inject({ method: 'GET', url: '/auth?authToken=one&id=4&error=true', remoteAddress: '127.0.0.2' })
            await server.inject({ method: 'GET', url: '/auth?authToken=two&id=4&error=true', remoteAddress: '127.0.0.2' })
            await server.inject({ method: 'GET', url: '/auth?authToken=three&id=4&error=true', remoteAddress: '127.0.0.2' })
            await server.inject({ method: 'GET', url: '/auth?authToken=four&id=4&error=true', remoteAddress: '127.0.0.2' })
            await server.inject({ method: 'GET', url: '/auth?authToken=five&id=4&error=true', remoteAddress: '127.0.0.2' })
            await server.inject({ method: 'GET', url: '/auth?authToken=six&id=4&error=true', remoteAddress: '127.0.0.2' })

            // token list is now over the default limit of 5
            res = await server.inject({ method: 'GET', url: '/auth?authToken=seven&id=4&error=true', remoteAddress: '127.0.0.2' })
        });

        it('user with missing userAttribute', async () => {
            let res;

            res = await server.inject({ method: 'GET', url: '/auth?uuid=1' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({ method: 'GET', url: '/auth?uuid=1' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({ method: 'GET', url: '/auth?uuid=2' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(297);
        });

        it('route configured user attribute', async () => {
            let res;

            res = await server.inject({
                method: 'GET',
                url: '/authName?id=1&name=foo'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({
                method: 'GET',
                url: '/authName?id=1&name=foo'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({
                method: 'GET',
                url: '/authName?id=1&name=bar'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

        it('route configured addressOnly', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/addressOnly?id=3'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({
                method: 'GET',
                url: '/addressOnly?id=3'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);
            res = await server.inject({
                method: 'GET',
                url: '/addressOnly?id=4'
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(297);
        });

        it('route configured addressOnly for userPathLimit', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/addressOnlyUserPathLimit?id=3'
            });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);

            res = await server.inject({
                method: 'GET',
                url: '/addressOnlyUserPathLimit?id=3'
            });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(48);

            res = await server.inject({
                method: 'GET',
                url: '/addressOnlyUserPathLimit?id=4'
            });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(47);
        });

        it('route disabled pathLimit', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/noPathLimit'
            });
            expect(res.headers).to.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
        });

        it('route disabled userLimit', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/noUserLimit'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
        });

        it('route disabled userPathLimit', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/noUserPathLimit'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
            expect(res.headers).to.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
        });

        it('route configured pathLimit', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/setPathLimit' });
            const pathReset = res.headers['x-ratelimit-pathreset'];
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers['x-ratelimit-pathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-pathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-pathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({ method: 'GET', url: '/setPathLimit' });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers['x-ratelimit-pathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(48);
            expect(res.headers['x-ratelimit-pathreset'] - pathReset).to.be.within(-100, 100);
        });

        it('runs out of pathLimit', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(1);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.statusCode).to.equal(429);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(-1);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.statusCode).to.equal(429);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(-1);
        });

        it('route configured userPathLimit', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/setUserPathLimit?id=1'
            });
            const userPathReset = res.headers['x-ratelimit-userpathreset'];
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-userpathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({
                method: 'GET',
                url: '/setUserPathLimit2?id=1'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-userpathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({
                method: 'GET',
                url: '/setUserPathLimit?id=1'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(48);
            expect(res.headers['x-ratelimit-userpathreset'] - userPathReset).to.be.within(-100, 100);
        });

        it('runs out of userPathLimit', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/lowUserPathLimit'
            });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(1);

            res = await server.inject({
                method: 'GET',
                url: '/lowUserPathLimit'
            });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(0);

            res = await server.inject({
                method: 'GET',
                url: '/lowUserPathLimit'
            });
            expect(res.statusCode).to.equal(429);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(-1);

            res = await server.inject({
                method: 'GET',
                url: '/lowUserPathLimit'
            });
            expect(res.statusCode).to.equal(429);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(-1);
        });

        it('route configured no headers', async () => {
            let res = await server.inject({ method: 'GET', url: '/noHeaders' });
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
            res = await server.inject({ method: 'GET', url: '/noHeaders' });
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
        });

        it('404 reply from handler', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/notfound' });
            expect(res.statusCode).to.equal(404);
            expect(res.headers).to.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);

            const userCount = res.headers['x-ratelimit-userremaining'];

            res = await server.inject({ method: 'GET', url: '/notfound' });
            expect(userCount - res.headers['x-ratelimit-userremaining']).to.equal(1);
        });

        it('404 reply from internal hapi catchall', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/notinroutingtable'
            });
            expect(res.statusCode).to.equal(404);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userpathlimit',
                'x-ratelimit-userpathremaining',
                'x-ratelimit-userpathreset'
            ]);
        });

        it('route configured trustProxy', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/trustProxy',
                headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' }
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({
                method: 'GET',
                url: '/trustProxy',
                headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' }
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({ method: 'GET', url: '/trustProxy' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

        it('route configured ipWhitelist', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/ipWhitelist',
                headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' }
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
        });

        it('route configured userWhitelist', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/userWhitelist?id=1'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);

            res = await server.inject({
                method: 'GET',
                url: '/userWhitelist?id=2'
            });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset',
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

        it('multiple plugin registrations do not share cache instances', async () => {
            const secondServer = Hapi.server({
                autoListen: false
            });

            secondServer.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: { ...request.query }
                        });
                    }
                };
            });
            secondServer.auth.strategy('trusty', 'trusty');

            await secondServer.register(HapiRateLimit);

            secondServer.route(require('./test-routes'));
            await secondServer.initialize();

            let res;
            res = await server.inject({ method: 'GET', url: '/defaults' });

            res = await secondServer.inject({
                method: 'GET',
                url: '/defaults'
            });
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });
    });

    describe('configured user limit', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.events.on({ name: 'request', channels: ['error'] }, (request, event) => {
                console.log(event.error);
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: {
                                id: request.query.id,
                                name: request.query.name
                            }
                        });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        userLimit: 2,
                        userCache: {
                            expiresIn: 500
                        }
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('runs out of configured userLimit', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);

            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.statusCode).to.equal(429);
            await timeout(1000);
            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);
        });

        it('disabled path limit runs out of userLimit', async () => {
            await server.inject({ method: 'GET', url: '/noPathLimit' });
            await server.inject({ method: 'GET', url: '/noPathLimit' });
            const res = await server.inject({
                method: 'GET',
                url: '/noPathLimit'
            });
            expect(res.statusCode).to.equal(429);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
        });
    });

    describe('disable authLimit', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.unauthenticated(Boom.unauthorized(), { credentials: {}, artifacts: request.query })
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        authLimit: false
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });


        it('bad auth tokens', async () => {

            let res
            await server.inject({ method: 'GET', url: '/auth?authToken=one&id=3' })
            await server.inject({ method: 'GET', url: '/auth?authToken=two&id=3' })
            await server.inject({ method: 'GET', url: '/auth?authToken=three&id=3' })
            await server.inject({ method: 'GET', url: '/auth?authToken=four&id=3' })
            await server.inject({ method: 'GET', url: '/auth?authToken=five&id=3' })
            await server.inject({ method: 'GET', url: '/auth?authToken=six&id=3' })

            res = await server.inject({ method: 'GET', url: '/auth?authToken=seven&id=3' })
            expect(res.statusCode).to.equal(401)
        });
    })

    describe('disabled routes', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: {
                                id: request.query.id,
                                name: request.query.name
                            }
                        });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        userLimit: 1,
                        pathLimit: 1,
                        userCache: {
                            expiresIn: 500
                        }
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('route disabled', async () => {
            const res = await server.inject({
                method: 'GET',
                url: '/pathDisabled'
            });

            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit',
                'x-ratelimit-userremaining',
                'x-ratelimit-userreset'
            ]);
        });
    });

    describe('configured user limit with numeric id', () => {
        let server;
        let id = 10;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({ credentials: { id } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        userLimit: 2,
                        userCache: {
                            expiresIn: 500
                        },
                        userWhitelist: [12]
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('runs out of configured userLimit', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/auth' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);

            res = await server.inject({ method: 'GET', url: '/auth' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/auth' });
            expect(res.statusCode).to.equal(429);
            await timeout(1000);
            res = await server.inject({ method: 'GET', url: '/auth' });

            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);
        });

        it('disabled path limit runs out of userLimit', async () => {
            await server.inject({ method: 'GET', url: '/noPathLimit' });
            await server.inject({ method: 'GET', url: '/noPathLimit' });
            const res = await server.inject({
                method: 'GET',
                url: '/noPathLimit'
            });

            expect(res.statusCode).to.equal(429);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit',
                'x-ratelimit-pathremaining',
                'x-ratelimit-pathreset'
            ]);

            id = 12;
        });

        it('disabled user limit with userWhitelist', async () => {
            const res = await server.inject({ method: 'GET', url: '/auth' });
            expect(res.headers['x-ratelimit-userlimit']).to.equal(false);
            expect(res.headers).to.not.include(['x-ratelimit-userremaining', 'x-ratelimit-userreset']);
        });
    });

    describe('custom get ip from proxy header which returns the last one', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: {
                                id: request.query.id,
                                name: request.query.name
                            }
                        });
                    }
                };
            });
            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        getIpFromProxyHeader: xForwardedFor => xForwardedFor.split(',')[1] // Take always the second one
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('increases the user remaining only when the last ip in the x-forwarded-for header changes', async () => {
            let res;
            res = await server.inject({
                method: 'GET',
                url: '/trustProxy',
                headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' }
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({
                method: 'GET',
                url: '/trustProxy',
                headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.3' }
            });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });
    });

    describe('configured user limit with strings joi converts to primatives', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.events.on({ name: 'request', channels: ['error'] }, (request, event) => {
                console.log(event.error);
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: {
                                id: request.query.id,
                                name: request.query.name
                            }
                        });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        userLimit: '2',
                        userCache: {
                            expiresIn: '500'
                        },
                        userPathLimit: 'false',
                        pathLimit: 'false'
                    }
                }
            ]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('runs out of configured userLimit using strings', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);

            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.statusCode).to.equal(429);
            await timeout(1000);
            res = await server.inject({ method: 'GET', url: '/defaults' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);
        });
    });

    describe('configured limit exceeded response', () => {
        let server;

        beforeEach(async () => {
            server = Hapi.server({
                autoListen: false
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: { ...request.query }
                        });
                    }
                };
            });
            server.auth.strategy('trusty', 'trusty');

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        limitExceededResponse: function(request, h) {
                            return h
                                .response('custom response')
                                .code(477)
                                .takeover();
                        }
                    }
                }
            ]);

            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('gets correct responses with rate limiting headers', async () => {
            let res;
            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(1);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.result).to.equal('custom response');
            expect(res.statusCode).to.equal(477);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(-1);

            res = await server.inject({ method: 'GET', url: '/lowPathLimit' });
            expect(res.result).to.equal('custom response');
            expect(res.statusCode).to.equal(477);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(-1);
        });
    });

    describe('configured cache', () => {
        let server;
        const localIp = '127.0.0.1';

        const configureWithCacheName = async cacheName => {
            const userCache = { segment: 'default' };
            const cache = { provider: require('catbox-memory') };

            if (cacheName) {
                userCache.segment = cacheName;
                userCache.cache = cacheName;

                cache.name = cacheName;
            }

            server = Hapi.server({
                autoListen: false
            });

            server.cache.provision(cache);

            server.events.on({ name: 'request', channels: ['error'] }, (request, event) => {
                console.log(event.error);
            });

            server.auth.scheme('trusty', () => {
                return {
                    authenticate: function(request, h) {
                        return h.authenticated({
                            credentials: {
                                id: request.query.id,
                                name: request.query.name
                            }
                        });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');
            server.route(require('./test-routes'));

            await server.register([
                {
                    plugin: HapiRateLimit,
                    options: {
                        addressOnly: true,
                        userCache,
                        userPathLimit: false,
                        pathLimit: false
                    }
                }
            ]);
            await server.initialize();
        };

        it('uses non-default hapi cache', async () => {
            const cacheName = 'a-custom-cache-name';
            await configureWithCacheName(cacheName);

            const rateLimitCache = server.cache({
                segment: cacheName,
                cache: cacheName,
                shared: true
            });
            const defaultCache = server.cache({
                segment: 'default',
                shared: true
            });

            await server.inject({ method: 'GET', url: '/addressOnly?id=1' });
            expect(await rateLimitCache.get(localIp)).to.equal(1);
            expect(await defaultCache.get(localIp)).to.be.null();

            await server.inject({ method: 'GET', url: '/addressOnly?id=1' });
            expect(await rateLimitCache.get(localIp)).to.equal(2);
            expect(await defaultCache.get(localIp)).to.be.null();
        });

        it('uses default hapi cache when not defined', async () => {
            await configureWithCacheName();

            const defaultCache = server.cache({
                segment: 'default',
                shared: true
            });

            await server.inject({ method: 'GET', url: '/addressOnly?id=1' });
            expect(await defaultCache.get(localIp)).to.equal(1);

            await server.inject({ method: 'GET', url: '/addressOnly?id=1' });
            expect(await defaultCache.get(localIp)).to.equal(2);
        });
    });
});
