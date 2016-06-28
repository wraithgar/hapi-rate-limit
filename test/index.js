'use strict';

const lab = exports.lab = require('lab').script();
const expect = require('code').expect;
const after = lab.after;
const before = lab.before;
const describe = lab.describe;
const it = lab.it;

const Hapi = require('hapi');
const HapiRateLimit = require('../');

describe('hapi-rate-limit', () => {

  it('works', () => {

    const server = new Hapi.Server({
      cache: { engine: require('catbox-memory') }
    });

    server.connection();
    return server.register(HapiRateLimit).then(() => {

      expect(true).to.be.true();
    });

  });
});
