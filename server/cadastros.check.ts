/**
 * Checagem dos cadastros: e-mail aceito como login do aplicativo.
 *   npx tsx server/cadastros.check.ts
 */
import assert from 'assert';
import { normalizarEmail, SENHA_PADRAO } from './cadastros';

assert.equal(normalizarEmail('  Joao@Empresa.COM.br '), 'joao@empresa.com.br', 'arruma caixa e espaços');
assert.equal(normalizarEmail('ze.ninguem@empresa.com'), 'ze.ninguem@empresa.com');
assert.equal(normalizarEmail('ze ninguem'), '', 'sem @ não é e-mail');
assert.equal(normalizarEmail('ze@empresa'), '', 'sem domínio não é e-mail');
assert.equal(normalizarEmail('ze@empresa.c'), '', 'domínio curto demais');
assert.equal(normalizarEmail(''), '');
assert.equal(normalizarEmail(null), '');
assert.equal(SENHA_PADRAO, '1234');

console.log('cadastros.check: ok');
