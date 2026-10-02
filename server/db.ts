import crypto from 'crypto';
import mysql from 'mysql2/promise';

/**
 * Duas conexões diferentes:
 *
 * 1. O pool do painel (`poolPainel`), com as credenciais do .env, usado só para
 *    pedweb_admin: validar o login e guardar as preferências das listas.
 * 2. A conexão do usuário, aberta no login com as credenciais MySQL gravadas na linha
 *    dele em pedweb_admin.usuarios. É ela que lê e grava as bases pedweb*, então cada
 *    um enxerga exatamente o que a sua conta do MySQL permite.
 *
 * A conexão do usuário vive na memória do servidor, identificada por um token que o
 * navegador manda no header x-conexao; reiniciar o servidor derruba as conexões.
 */
export interface Conexao {
  pool: mysql.Pool;
  host: string;
  port: number;
  user: string;
  /** Usuário do painel (pedweb_admin.usuarios) desta sessão */
  usuario: UsuarioPainel;
}

export interface UsuarioPainel {
  id: string;
  nome: string;
  /** Só o super usuário administra os usuários do painel */
  super: boolean;
  /** Coluna de identificação da linha em pedweb_admin.usuarios */
  colunaId: string;
}

/** Pools por conta de MySQL, reaproveitados enquanto o processo viver */
const pools = new Map<string, mysql.Pool>();

/** Credenciais do painel para a base pedweb_admin (arquivo .env) */
export const CONFIG_PAINEL = {
  host: process.env.PAINEL_MYSQL_HOST || '',
  port: Number(process.env.PAINEL_MYSQL_PORT) || 3306,
  user: process.env.PAINEL_MYSQL_USER || '',
  password: process.env.PAINEL_MYSQL_PASSWORD || '',
};

let poolDoPainel: mysql.Pool | null = null;

/** Pool do painel (pedweb_admin), criado na primeira necessidade */
export function poolPainel(): mysql.Pool {
  if (!CONFIG_PAINEL.host || !CONFIG_PAINEL.user) {
    throw new Error(
      'O painel não está configurado: defina PAINEL_MYSQL_HOST, PAINEL_MYSQL_USER e PAINEL_MYSQL_PASSWORD no .env ' +
        `(servidor onde fica a base ${BASE_ADMIN}).`,
    );
  }
  if (!poolDoPainel) {
    poolDoPainel = mysql.createPool({
      ...CONFIG_PAINEL,
      database: BASE_ADMIN,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true,
    });
  }
  return poolDoPainel;
}

/** Só as bases do sistema pedWeb podem ser administradas */
export const PREFIXO_BASE = 'pedweb';

/** Base do próprio painel (usuários, preferências): nunca aparece na lista nem é administrada */
export const BASE_ADMIN = 'pedweb_admin';

/**
 * Pool de uma conta de MySQL (sem base fixa: as consultas qualificam `base`.`tabela`).
 * A senha só existe aqui e na linha do usuário em pedweb_admin.
 */
export function poolPara(host: string, port: number, user: string, password: string): mysql.Pool {
  const chave = `${host}:${port}:${user}`;
  let pool = pools.get(chave);
  if (!pool) {
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 15000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      dateStrings: true,
    });
    pools.set(chave, pool);
  }
  return pool;
}

/** Confere se a conta conecta; usado no login, para o erro aparecer cedo */
export async function testarConexao(host: string, port: number, user: string, password: string) {
  await poolPara(host, port, user, password).query('SELECT 1');
}

/** Identificador MySQL entre crases, escapando crases internas */
export const q = (nome: string) => '`' + String(nome).replace(/`/g, '``') + '`';

/** Bases com prefixo pedweb, com quantidade de tabelas e tamanho */
export async function listarBases(pool: mysql.Pool) {
  const [rows] = await pool.query<any[]>(
    `SELECT s.SCHEMA_NAME AS nome,
            COUNT(t.TABLE_NAME) AS tabelas,
            COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS bytes
       FROM information_schema.SCHEMATA s
       LEFT JOIN information_schema.TABLES t
              ON t.TABLE_SCHEMA = s.SCHEMA_NAME AND t.TABLE_TYPE = 'BASE TABLE'
      WHERE LOWER(s.SCHEMA_NAME) LIKE ? AND LOWER(s.SCHEMA_NAME) <> ?
      GROUP BY s.SCHEMA_NAME
      ORDER BY s.SCHEMA_NAME`,
    [`${PREFIXO_BASE}%`, BASE_ADMIN],
  );
  return rows.map((r) => ({ nome: String(r.nome), tabelas: Number(r.tabelas), bytes: Number(r.bytes) }));
}

/** Troca as referências `origem`.`x` pela base nova no texto de visões e rotinas */
const trocarBase = (sql: string, origem: string, nome: string) =>
  sql.split(`${q(origem)}.`).join(`${q(nome)}.`);

/** Tira o DEFINER: a rotina passa a pertencer a quem está criando a base */
const semDefiner = (sql: string) => sql.replace(/\sDEFINER\s*=\s*(`(?:[^`]|``)*`|'[^']*')@(`(?:[^`]|``)*`|'[^']*')/i, '');

/** Qualifica o nome do objeto com a base nova: CREATE ... PROCEDURE `p`( -> `nova`.`p`( */
function qualificar(sql: string, tipo: 'PROCEDURE' | 'FUNCTION', objeto: string, nome: string) {
  const alvo = new RegExp(`(${tipo}\\s+)${q(objeto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (!alvo.test(sql)) throw new Error(`Não foi possível ler a definição de ${objeto}.`);
  return sql.replace(alvo, `$1${q(nome)}.${q(objeto)}`);
}

/**
 * Cria uma base nova com a estrutura de outra: tabelas (CREATE TABLE ... LIKE — colunas,
 * índices, defaults e auto_increment), chaves estrangeiras, visões, funções, procedures e
 * triggers. Os dados não são copiados.
 *
 * O que falhar (sem privilégio, visão com dependência externa) é devolvido em `erros`,
 * para o operador ver o que ficou faltando em vez de a base inteira ser perdida.
 */
export async function clonarBase(pool: mysql.Pool, origem: string, nome: string) {
  if (!/^[a-z0-9_]{1,64}$/.test(nome)) {
    throw new Error('O nome da base aceita apenas letras minúsculas, números e sublinhado (até 64 caracteres).');
  }
  if (!nome.startsWith(PREFIXO_BASE) || nome === BASE_ADMIN) {
    throw new Error(`O nome da nova base precisa começar com "${PREFIXO_BASE}" e não pode ser ${BASE_ADMIN}.`);
  }

  const [bases] = await pool.query<any[]>(
    'SELECT SCHEMA_NAME AS nome, DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?, ?)',
    [origem, nome],
  );
  const daOrigem = bases.find((b) => b.nome === origem);
  if (!daOrigem) throw new Error(`A base de origem ${origem} não existe neste servidor.`);
  if (bases.some((b) => b.nome === nome)) throw new Error(`Já existe uma base chamada ${nome} neste servidor.`);

  await pool.query(
    `CREATE DATABASE ${q(nome)} CHARACTER SET ${q(daOrigem.charset)} COLLATE ${q(daOrigem.collation)}`,
  );

  const [tabelas] = await pool.query<any[]>(
    `SELECT TABLE_NAME AS nome FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
    [origem],
  );
  const erros: string[] = [];
  for (const t of tabelas) {
    try {
      await pool.query(`CREATE TABLE ${q(nome)}.${q(t.nome)} LIKE ${q(origem)}.${q(t.nome)}`);
    } catch (err: any) {
      erros.push(`tabela ${t.nome}: ${err.sqlMessage || err.message}`);
    }
  }

  // Chaves estrangeiras: o CREATE TABLE ... LIKE não as copia, então são recriadas depois
  // que todas as tabelas existem (assim a ordem entre elas não importa).
  const [vinculos] = await pool.query<any[]>(
    `SELECT k.CONSTRAINT_NAME AS restricao, k.TABLE_NAME AS tabela, k.COLUMN_NAME AS coluna,
            k.REFERENCED_TABLE_SCHEMA AS base_ref, k.REFERENCED_TABLE_NAME AS tabela_ref,
            k.REFERENCED_COLUMN_NAME AS coluna_ref, r.UPDATE_RULE AS no_update, r.DELETE_RULE AS no_delete
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
            AND r.TABLE_NAME = k.TABLE_NAME
      WHERE k.CONSTRAINT_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [origem],
  );
  const porRestricao = new Map<string, any[]>();
  for (const v of vinculos) {
    const chave = `${v.tabela}|${v.restricao}`;
    porRestricao.set(chave, [...(porRestricao.get(chave) || []), v]);
  }
  let fks = 0;
  for (const colunas of porRestricao.values()) {
    const v = colunas[0];
    // Vínculo para outra base continua apontando para lá; dentro da base, aponta para a nova
    const baseRef = v.base_ref === origem ? nome : v.base_ref;
    try {
      await pool.query(
        `ALTER TABLE ${q(nome)}.${q(v.tabela)} ADD CONSTRAINT ${q(v.restricao)} ` +
          `FOREIGN KEY (${colunas.map((c: any) => q(c.coluna)).join(', ')}) ` +
          `REFERENCES ${q(baseRef)}.${q(v.tabela_ref)} (${colunas.map((c: any) => q(c.coluna_ref)).join(', ')}) ` +
          `ON DELETE ${v.no_delete} ON UPDATE ${v.no_update}`,
      );
      fks++;
    } catch (err: any) {
      erros.push(`chave estrangeira ${v.restricao} (${v.tabela}): ${err.sqlMessage || err.message}`);
    }
  }

  // Visões: a definição do information_schema vem sem DEFINER e com os nomes qualificados.
  // Uma visão pode usar outra, então repete as que falharam enquanto houver progresso.
  const [visoes] = await pool.query<any[]>(
    'SELECT TABLE_NAME AS nome, VIEW_DEFINITION AS sql_texto FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME',
    [origem],
  );
  let pendentes = visoes as any[];
  let ultimoErro = new Map<string, string>();
  while (pendentes.length) {
    const faltando: any[] = [];
    ultimoErro = new Map();
    for (const v of pendentes) {
      try {
        await pool.query(
          `CREATE VIEW ${q(nome)}.${q(v.nome)} AS ${trocarBase(String(v.sql_texto), origem, nome)}`,
        );
      } catch (err: any) {
        faltando.push(v);
        ultimoErro.set(v.nome, err.sqlMessage || err.message);
      }
    }
    if (faltando.length === pendentes.length) break; // sem progresso: o resto não tem como ser criado
    pendentes = faltando;
  }
  for (const v of pendentes) erros.push(`visão ${v.nome}: ${ultimoErro.get(v.nome)}`);
  const visoesCriadas = visoes.length - pendentes.length;

  // Funções e procedures: o texto completo vem do SHOW CREATE, sem o DEFINER original
  const [rotinas] = await pool.query<any[]>(
    `SELECT ROUTINE_NAME AS nome, ROUTINE_TYPE AS tipo FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_NAME`,
    [origem],
  );
  const criadas = { FUNCTION: 0, PROCEDURE: 0 } as Record<string, number>;
  for (const r of rotinas) {
    const tipo = String(r.tipo).toUpperCase() as 'PROCEDURE' | 'FUNCTION';
    try {
      const [linhas] = await pool.query<any[]>(`SHOW CREATE ${tipo} ${q(origem)}.${q(r.nome)}`);
      const bruto = linhas[0]?.[`Create ${tipo === 'FUNCTION' ? 'Function' : 'Procedure'}`];
      if (!bruto) throw new Error('definição não disponível (sem privilégio?)');
      await pool.query(trocarBase(qualificar(semDefiner(String(bruto)), tipo, r.nome, nome), origem, nome));
      criadas[tipo]++;
    } catch (err: any) {
      erros.push(`${tipo === 'FUNCTION' ? 'função' : 'procedure'} ${r.nome}: ${err.sqlMessage || err.message}`);
    }
  }

  // Triggers: recriadas na ordem de disparo (ACTION_ORDER), para o encadeamento se manter
  const [triggers] = await pool.query<any[]>(
    `SELECT TRIGGER_NAME AS nome, ACTION_TIMING AS quando, EVENT_MANIPULATION AS evento,
            EVENT_OBJECT_TABLE AS tabela, ACTION_STATEMENT AS corpo
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = ?
      ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER`,
    [origem],
  );
  let gatilhos = 0;
  for (const t of triggers) {
    try {
      await pool.query(
        `CREATE TRIGGER ${q(nome)}.${q(t.nome)} ${t.quando} ${t.evento} ON ${q(nome)}.${q(t.tabela)} ` +
          `FOR EACH ROW ${trocarBase(String(t.corpo), origem, nome)}`,
      );
      gatilhos++;
    } catch (err: any) {
      erros.push(`trigger ${t.nome}: ${err.sqlMessage || err.message}`);
    }
  }

  return {
    nome,
    tabelas: tabelas.length - erros.filter((e) => e.startsWith('tabela ')).length,
    fks,
    visoes: visoesCriadas,
    funcoes: criadas.FUNCTION,
    procedures: criadas.PROCEDURE,
    triggers: gatilhos,
    erros,
  };
}

export async function checkDbHealth(c: Conexao, base: string) {
  const startTime = Date.now();
  try {
    const [ver] = await c.pool.query<any[]>('SELECT VERSION() AS version');
    return {
      connected: true,
      latencyMs: Date.now() - startTime,
      version: ver[0]?.version,
      database: base,
      host: c.host,
      port: c.port,
      user: c.user,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message || 'Falha de conexão com MySQL',
      host: c.host,
      port: c.port,
      user: c.user,
      database: base,
    };
  }
}
