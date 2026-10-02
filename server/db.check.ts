/**
 * Checagem da clonagem de base (só a estrutura), sem banco:
 *   npx tsx server/db.check.ts
 */
import assert from 'assert';
import { clonarBase } from './db';

interface Falso {
  bases?: { nome: string }[];
  tabelas?: string[];
  visoes?: { nome: string; sql_texto: string }[];
  rotinas?: { nome: string; tipo: string }[];
  /** Linhas do KEY_COLUMN_USAGE + REFERENTIAL_CONSTRAINTS */
  vinculos?: Record<string, any>[];
  triggers?: Record<string, any>[];
  /** Texto devolvido pelo SHOW CREATE de cada rotina */
  criar?: Record<string, string>;
  /** Comandos que o banco recusa, por trecho contido no SQL */
  recusa?: string[];
}

/** Pool simulado: responde às consultas do information_schema e guarda os comandos executados */
function poolFalso(f: Falso) {
  const comandos: string[] = [];
  const pool: any = {
    query: async (sql: string, params?: any[]) => {
      comandos.push(sql);
      if (sql.includes('SCHEMATA')) {
        return [
          (f.bases || [])
            .filter((b) => params!.includes(b.nome))
            .map((b) => ({ ...b, charset: 'utf8mb4', collation: 'utf8mb4_general_ci' })),
        ];
      }
      if (sql.includes('information_schema.TABLES')) return [(f.tabelas || []).map((nome) => ({ nome }))];
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [f.vinculos || []];
      if (sql.includes('information_schema.TRIGGERS')) return [f.triggers || []];
      if (sql.includes('information_schema.VIEWS')) return [f.visoes || []];
      if (sql.includes('information_schema.ROUTINES')) return [f.rotinas || []];
      if (sql.startsWith('SHOW CREATE')) {
        const nome = sql.split('.').pop()!.replace(/`/g, '');
        const tipo = sql.includes('FUNCTION') ? 'Function' : 'Procedure';
        return [[{ [`Create ${tipo}`]: f.criar?.[nome] }]];
      }
      if ((f.recusa || []).some((trecho) => sql.includes(trecho))) {
        const err: any = new Error('recusado pelo banco');
        err.sqlMessage = 'recusado pelo banco';
        throw err;
      }
      return [{}];
    },
  };
  return { pool, comandos };
}

const base = (extra: Falso = {}): Falso => ({
  bases: [{ nome: 'pedweb_sal' }],
  tabelas: ['app_produtos', 'app_clientes'],
  ...extra,
});

(async () => {
  // ----- validação do nome e da origem -----
  const recusa = async (nome: string, trecho: string) => {
    const { pool, comandos } = poolFalso(base());
    await assert.rejects(() => clonarBase(pool, 'pedweb_sal', nome), new RegExp(trecho, 'i'), nome);
    assert.ok(!comandos.some((c) => c.startsWith('CREATE')), `nada é criado: ${nome}`);
  };
  await recusa('outra_base', 'precisa começar');
  await recusa('pedweb_admin', 'pedweb_admin');
  await recusa('pedweb-sal', 'apenas letras');
  await recusa('pedweb_sal', 'Já existe');
  await assert.rejects(
    () => clonarBase(poolFalso({ bases: [] }).pool, 'pedweb_nada', 'pedweb_novo'),
    /não existe/i,
  );

  // ----- tabelas, visões, funções e procedures -----
  const f = base({
    visoes: [
      { nome: 'v_estoque', sql_texto: 'select `pedweb_sal`.`app_produtos`.`ean` from `pedweb_sal`.`app_produtos`' },
      { nome: 'v_resumo', sql_texto: 'select count(0) from `pedweb_sal`.`v_estoque`' },
    ],
    rotinas: [
      { nome: 'fn_total', tipo: 'FUNCTION' },
      { nome: 'sp_limpa', tipo: 'PROCEDURE' },
    ],
    // Chave estrangeira de duas colunas, nas duas linhas do KEY_COLUMN_USAGE
    vinculos: [
      {
        restricao: 'fk_prod_cli', tabela: 'app_produtos', coluna: 'cliente_id',
        base_ref: 'pedweb_sal', tabela_ref: 'app_clientes', coluna_ref: 'id',
        no_update: 'CASCADE', no_delete: 'RESTRICT',
      },
      {
        restricao: 'fk_prod_cli', tabela: 'app_produtos', coluna: 'filial_id',
        base_ref: 'pedweb_sal', tabela_ref: 'app_clientes', coluna_ref: 'filial',
        no_update: 'CASCADE', no_delete: 'RESTRICT',
      },
    ],
    triggers: [
      {
        nome: 'tg_produtos_ai', quando: 'AFTER', evento: 'INSERT', tabela: 'app_produtos',
        corpo: 'BEGIN INSERT INTO `pedweb_sal`.`app_clientes` (id) VALUES (NEW.id); END',
      },
    ],
    criar: {
      fn_total: 'CREATE DEFINER=`bmsoftadm`@`%` FUNCTION `fn_total`(x int) RETURNS int RETURN x * 2',
      sp_limpa: "CREATE DEFINER=`bmsoftadm`@`%` PROCEDURE `sp_limpa`()\nBEGIN\n  DELETE FROM `pedweb_sal`.`app_clientes`;\nEND",
    },
  });
  const { pool, comandos } = poolFalso(f);
  const r = await clonarBase(pool, 'pedweb_sal', 'pedweb_teste');

  assert.deepEqual(
    { ...r, erros: r.erros.length },
    { nome: 'pedweb_teste', tabelas: 2, fks: 1, visoes: 2, funcoes: 1, procedures: 1, triggers: 1, erros: 0 },
  );

  // A chave estrangeira sai como um ALTER só, com as duas colunas na ordem e apontando para a base nova
  assert.ok(
    comandos.includes(
      'ALTER TABLE `pedweb_teste`.`app_produtos` ADD CONSTRAINT `fk_prod_cli` ' +
        'FOREIGN KEY (`cliente_id`, `filial_id`) REFERENCES `pedweb_teste`.`app_clientes` (`id`, `filial`) ' +
        'ON DELETE RESTRICT ON UPDATE CASCADE',
    ),
    'chave estrangeira recriada após as tabelas',
  );
  assert.ok(
    comandos.findIndex((c) => c.startsWith('ALTER TABLE')) >
      comandos.findIndex((c) => c.includes('CREATE TABLE `pedweb_teste`.`app_clientes`')),
    'as tabelas vêm antes das chaves estrangeiras',
  );

  const trigger = comandos.find((c) => c.startsWith('CREATE TRIGGER'))!;
  assert.ok(
    trigger.startsWith(
      'CREATE TRIGGER `pedweb_teste`.`tg_produtos_ai` AFTER INSERT ON `pedweb_teste`.`app_produtos` FOR EACH ROW ',
    ),
  );
  assert.ok(trigger.includes('INSERT INTO `pedweb_teste`.`app_clientes`'), 'corpo da trigger aponta para a base nova');
  assert.ok(!trigger.includes('`pedweb_sal`'));
  assert.ok(
    comandos.includes('CREATE DATABASE `pedweb_teste` CHARACTER SET `utf8mb4` COLLATE `utf8mb4_general_ci`'),
  );
  assert.ok(comandos.includes('CREATE TABLE `pedweb_teste`.`app_produtos` LIKE `pedweb_sal`.`app_produtos`'));

  const visao = comandos.find((c) => c.startsWith('CREATE VIEW `pedweb_teste`.`v_estoque`'))!;
  assert.ok(visao.includes('`pedweb_teste`.`app_produtos`'), 'visão aponta para a base nova');
  assert.ok(!visao.includes('`pedweb_sal`'), 'nenhuma referência à origem sobra na visão');

  const funcao = comandos.find((c) => c.includes('FUNCTION `pedweb_teste`.`fn_total`'))!;
  assert.ok(!/DEFINER/i.test(funcao), 'a função é criada sem o DEFINER original');

  const proc = comandos.find((c) => c.includes('PROCEDURE `pedweb_teste`.`sp_limpa`'))!;
  assert.ok(proc.includes('DELETE FROM `pedweb_teste`.`app_clientes`'), 'corpo aponta para a base nova');

  assert.ok(!comandos.some((c) => /^INSERT|SELECT \* FROM `pedweb/i.test(c)), 'nenhum dado é copiado');

  // ----- uma visão que depende de outra entra na segunda passada -----
  const ordem = poolFalso(
    base({
      visoes: [
        { nome: 'v_depende', sql_texto: 'select * from `pedweb_sal`.`v_origem`' },
        { nome: 'v_origem', sql_texto: 'select 1' },
      ],
    }),
  );
  let criouOrigem = false;
  const queryOriginal = ordem.pool.query;
  ordem.pool.query = async (sql: string, params?: any[]) => {
    // v_depende só é aceita depois que v_origem existe
    if (sql.includes('`v_depende`') && !criouOrigem) throw Object.assign(new Error('x'), { sqlMessage: 'x' });
    if (sql.includes('CREATE VIEW `pedweb_teste`.`v_origem`')) criouOrigem = true;
    return queryOriginal(sql, params);
  };
  const r2 = await clonarBase(ordem.pool, 'pedweb_sal', 'pedweb_teste');
  assert.deepEqual([r2.visoes, r2.erros], [2, []], 'visão dependente é recriada na segunda passada');

  // ----- o que o banco recusa vira aviso, sem derrubar a clonagem -----
  const comFalha = poolFalso(base({ recusa: ['`app_clientes` LIKE'] }));
  const r3 = await clonarBase(comFalha.pool, 'pedweb_sal', 'pedweb_teste');
  assert.equal(r3.tabelas, 1);
  assert.match(r3.erros[0], /^tabela app_clientes: recusado/);

  console.log('db.check: ok');
})();
