'use strict';

const lab = exports.lab = require('lab').script();
const expect = require('code').expect;
const before = lab.before;
const describe = lab.describe;
const it = lab.it;

const Hapi = require('hapi');
const HapiRateLimit = require('../');

describe('hapi-rate-limit', () => {

    describe('defaults', () => {

        let server;

        before(() => {

            server = new Hapi.Server({
                cache: { engine: require('catbox-memory') }
            });

            server.connection();
            return server.register(HapiRateLimit).then(() => {

                server.route(require('./test-routes'));
                return server.initialize();
            });
        });

        it('tracks requests', () => {

            return server.inject({ method: 'GET', url: '/defaults' }).then((res1) => {

                const pathReset = res1.headers['x-ratelimit-pathreset'];
                const userReset = res1.headers['x-ratelimit-userreset'];

                expect(res1.headers).to.include([
                    'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                    'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                ]);
                expect(res1.headers['x-ratelimit-pathlimit']).to.equal(10);
                expect(res1.headers['x-ratelimit-pathremaining']).to.equal(10);
                expect(res1.headers['x-ratelimit-pathreset']).to.be.a.date();
                expect(res1.headers['x-ratelimit-pathreset'] - new Date()).to.be.within(59950, 60050);
                expect(res1.headers['x-ratelimit-userlimit']).to.equal(300);
                expect(res1.headers['x-ratelimit-userremaining']).to.equal(300);
                expect(res1.headers['x-ratelimit-userreset']).to.be.a.date();
                expect(res1.headers['x-ratelimit-userreset'] - new Date()).to.be.within(599950, 600050);

                return server.inject({ method: 'GET', url: '/defaults' }).then((res2) => {

                    expect(res2.headers).to.include([
                        'x-ratelimit-pathlimit', 'x-ratelimit-pathremaining', 'x-ratelimit-pathreset',
                        'x-ratelimit-userlimit', 'x-ratelimit-userremaining', 'x-ratelimit-userreset'
                    ]);
                    expect(res2.headers['x-ratelimit-pathlimit']).to.equal(10);
                    expect(res2.headers['x-ratelimit-pathremaining']).to.equal(9);
                    expect(res2.headers['x-ratelimit-pathreset'] - pathReset).to.be.within(-50, 50);
                    expect(res2.headers['x-ratelimit-userlimit']).to.equal(300);
                    expect(res2.headers['x-ratelimit-userremaining']).to.equal(299);
                    expect(res2.headers['x-ratelimit-userreset'] - userReset).to.be.within(-50, 50);
                });
            });
        });

    });

    it('defaults', () => {

        const server = new Hapi.Server({
            cache: { engine: require('catbox-memory') }
        });

        server.connection();
        return server.register(HapiRateLimit).then(() => {

            expect(true).to.be.true();
        });

    });
});
