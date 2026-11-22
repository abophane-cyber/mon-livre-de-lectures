import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptJson, encryptJson, isEncrypted } from '../src/crypto.js';

const header = { app: 'mon-livre-de-lectures', version: 1 };
const secret = { books: [{ id: 'a', title: 'Madame Bovary', passages: ['Il faut se défier des rêves.'] }] };

test('chiffrement puis déchiffrement avec le bon mot de passe', async () => {
  const env = await encryptJson(secret, 'mon mot de passe très long', header);
  assert.ok(isEncrypted(env));
  assert.equal(env.app, 'mon-livre-de-lectures');
  assert.ok(!JSON.stringify(env).includes('Bovary'), 'le contenu ne doit pas apparaître en clair');
  assert.deepEqual(await decryptJson(env, 'mon mot de passe très long'), secret);
});

test('mauvais mot de passe refusé', async () => {
  const env = await encryptJson(secret, 'correct horse battery', header);
  await assert.rejects(decryptJson(env, 'mauvais'), /Mot de passe incorrect/);
});

test('en-tête modifié détecté', async () => {
  const env = await encryptJson(secret, 'correct horse battery', header);
  await assert.rejects(decryptJson({ ...env, version: 2 }, 'correct horse battery'), /Mot de passe incorrect/);
});

test('deux chiffrements du même contenu sont différents', async () => {
  const a = await encryptJson(secret, 'pass phrase 123', header);
  const b = await encryptJson(secret, 'pass phrase 123', header);
  assert.notEqual(a.data, b.data);
});
