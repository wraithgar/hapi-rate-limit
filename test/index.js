'use strict';

const lab = exports.lab = require('lab').script();
const expect = require('code').expect;
const beforeEach = lab.beforeEach;
const describe = lab.describe;
const it = lab.it;

const Hapi = require('hapi');
const Boom = require('boom');
const HapiRateLimit = require('../');

describe('hapi-rate-limit', () => {

    describe('defaults', () => {

        let server;

        beforeEach(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') },
                debug: false
            });

            server.connection();
            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        reply.continue({ credentials: { id: request.query.id, name: request.query.name } });
                    }
                };
            });
            server.auth.strategy('trusty', 'trusty');

            return server.register(HapiRateLimit).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('no route settings', () => {

            return server.inject({ method: 'GET', url: '/defaults' }).then((res1) => {

                const pathReset = res1.headers['x-ratelimit-pathreset'];
                const userReset = res1.headers['x-ratelimit-userreset'];

                expect(res1.headers).to.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                ]);
                expect(res1.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
                expect(res1.headers['x-ratelimit-pathlimit']).to.equal(50);
                expect(res1.headers['x-ratelimit-pathremaining']).to.equal(49);
                expect(res1.headers['x-ratelimit-pathreset']).to.be.a.number();
                expect(res1.headers['x-ratelimit-pathreset'] - Date.now()).to.be.within(59900, 60100);
                expect(res1.headers['x-ratelimit-userlimit']).to.equal(300);
                expect(res1.headers['x-ratelimit-userremaining']).to.equal(299);
                expect(res1.headers['x-ratelimit-userreset']).to.be.a.number();
                expect(res1.headers['x-ratelimit-userreset'] - Date.now()).to.be.within(599900, 600100);

                return server.inject({ method: 'GET', url: '/defaults' }).then((res2) => {

                    expect(res2.headers).to.include([
                        'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                        'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                    ]);
                    expect(res1.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
                    expect(res2.headers['x-ratelimit-pathlimit']).to.equal(50);
                    expect(res2.headers['x-ratelimit-pathremaining']).to.equal(48);
                    expect(res2.headers['x-ratelimit-pathreset'] - pathReset).to.be.within(-100, 100);
                    expect(res2.headers['x-ratelimit-userlimit']).to.equal(300);
                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(298);
                    expect(res2.headers['x-ratelimit-userreset'] - userReset).to.be.within(-100, 100);
                });
            });
        });

        it('authenticated request', () => {

            return server.inject({ method: 'GET', url: '/auth?id=1' }).then((res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(299);

                return server.inject({ method: 'GET', url: '/auth?id=1' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(298);
                    return server.inject({ method: 'GET', url: '/auth?id=2' }).then((res3) => {

                        expect(res3.headers['x-ratelimit-userremaining']).to.equal(299);
                    });
                });
            });
        });

        it('route configured user attribute', () => {

            return server.inject({ method: 'GET', url: '/authName?id=1&name=foo' }).then((res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(299);

                return server.inject({ method: 'GET', url: '/authName?id=1&name=foo' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(298);
                    return server.inject({ method: 'GET', url: '/authName?id=1&name=bar' }).then((res3) => {

                        expect(res3.headers['x-ratelimit-userremaining']).to.equal(299);
                    });
                });
            });
        });

        it('route configured addressOnly', () => {

            return server.inject({ method: 'GET', url: '/addressOnly?id=3' }).then((res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(299);

                return server.inject({ method: 'GET', url: '/addressOnly?id=3' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(298);
                    return server.inject({ method: 'GET', url: '/addressOnly?id=4' }).then((res3) => {

                        expect(res3.headers['x-ratelimit-userremaining']).to.equal(297);
                    });
                });
            });
        });

        it('route configured addressOnly for userPathLimit', () => {

            return server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=3' }).then((res1) => {

                expect(res1.headers['x-ratelimit-userpathremaining']).to.equal(49);

                return server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=3' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userpathremaining']).to.equal(48);
                    return server.inject({ method: 'GET', url: '/addressOnlyUserPathLimit?id=4' }).then((res3) => {

                        expect(res3.headers['x-ratelimit-userpathremaining']).to.equal(47);
                    });
                });
            });
        });

        it('route disabled pathLimit', () => {

            return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res) => {

                expect(res.headers).to.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
                expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
            });
        });

        it('route disabled userLimit', () => {

            return server.inject({ method: 'GET', url: '/noUserLimit' }).then((res) => {

                expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
            });
        });

        it('route disabled userPathLimit', () => {

            return server.inject({ method: 'GET', url: '/noUserPathLimit' }).then((res) => {

                expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                expect(res.headers).to.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
                expect(res.headers).to.not.include(['x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset']);
            });
        });

        it('route configured pathLimit', () => {

            return server.inject({ method: 'GET', url: '/setPathLimit' }).then((res1) => {

                const pathReset = res1.headers['x-ratelimit-pathreset'];

                expect(res1.headers).to.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                ]);
                expect(res1.headers['x-ratelimit-pathlimit']).to.equal(50);
                expect(res1.headers['x-ratelimit-pathremaining']).to.equal(49);
                expect(res1.headers['x-ratelimit-pathreset']).to.be.a.number();
                expect(res1.headers['x-ratelimit-pathreset'] - Date.now()).to.be.within(59900, 60100);

                return server.inject({ method: 'GET', url: '/setPathLimit' }).then((res2) => {

                    expect(res2.headers).to.include([
                        'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                        'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                    ]);
                    expect(res2.headers['x-ratelimit-pathlimit']).to.equal(50);
                    expect(res2.headers['x-ratelimit-pathremaining']).to.equal(48);
                    expect(res2.headers['x-ratelimit-pathreset'] - pathReset).to.be.within(-100, 100);
                });
            });
        });

        it('runs out of pathLimit', () => {

            return server.inject({ method: 'GET', url: '/lowPathLimit' }).then((res1) => {

                expect(res1.headers['x-ratelimit-pathremaining']).to.equal(1);

                return server.inject({ method: 'GET', url: '/lowPathLimit' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-pathremaining']).to.equal(0);
                    return server.inject({ method: 'GET', url: '/lowPathLimit' }).then((res3) => {

                        expect(res3.statusCode).to.equal(429);
                    });
                });
            });
        });

        it('route configured userPathLimit', () => {

            return server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' }).then((res1) => {

                const userPathReset = res1.headers['x-ratelimit-userpathreset'];
                expect(res1.headers).to.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                    'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
                ]);
                expect(res1.headers['x-ratelimit-userpathlimit']).to.equal(50);
                expect(res1.headers['x-ratelimit-userpathremaining']).to.equal(49);
                expect(res1.headers['x-ratelimit-userpathreset']).to.be.a.number();
                expect(res1.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

                return server.inject({ method: 'GET', url: '/setUserPathLimit2?id=1' }).then((res2) => {

                    expect(res2.headers).to.include([
                        'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                        'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                        'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
                    ]);
                    expect(res2.headers['x-ratelimit-userpathlimit']).to.equal(50);
                    expect(res2.headers['x-ratelimit-userpathremaining']).to.equal(49);
                    expect(res1.headers['x-ratelimit-userpathreset']).to.be.a.number();
                    expect(res1.headers['x-ratelimit-userpathreset'] - Date.now()).to.be.within(59900, 60100);

                    return server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' }).then((res3) => {

                        expect(res3.headers).to.include([
                            'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                            'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                            'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
                        ]);
                        expect(res3.headers['x-ratelimit-userpathlimit']).to.equal(50);
                        expect(res3.headers['x-ratelimit-userpathremaining']).to.equal(48);
                        expect(res3.headers['x-ratelimit-userpathreset'] - userPathReset).to.be.within(-100, 100);
                    });
                });
            });
        });

        it('runs out of userPathLimit', () => {

            return server.inject({ method: 'GET', url: '/lowUserPathLimit' }).then((res1) => {

                expect(res1.headers['x-ratelimit-userpathremaining']).to.equal(1);

                return server.inject({ method: 'GET', url: '/lowUserPathLimit' }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userpathremaining']).to.equal(0);
                    return server.inject({ method: 'GET', url: '/lowUserPathLimit' }).then((res3) => {

                        expect(res3.statusCode).to.equal(429);
                    });
                });
            });
        });

        it('route configured no headers', () => {

            return server.inject({ method: 'GET', url: '/noHeaders' }).then((res) => {

                expect(res.headers).to.not.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset',
                    'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
                ]);
            });
        });

        it('404 reply', () => {

            return server.inject({ method: 'GET', url: '/notfound' }).then((res1) => {

                expect(res1.headers).to.include([
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                ]);
                expect(res1.headers).to.not.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userpathlimit', 'x-ratelimit-userpathremaining', 'x-ratelimit-userpathreset'
                ]);

                const userCount = res1.headers['x-ratelimit-userremaining'];
                return server.inject({ method: 'GET', url: '/notfound' }).then((res2) => {

                    expect(userCount - res2.headers['x-ratelimit-userremaining']).to.equal(1);
                });
            });
        });

        it('bad data in path cache', (done) => {

            const pathCache = server.cache({ segment: 'hapi-rate-limit-path', shared: true });
            pathCache.set('/defaults', 'replaced', 10000, (err) => {

                expect(err).to.not.exist();
                pathCache._cache.connection.cache['hapi-rate-limit-path']['/defaults'] = '{bad json}';

                server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                    expect(res.statusCode).to.equal(500);
                    pathCache.set('/defaults', 0, 10000, (err) => {

                        expect(err).to.not.exist();
                        done();
                    });
                });
            });
        });

        it('bad data in userPath cache', (done) => {

            const userPathCache = server.cache({ segment: 'hapi-rate-limit-userPath', shared: true });
            userPathCache.set('1:/setUserPathLimit', 'replaced', 10000, (err) => {

                expect(err).to.not.exist();
                userPathCache._cache.connection.cache['hapi-rate-limit-userPath']['1:/setUserPathLimit'] = '{bad json}';

                server.inject({ method: 'GET', url: '/setUserPathLimit?id=1' }, (res) => {

                    expect(res.statusCode).to.equal(500);
                    userPathCache.set('1:/setUserPathLimit', 0, 10000, (err) => {

                        expect(err).to.not.exist();
                        done();
                    });
                });
            });
        });

        it('path cache full', (done) => {

            const pathCache = server.cache({ segment: 'hapi-rate-limit-path', shared: true });
            const cacheSize = pathCache._cache.connection.settings.maxByteSize;
            pathCache._cache.connection.settings.maxByteSize = 10;

            server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                expect(res.statusCode).to.equal(500);
                pathCache._cache.connection.settings.maxByteSize = cacheSize;
                done();
            });
        });

        it('userPath cache full', (done) => {

            const userPathCache = server.cache({ segment: 'hapi-rate-limit-userPath', shared: true });
            const cacheSize = userPathCache._cache.connection.settings.maxByteSize;
            userPathCache._cache.connection.settings.maxByteSize = 10;

            server.inject({ method: 'GET', url: '/setUserPathLimitOnly?id=1' }, (res) => {

                expect(res.statusCode).to.equal(500);
                userPathCache._cache.connection.settings.maxByteSize = cacheSize;
                done();
            });
        });

        it('bad data in user cache', (done) => {

            const userCache = server.cache({ segment: 'hapi-rate-limit-user', shared: true });
            userCache.set('127.0.0.1', 'asdf', 10000, (err) => {

                expect(err).to.not.exist();
                userCache._cache.connection.cache['hapi-rate-limit-user']['127.0.0.1'] = '{bad json}';

                server.inject({ method: 'GET', url: '/defaults' }, (res) => {

                    expect(res.statusCode).to.equal(500);
                    userCache.set('127.0.0.1', 0, 10000, (err) => {

                        expect(err).to.not.exist();
                        done();
                    });
                });
            });
        });

        it('user cache full', (done) => {

            const userCache = server.cache({ segment: 'hapi-rate-limit-user', shared: true });
            const cacheSize = userCache._cache.connection.settings.maxByteSize;
            userCache._cache.connection.settings.maxByteSize = 10;

            server.inject({ method: 'GET', url: '/noPathLimit' }, (res) => {

                expect(res.statusCode).to.equal(500);
                userCache._cache.connection.settings.maxByteSize = cacheSize;
                done();
            });
        });

        it('route configured trustProxy', () => {

            return server.inject({ method: 'GET', url: '/trustProxy', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } }).then((res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(299);
                return server.inject({ method: 'GET', url: '/trustProxy', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } }).then((res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(298);
                    return server.inject({ method: 'GET', url: '/trustProxy' }).then((res3) => {

                        expect(res3.headers['x-ratelimit-userremaining']).to.equal(299);
                    });
                });
            });
        });

        it('route configured ipWhitelist', () => {

            return server.inject({ method: 'GET', url: '/ipWhitelist', headers: { 'x-forwarded-for': '127.0.0.2, 127.0.0.1' } }).then((res) => {

                expect(res.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
            });
        });

        it('route configured userWhitelist', () => {

            return server.inject({ method: 'GET', url: '/userWhitelist?id=1' }).then((res1) => {

                expect(res1.headers).to.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                expect(res1.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);

                return server.inject({ method: 'GET', url: '/userWhitelist?id=2' }).then((res2) => {

                    expect(res2.headers).to.include([
                        'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                        'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                    ]);
                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(299);
                });
            });
        });

    });

    describe('configured user limit', () => {

        let server;

        beforeEach(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') }
            });

            server.connection();
            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        reply.continue({ credentials: { id: request.query.id, name: request.query.name } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            return server.register([{
                register: HapiRateLimit,
                options: {
                    userLimit: 2,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('runs out of configured userLimit', (done) => {

            server.inject({ method: 'GET', url: '/defaults' }, (res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(1);
                expect(res1.headers['x-ratelimit-userlimit']).to.equal(2);

                server.inject({ method: 'GET', url: '/defaults' }, (res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(0);
                    server.inject({ method: 'GET', url: '/defaults' }, (res3) => {

                        expect(res3.statusCode).to.equal(429);
                        setTimeout(() => {

                            server.inject({ method: 'GET', url: '/defaults' }, (res4) => {

                                expect(res4.headers['x-ratelimit-userremaining']).to.equal(1);
                                expect(res4.headers['x-ratelimit-userlimit']).to.equal(2);
                                done();
                            });
                        }, 1000);
                    });
                });
            });
        });

        it('disabled path limit runs out of userLimit', () => {

            return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res1) => {

                return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res2) => {

                    return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res3) => {

                        expect(res3.statusCode).to.equal(429);
                        expect(res3.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                    });
                });
            });
        });

    });

    describe('disabled routes', () => {

        let server;

        beforeEach(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') }
            });

            server.connection();
            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        reply.continue({ credentials: { id: request.query.id, name: request.query.name } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            return server.register([{
                register: HapiRateLimit,
                options: {
                    userLimit: 1,
                    pathLimit: 1,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('route disabled', () => {

            return server.inject({ method: 'GET', url: '/pathDisabled' }).then((res) => {

                expect(res.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                expect(res.headers).to.not.include(['x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset']);
            });
        });
    });

    describe('configured user limit with numeric id', () => {

        let server;

        beforeEach(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') }
            });

            server.connection();
            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        reply.continue({ credentials: { id: 10 } });
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            return server.register([{
                register: HapiRateLimit,
                options: {
                    userLimit: 2,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('runs out of configured userLimit', (done) => {

            server.inject({ method: 'GET', url: '/auth' }, (res1) => {

                expect(res1.headers['x-ratelimit-userremaining']).to.equal(1);
                expect(res1.headers['x-ratelimit-userlimit']).to.equal(2);

                server.inject({ method: 'GET', url: '/auth' }, (res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(0);
                    server.inject({ method: 'GET', url: '/auth' }, (res3) => {

                        expect(res3.statusCode).to.equal(429);
                        setTimeout(() => {

                            server.inject({ method: 'GET', url: '/auth' }, (res4) => {

                                expect(res4.headers['x-ratelimit-userremaining']).to.equal(1);
                                expect(res4.headers['x-ratelimit-userlimit']).to.equal(2);
                                done();
                            });
                        }, 1000);
                    });
                });
            });
        });

        it('disabled path limit runs out of userLimit', () => {

            return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res1) => {

                return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res2) => {

                    return server.inject({ method: 'GET', url: '/noPathLimit' }).then((res3) => {

                        expect(res3.statusCode).to.equal(429);
                        expect(res3.headers).to.not.include(['x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset']);
                    });
                });
            });
        });

    });

    describe('with enabled checkUnauthorized', () => {

        let server;

        beforeEach(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') }
            });

            server.connection();
            server.auth.scheme('trusty', () => {

                return {
                    authenticate: function (request, reply) {

                        reply(Boom.unauthorized('invalid'));
                    }
                };
            });

            server.auth.strategy('trusty', 'trusty');

            return server.register([{
                register: HapiRateLimit,
                options: {
                    checkUnauthorized: true,
                    userLimit: 2,
                    userCache: {
                        expiresIn: 500
                    }
                }
            }]).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('runs out of configured userLimit', (done) => {

            server.inject({ method: 'GET', url: '/auth' }, (res1) => {

                expect(res1.statusCode).to.equal(401);
                expect(res1.headers['x-ratelimit-userremaining']).to.equal(1);
                expect(res1.headers['x-ratelimit-userlimit']).to.equal(2);
                expect(res1.headers).to.include(['x-ratelimit-userreset']);

                server.inject({ method: 'GET', url: '/auth' }, (res2) => {

                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(0);
                    server.inject({ method: 'GET', url: '/auth' }, (res3) => {

                        expect(res3.statusCode).to.equal(429);
                        setTimeout(() => {

                            server.inject({ method: 'GET', url: '/auth' }, (res4) => {

                                expect(res4.headers['x-ratelimit-userremaining']).to.equal(1);
                                expect(res4.headers['x-ratelimit-userlimit']).to.equal(2);
                                done();
                            });
                        }, 1000);
                    });
                });
            });
        });

        it('bad data in user cache', (done) => {

            const userCache = server.cache({ segment: 'hapi-rate-limit-user', shared: true });
            userCache.set('127.0.0.1', 'noAuth', 10000, (err) => {

                expect(err).to.not.exist();
                userCache._cache.connection.cache['hapi-rate-limit-user']['127.0.0.1'] = '{bad json}';

                server.inject({ method: 'GET', url: '/auth' }, (res) => {

                    expect(res.statusCode).to.equal(500);
                    userCache.set('127.0.0.1', 0, 10000, (err) => {

                        expect(err).to.not.exist();
                        done();
                    });
                });
            });
        });

    });

});
