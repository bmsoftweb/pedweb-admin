/**
 * Checagem do token de sessão (assinado, sem estado no servidor):
 *   npx tsx server/sessao.check.ts
 */
import assert from 'assert';
import { emitirToken, lerToken } from './sessao.js';

const token = emitirToken('42');
assert.equal(lerToken(token), '42', 'token válido devolve o id do usuário');

assert.equal(lerToken(''), null);
assert.equal(lerToken('qualquer-coisa'), null);
assert.equal(lerToken('42.999999999999.assinaturaerrada'), null, 'assinatura trocada não vale');

// Mexer no id invalida, mesmo mantendo o resto do token
const [, exp, assinatura] = token.split('.');
assert.equal(lerToken(`43.${exp}.${assinatura}`), null, 'não dá para trocar de usuário no token');

// Validade esticada: mudar a expiração invalida a assinatura
assert.equal(lerToken(`42.${Number(exp) + 60000}.${assinatura}`), null, 'não dá para esticar a validade');

console.log('sessao.check: ok');
