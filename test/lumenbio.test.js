// Zero-dependency smoke tests for Lumenbio's security-critical invariants.
// Run with: npm test   (uses node's built-in test runner, no deps)
//
// Dummy KV creds so requiring server modules (which construct an Upstash
// client at load) doesn't throw — none of the tested functions hit Redis.
process.env.KV_REST_API_URL = process.env.KV_REST_API_URL || 'https://example.com';
process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || 'x';

const test = require('node:test');
const assert = require('node:assert');

const { publicConfig, mergeConfig } = require('../server/bio');
const defaultConfig = require('../server/defaultConfig');
const PS = require('../public/shared/password-strength.js');
const mailer = require('../server/email');

test('publicConfig never exposes the password hash', () => {
  const cfg = defaultConfig('alice');
  cfg.passwordProtect = { enabled: true, hash: 'SUPER_SECRET_BCRYPT_HASH' };
  const pub = publicConfig(cfg);
  assert.strictEqual(pub.passwordProtect.hash, undefined, 'hash must be stripped');
  assert.strictEqual(pub.passwordProtect.enabled, true);
  assert.strictEqual(pub.passwordProtect.hasPassword, true);
  assert.ok(!JSON.stringify(pub).includes('SUPER_SECRET_BCRYPT_HASH'), 'hash must not leak anywhere in the public config');
});

test('publicConfig reports hasPassword=false when no hash is set', () => {
  const pub = publicConfig(defaultConfig('alice'));
  assert.strictEqual(pub.passwordProtect.hasPassword, false);
  assert.strictEqual(pub.passwordProtect.enabled, false);
});

test('mergeConfig ignores keys not present in the template', () => {
  const merged = mergeConfig(defaultConfig('bob'), { evilKey: 'pwned', profile: { name: 'Bob' } });
  assert.strictEqual(merged.evilKey, undefined, 'unknown keys must be dropped');
  assert.strictEqual(merged.profile.name, 'Bob');
});

test('mergeConfig caps arrays at 50 entries', () => {
  const big = Array.from({ length: 120 }, (_, i) => ({ label: 'l' + i, url: 'https://x' }));
  const merged = mergeConfig(defaultConfig('bob'), { customLinks: big });
  assert.ok(merged.customLinks.length <= 50, 'arrays must be capped to limit payload size');
});

test('mergeConfig caps long strings', () => {
  const merged = mergeConfig(defaultConfig('bob'), { profile: { name: 'a'.repeat(5000) } });
  assert.ok(merged.profile.name.length <= 2000, 'strings must be capped');
});

test('password strength differentiates weak from strong', () => {
  const weak = PS.score('123').score;
  const strong = PS.score('Tr0ub4dour&3xtra!').score;
  assert.ok(weak < 2, 'a trivial password should fall below the signup threshold');
  assert.ok(strong > weak, 'a complex password should score higher than a trivial one');
  assert.ok(strong >= 2, 'a complex password should meet the signup threshold');
});

test('verification email contains the link and a subject', () => {
  const m = mailer.verifyEmail('https://lumenbio.app/verify?token=abc123');
  assert.ok(m.subject && m.subject.length > 0);
  assert.match(m.html, /verify\?token=abc123/);
  assert.match(m.text, /verify\?token=abc123/);
});

test('reset email contains the link', () => {
  const m = mailer.resetEmail('https://lumenbio.app/reset?token=zzz999');
  assert.match(m.text, /reset\?token=zzz999/);
  assert.match(m.html, /reset\?token=zzz999/);
});
