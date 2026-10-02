/**
 * Checagem do que é concedido e revogado ao liberar bases para uma conta do MySQL:
 *   npx tsx server/liberarBases.check.ts
 */
import assert from 'assert';
import { calcularMudancas } from './liberarBases';

const existentes = ['pedweb_sal', 'pedweb_norte', 'pedweb_sul'];

assert.deepEqual(
  calcularMudancas(['pedweb_sal'], ['pedweb_sal', 'pedweb_norte'], existentes),
  { conceder: ['pedweb_norte'], revogar: [] },
  'só concede o que falta',
);

assert.deepEqual(
  calcularMudancas(['pedweb_sal', 'pedweb_norte'], ['pedweb_norte'], existentes),
  { conceder: [], revogar: ['pedweb_sal'] },
  'desmarcar revoga',
);

assert.deepEqual(
  calcularMudancas(['pedweb_sal'], ['pedweb_sal'], existentes),
  { conceder: [], revogar: [] },
  'sem mudança, nenhum comando',
);

assert.deepEqual(
  calcularMudancas([], ['pedweb_outra', 'mysql'], existentes),
  { conceder: [], revogar: [] },
  'base que não existe no servidor é ignorada',
);

assert.deepEqual(
  calcularMudancas(['pedweb_antiga'], ['pedweb_sul'], existentes),
  { conceder: ['pedweb_sul'], revogar: [] },
  'privilégio de base que não existe mais não é tocado',
);

console.log('liberarBases.check: ok');
