'use strict';

const lab = exports.lab = require('lab').script();
const expect = require('code').expect;
const beforeEach = lab.beforeEach;
const describe = lab.describe;
const it = lab.it;
const { promisify } = require('util');
const timeout = promisify(setTimeout);

const Hapi = require('hapi');
const HapiRateLimit = require('../');

describe('hapi-rate-limit', () => {

    describe('defaults', () => {

        let server;

        beforeEach(async () => {

            server = Hapi.server({
                autoListen: false,
                cache: { engine: require('catbox-memory'), name: 'memory' }
            });

            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, h) {

                        return h.authenticated({ credentials: { id: request.query.id, name: request.query.name } });
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
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
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
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
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
        });

        it('route configured user attribute', async () => {

            let res;

            res = await server.inject({ method: 'GET', url: '/authName?id=1&name=foo' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({ method: 'GET', url: '/authName?id=1&name=foo' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({ method: 'GET', url: '/authName?id=1&name=bar' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

        it('route configured addressOnly', async() => {

            let res;
            res = await server.inject({ method: 'GET', url: '/addressOnly?id=3' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({ method: 'GET', url: '/addressOnly?id=3' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);
            res = await server.inject({ method: 'GET', url: '/addressOnly?id=4' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(297);
        });

        it('route configured addressOnly for userPathLimit', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=3' });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);

            res = await server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=3' });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(48);

            res = await server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=4' });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(47);
        });

        it('route disabled pathLimit', async () => {

            const res = await server.inject({ method: 'GET', url: '/noPathLimit' });
            expect(res.headers).to.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
            expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
        });

        it('route disabled userLimit', async () => {

            const res = await server.inject({ method: 'GET', url: '/noUserLimit' });
            expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
        });

        it('route disabled userPathLimit', async () => {

            const res = await server.inject({ method: 'GET', url: '/noUserPathLimit' });
            expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            expect(res.headers).to.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
            expect(res.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
        });

        it('route configured pathLimit', async () => {

            let res
            res = await server.inject({ method: 'GET', url: '/setPathLimit' })
            const pathReset = res.headers['x-ratelimit-pathreset'];
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers['x-ratelimit-pathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-pathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-pathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-pathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({ method: 'GET', url: '/setPathLimit' })
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
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
        });

        it('route configured userPathLimit', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' });
            const userPathReset = res.headers['x-ratelimit-userpathreset'];
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-userpathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({ method: 'GET', url: '/setUserPathLimit2?id=1' });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(49);
            expect(res.headers['x-ratelimit-userpathreset']).to.be.a.number();
            expect(res.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

            res = await server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);
            expect(res.headers['x-ratelimit-userpathlimit']).to.equal(50);
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(48);
            expect(res.headers['x-ratelimit-userpathreset'] - userPathReset).to.be.within(-100, 100);
        });

        it('runs out of userPathLimit', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/lowUserPathLimit' });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(1);

            res = await server.inject({ method: 'GET', url: '/lowUserPathLimit' });
            expect(res.headers['x-ratelimit-userpathremaining']).to.equal(0);

            res = await server.inject({ method: 'GET', url: '/lowUserPathLimit' });
            expect(res.statusCode).to.equal(429);
        });

        it('route configured no headers', async () => {

            const res = await server.inject({ method: 'GET', url: '/noHeaders' });
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);
        });

        it('404 reply from handler', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/notfound' });
            expect(res.statusCode).to.equal(404);
            expect(res.headers).to.include([
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);

            const userCount = res.headers['x-ratelimit-userremaining'];

            res = await server.inject({ method: 'GET', url: '/notfound' });
            expect(userCount - res.headers['x-ratelimit-userremaining']).to.equal(1);
        });

        it('404 reply from internal hapi catchall', async () => {

            const res = await server.inject({ method: 'GET', url: '/notinroutingtable' });
            expect(res.statusCode).to.equal(404);
            expect(res.headers).to.not.include([
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers).to.not.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
            ]);
        });

        //I suspect this isn't needed cause we don't catch errors anymore
        //it('bad data in path cache', async () => {

            //const pathCache = server.cache({ segment: 'hapi-rate-limit-path', shared: true });
            //await pathCache.set('/defaults', 'replaced', 100000;

            //pathCache._cache.connection.cache['hapi-rate-limit-path']['/defaults'] = '{bad json}';

                //server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                    //expect(res.statusCode).to.equal(500);
                    //pathCache.set('/defaults', 0, 10000, (err) => {

                        //expect(err).to.not.exist();
                        //done();
                    //});
                //});
            //});
        //});

        //it('bad data in userPath cache', (done) => {

            //const userPathCache = server.cache({ segment: 'hapi-rate-limit-userPath', shared: true });
            //userPathCache.set('1:/setUserPathLimit', 'replaced', 10000, (err) => {

                //expect(err).to.not.exist();
                //userPathCache._cache.connection.cache['hapi-rate-limit-userPath']['1:/setUserPathLimit'] = '{bad json}';

                //server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' }, (res) => {

                    //expect(res.statusCode).to.equal(500);
                    //userPathCache.set('1:/setUserPathLimit', 0, 10000, (err) => {

                        //expect(err).to.not.exist();
                        //done();
                    //});
                //});
            //});
        //});

        //it('path cache full', (done) => {

            //const pathCache = server.cache({ segment: 'hapi-rate-limit-path', shared: true });
            //const cacheSize = pathCache._cache.connection.settings.maxByteSize;
            //pathCache._cache.connection.settings.maxByteSize = 10;

            //server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                //expect(res.statusCode).to.equal(500);
                //pathCache._cache.connection.settings.maxByteSize = cacheSize;
                //done();
            //});
        //});

        //it('userPath cache full', (done) => {

            //const userPathCache = server.cache({ segment: 'hapi-rate-limit-userPath', shared: true });
            //const cacheSize = userPathCache._cache.connection.settings.maxByteSize;
            //userPathCache._cache.connection.settings.maxByteSize = 10;

            //server.inject({ method: 'GET', url: '/setUserPathLimitOnly?id=1' }, (res) => {

                //expect(res.statusCode).to.equal(500);
                //userPathCache._cache.connection.settings.maxByteSize = cacheSize;
                //done();
            //});
        //});

        //it('bad data in user cache', (done) => {

            //const userCache = server.cache({ segment: 'hapi-rate-limit-user', shared: true });
            //userCache.set('127.0.0.1', 'asdf', 10000, (err) => {

                //expect(err).to.not.exist();
                //userCache._cache.connection.cache['hapi-rate-limit-user']['127.0.0.1'] = '{bad json}';

                //server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                    //expect(res.statusCode).to.equal(500);
                    //userCache.set('127.0.0.1', 0, 10000, (err) => {

                        //expect(err).to.not.exist();
                        //done();
                    //});
                //});
            //});
        //});

        //it('user cache full', (done) => {

            //const userCache = server.cache({ segment: 'hapi-rate-limit-user', shared: true });
            //const cacheSize = userCache._cache.connection.settings.maxByteSize;
            //userCache._cache.connection.settings.maxByteSize = 10;

            //server.inject({ method: 'GET', url: '/noPathLimit' }, (res) => {

                //expect(res.statusCode).to.equal(500);
                //userCache._cache.connection.settings.maxByteSize = cacheSize;
                //done();
            //});
        //});

        it('route configured trustProxy', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/trustProxy', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);

            res = await server.inject({ method: 'GET', url: '/trustProxy', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(298);

            res = await server.inject({ method: 'GET', url: '/trustProxy' });
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

        it('route configured ipWhitelist', async () => {

            const res = await server.inject({ method: 'GET', url: '/ipWhitelist', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } });
            expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
        });

        it('route configured userWhitelist', async () => {

            let res;
            res = await server.inject({ method: 'GET', url: '/userWhitelist?id=1' });
            expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);

            res = await server.inject({ method: 'GET', url: '/userWhitelist?id=2' });
            expect(res.headers).to.include([
                'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
            ]);
            expect(res.headers['x-ratelimit-userremaining']).to.equal(299);
        });

    });

    describe('configured user limit', () => {

        let server;

        beforeEach(async () => {

            server = Hapi.server({
                autoListen: false,
                cache: { engine: require('catbox-memory') }
            });

            server.events.on({ name: 'request', channels: ['error'] }, (request, event) => {

                console.log(event.error);
            });

            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        return h.authenticated({ credentials: { id: request.query.id, name: request.query.name } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([{
                plugin: HapiRateLimit,
                options: {
                    userLimit: 2,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]);
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
            const res = await server.inject({ method: 'GET', url: '/noPathLimit' });
            expect(res.statusCode).to.equal(429);
            expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
        });

    });

    describe('disabled routes', () => {

        let server;

        beforeEach(async () => {

            server = Hapi.server({
                autoListen: false,
                cache: { engine: require('catbox-memory') }
            });

            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        return h.authenticated({ credentials: { id: request.query.id, name: request.query.name } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([{
                plugin: HapiRateLimit,
                options: {
                    userLimit: 1,
                    pathLimit: 1,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]);
            server.route(require('./test-routes'));
            await server.initialize();
        });

        it('route disabled', async () => {

            const res = await server.inject({ method: 'GET', url: '/pathDisabled' });

            expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
        });
    });

    describe('configured user limit with numeric id', () => {

        let server;

        beforeEach(async () => {

            server = Hapi.server({
                autoListen: false,
                cache: { engine: require('catbox-memory') }
            });

            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, h) {

                        return h.authenticated({ credentials: { id: 10 } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            await server.register([{
                plugin: HapiRateLimit,
                options: {
                    userLimit: 2,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]);
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
            await timeout(1000)
            res = await server.inject({ method: 'GET', url: '/auth' });

            expect(res.headers['x-ratelimit-userremaining']).to.equal(1);
            expect(res.headers['x-ratelimit-userlimit']).to.equal(2);
        });

        it('disabled path limit runs out of userLimit', async () => {

            await server.inject({ method: 'GET', url: '/noPathLimit' });
                await server.inject({ method: 'GET', url: '/noPathLimit' });
            const res = await server.inject({ method: 'GET', url: '/noPathLimit' });

            expect(res.statusCode).to.equal(429);
            expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
        });

    });

});
