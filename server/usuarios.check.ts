/**
 * Checagem de quem é super usuário do painel (administra usuários e libera bases):
 *   npx tsx server/usuarios.check.ts
 */
import assert from 'assert';
import { ehSuperUsuario } from './usuarios.js';

// A marcação é o papel = 'super' (coluna `nivel` no pedweb_admin)
const comNivel = ['id', 'nome', 'senha', 'nivel'];
assert.equal(ehSuperUsuario({ nivel: 'super' }, comNivel), true);
assert.equal(ehSuperUsuario({ nivel: 'admin' }, comNivel), false, 'admin não é super');
assert.equal(ehSuperUsuario({ nivel: 'user' }, comNivel), false);

const comTipo = ['id', 'nome', 'senha_hash', 'tipo'];
assert.equal(ehSuperUsuario({ tipo: 'super' }, comTipo), true);
assert.equal(ehSuperUsuario({ tipo: ' Super ' }, comTipo), true, 'espaços e caixa não importam');
assert.equal(ehSuperUsuario({ tipo: 'admin' }, comTipo), false, 'admin não é super');
assert.equal(ehSuperUsuario({ tipo: '' }, comTipo), false);
assert.equal(ehSuperUsuario({}, comTipo), false);

// Tabela sem `tipo`: vale a coluna de sim/não
assert.equal(ehSuperUsuario({ super: 'S' }, ['id', 'super']), true);
assert.equal(ehSuperUsuario({ super: 0 }, ['id', 'super']), false);
assert.equal(ehSuperUsuario({ superusuario: 1 }, ['id', 'superusuario']), true);

// Sem nenhuma marcação possível, ninguém é super
assert.equal(ehSuperUsuario({ nome: 'Fulano', admin: 'S' }, ['id', 'nome', 'admin']), false);

console.log('usuarios.check: ok');
