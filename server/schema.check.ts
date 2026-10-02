/**
 * Checagem da montagem dos metadados a partir do INFORMATION_SCHEMA, sem banco:
 *   npx tsx server/schema.check.ts
 */
import assert from 'assert';
import { carregarRecursos, recursoUsuariosPainel, columnNames } from './schema.js';
import { q } from './db.js';

const col = (t: string, c: string, dt: string, ct: string, extra = '', nulo = 'NO', def: any = null) => ({
  TABLE_NAME: t, COLUMN_NAME: c, DATA_TYPE: dt, COLUMN_TYPE: ct, IS_NULLABLE: nulo, COLUMN_DEFAULT: def,
  EXTRA: extra, CHARACTER_MAXIMUM_LENGTH: dt === 'varchar' ? 60 : null, NUMERIC_SCALE: dt === 'decimal' ? 2 : null,
});

const respostas = [
  [{ TABLE_NAME: 'app_produtos', TABLE_ROWS: 3 }, { TABLE_NAME: 'app_usuarios', TABLE_ROWS: 2 }, { TABLE_NAME: 'app_vendedores', TABLE_ROWS: 2 }, { TABLE_NAME: 'clientes', TABLE_ROWS: 5 }, { TABLE_NAME: 'pedidos', TABLE_ROWS: 9 }, { TABLE_NAME: 'log', TABLE_ROWS: 1 }],
  [
    col('app_produtos', 'id_app', 'varchar', 'varchar(25)'),
    col('app_produtos', 'date_update', 'datetime', 'datetime', 'DEFAULT_GENERATED', 'YES', 'now()'),
    col('app_produtos', 'ean', 'varchar', 'varchar(20)', '', 'YES', ''),
    col('app_produtos', 'descricao', 'varchar', 'varchar(255)', '', 'YES', ''),
    col('app_produtos', 'datahora_alteracao', 'datetime', 'datetime', 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP', 'YES', 'CURRENT_TIMESTAMP'),
    col('app_usuarios', 'id_app', 'varchar', 'varchar(25)'),
    col('app_usuarios', 'email', 'varchar', 'varchar(50)', '', 'YES', ''),
    col('app_usuarios', 'senha', 'varchar', 'varchar(255)', '', 'YES', ''),
    col('app_usuarios', 'admin', 'char', 'char(1)', '', 'YES', 'N'),
    col('app_usuarios', 'nome', 'varchar', 'varchar(50)', '', 'YES', ''),
    col('app_usuarios', 'ativo', 'char', 'char(1)', '', 'YES', 'S'),
    col('app_usuarios', 'vendedor_id_app', 'varchar', 'varchar(25)', '', 'YES', ''),
    col('app_usuarios', 'config', 'longtext', 'longtext', '', 'YES'),
    col('app_vendedores', 'id_app', 'varchar', 'varchar(25)'),
    col('app_vendedores', 'nome', 'varchar', 'varchar(50)', '', 'YES', ''),
    col('app_vendedores', 'ativo', 'char', 'char(1)', '', 'YES', 'S'),
    col('app_vendedores', 'comissao_A', 'decimal', 'decimal(15,3)', '', 'YES', '0.000'),
    col('pedidos', 'vendedor_id', 'int', 'int(11)'),
    col('clientes', 'id', 'int', 'int(11)', 'auto_increment'),
    col('clientes', 'nome', 'varchar', 'varchar(60)'),
    col('clientes', 'ativo', 'tinyint', 'tinyint(1)', '', 'NO', '1'),
    col('clientes', 'foto', 'longblob', 'longblob', '', 'YES'),
    col('pedidos', 'id', 'int', 'int(11)', 'auto_increment'),
    col('pedidos', 'cliente_id', 'int', 'int(11) unsigned'),
    col('pedidos', 'status', 'enum', "enum('aberto','d''agua')"),
    col('pedidos', 'total', 'decimal', 'decimal(12,2)', '', 'YES'),
    col('pedidos', 'emissao', 'datetime', 'datetime', '', 'NO', 'CURRENT_TIMESTAMP'),
    col('log', 'texto', 'text', 'text', '', 'YES'),
  ],
  [
    { TABLE_NAME: 'app_produtos', COLUMN_NAME: 'id_app', CONSTRAINT_NAME: 'PRIMARY' },
    { TABLE_NAME: 'app_usuarios', COLUMN_NAME: 'id_app', CONSTRAINT_NAME: 'PRIMARY' },
    { TABLE_NAME: 'app_vendedores', COLUMN_NAME: 'id_app', CONSTRAINT_NAME: 'PRIMARY' },
    { TABLE_NAME: 'clientes', COLUMN_NAME: 'id', CONSTRAINT_NAME: 'PRIMARY' },
    { TABLE_NAME: 'pedidos', COLUMN_NAME: 'id', CONSTRAINT_NAME: 'PRIMARY' },
    { TABLE_NAME: 'pedidos', COLUMN_NAME: 'cliente_id', CONSTRAINT_NAME: 'fk_cli', REFERENCED_TABLE_NAME: 'clientes', REFERENCED_COLUMN_NAME: 'id' },
  ],
];
const pool: any = { query: async () => [respostas.shift()] };

(async () => {
  const [produtos, usuarios, vendedores, clientes, pedidos, log] = await carregarRecursos(pool, 'teste', 'pedweb_teste');
  const campo = (r: any, n: string) => r.fields.find((f: any) => f.name === n);

  // ----- cadastros desenhados à mão (server/cadastros.ts) -----
  assert.equal(usuarios.group, 'cadastros', 'usuários saem da seção Tabelas');
  assert.equal(vendedores.group, 'cadastros');
  assert.equal(usuarios.label, 'Usuários');
  assert.deepEqual(
    usuarios.fields.map((f) => f.name),
    ['id_app', 'nome', 'email', 'senha', 'ativo', 'admin', 'vendedor_id_app'],
    'ordem do cadastro, e config fica de fora',
  );
  assert.equal(campo(usuarios, 'senha').type, 'password');
  assert.equal(campo(usuarios, 'senha').hash, false, 'o pedWeb compara a senha em texto puro');
  assert.equal(campo(usuarios, 'admin').type, 'simnao');
  assert.equal(campo(usuarios, 'ativo').type, 'simnao', 'ativo S/N é interruptor');
  assert.deepEqual(campo(usuarios, 'vendedor_id_app').ref, { resource: 'app_vendedores', labelField: 'nome' });
  assert.equal(campo(usuarios, 'id_app').required, false, 'id_app em branco é gerado pelo painel');
  assert.equal(campo(usuarios, 'id_app').gerarId, true);
  assert.equal(usuarios.labelField, 'nome');
  assert.equal(campo(vendedores, 'comissao_A').label, 'Comissão A (%)');
  assert.equal(campo(vendedores, 'ativo').type, 'simnao', 'ativo S/N é interruptor');
  assert.equal(campo(vendedores, 'ativo').listed, true);
  assert.equal(vendedores.canCreate, false, 'vendedores vêm do bmsoft: sem Novo');
  assert.equal(vendedores.canUpdate, false, 'vendedores só de consulta');
  assert.equal(vendedores.canDelete, false, 'vendedor não é excluído pelo painel');
  assert.equal(usuarios.canDelete, true);
  assert.equal(usuarios.canUpdate, true);
  assert.equal(usuarios.canCreate, true, 'usuário do aplicativo pode ser incluído');

  assert.deepEqual(produtos.fields.map((f) => f.name), ['id_app', 'descricao', 'date_update', 'ean', 'datahora_alteracao'], 'descrição logo após id_app');
  assert.equal(produtos.labelField, 'descricao');
  assert.equal(campo(produtos, 'id_app').readOnly, undefined, 'DEFAULT_GENERATED não é coluna calculada');
  assert.equal(campo(produtos, 'date_update').automatico, 'alteracao');
  assert.equal(campo(produtos, 'date_update').defaultAgora, true);
  assert.equal(campo(produtos, 'date_update').onUpdate, undefined, 'banco não atualiza: o CRUD preenche');
  assert.equal(campo(produtos, 'datahora_alteracao').onUpdate, true);
  assert.equal(campo(produtos, 'ean').readOnly, undefined);

  assert.deepEqual(clientes.fields.map((f) => f.name), ['id', 'nome', 'ativo'], 'blob fica de fora');
  assert.equal(campo(clientes, 'ativo').type, 'boolean');
  assert.equal(campo(clientes, 'id').readOnly, true);
  assert.equal(campo(clientes, 'nome').required, true);
  assert.equal(clientes.labelField, 'nome');

  assert.deepEqual(campo(pedidos, 'cliente_id').ref, { resource: 'clientes', labelField: 'nome' });
  assert.equal(campo(pedidos, 'cliente_id').allowNegative, false);
  assert.deepEqual(campo(pedidos, 'status').options.map((o: any) => o.value), ['aberto', "d'agua"]);
  assert.equal(campo(pedidos, 'total').scale, 2);
  assert.equal(campo(pedidos, 'emissao').required, false, 'DEFAULT dispensa o campo');

  assert.deepEqual(log.pk, []);
  assert.equal(log.canUpdate, false);
  assert.equal(campo(log, 'texto').type, 'textarea');

  const u = recursoUsuariosPainel(
    { ...clientes, fields: [...clientes.fields, { name: 'senha_hash', label: 'senha_hash', type: 'text', listed: true, searchable: true }, { name: 'config_listas', label: 'config_listas', type: 'json' }] },
    'pedweb_admin',
  );
  assert.equal(u.schema, 'pedweb_admin');
  assert.equal(campo(u, 'senha_hash').type, 'password');
  assert.equal(campo(u, 'config_listas'), undefined, 'config_listas fora do CRUD');
  assert.ok(!columnNames(u).includes('senha_hash'), 'senha fora de ordenação/filtros');

  assert.equal(q('a`b'), '`a``b`');
  console.log('schema.check: ok');
})();
