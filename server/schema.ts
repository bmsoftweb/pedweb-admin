/**
 * Metadados das tabelas, lidos do INFORMATION_SCHEMA da base escolhida.
 *
 * No b2b admin este registro é escrito à mão; aqui ele é montado a partir do banco,
 * no mesmo formato, para que as telas genéricas (CrudView, RecordForm) funcionem
 * igual. O backend usa o resultado como whitelist de tabelas e colunas.
 */
import mysql from 'mysql2/promise';
import { aplicarCadastro } from './cadastros.js';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'boolean'
  | 'json'
  | 'password'
  | 'simnao';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Gerado pelo banco (auto_increment, coluna calculada): nunca vai em INSERT/UPDATE */
  readOnly?: boolean;
  /** Senha gravada em bcrypt; false grava como digitada (o pedWeb compara em texto puro) */
  hash?: boolean;
  /** Chave do registro gerada pelo painel quando vem em branco (id_app do pedWeb) */
  gerarId?: boolean;
  /** Data/hora de criação ou atualização preenchida automaticamente: fora da edição */
  automatico?: 'cadastro' | 'alteracao';
  /** O banco preenche na inclusão (DEFAULT CURRENT_TIMESTAMP/NOW()) */
  defaultAgora?: boolean;
  /** O banco preenche na alteração (ON UPDATE CURRENT_TIMESTAMP) */
  onUpdate?: boolean;
  listed?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  options?: { value: string; label: string }[];
  ref?: { resource: string; labelField: string };
  scale?: number;
  maxLength?: number;
  allowNegative?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export interface ResourceDef {
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  icon: string;
  group: 'tabelas' | 'painel' | 'cadastros';
  /** Base da tabela quando não é a base escolhida (ex.: pedweb_admin.usuarios) */
  schema?: string;
  pk: string[];
  autoIncrement: boolean;
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Linhas aproximadas (TABLE_ROWS), usado na visão geral */
  linhas: number;
  fields: FieldDef[];
}

/** Colunas binárias não são lidas nem gravadas pelo CRUD */
const BINARIOS = new Set(['blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary', 'bit', 'geometry', 'point', 'linestring', 'polygon']);
const INTEIROS = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'year']);
const DECIMAIS = new Set(['decimal', 'numeric', 'float', 'double', 'real']);
const TEXTOS_LONGOS = new Set(['text', 'tinytext', 'mediumtext', 'longtext']);

function tipoDoCampo(c: any): FieldType {
  const dt = String(c.DATA_TYPE).toLowerCase();
  const ct = String(c.COLUMN_TYPE).toLowerCase();
  if (ct.startsWith('tinyint(1)')) return 'boolean';
  if (INTEIROS.has(dt)) return 'number';
  if (DECIMAIS.has(dt)) return 'decimal';
  if (dt === 'date') return 'date';
  if (dt === 'datetime' || dt === 'timestamp') return 'datetime';
  if (dt === 'enum') return 'enum';
  if (dt === 'json') return 'json';
  if (TEXTOS_LONGOS.has(dt)) return 'textarea';
  return 'text';
}

/** enum('a','b') -> ['a','b'] */
function opcoesEnum(columnType: string) {
  const m = String(columnType).match(/^enum\((.*)\)$/i);
  if (!m) return [];
  return [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) => {
    const v = x[1].replace(/''/g, "'");
    return { value: v, label: v };
  });
}

/** Colunas mais importantes: vêm logo depois do id_app (ou da PK) */
const IMPORTANTE = /(^|_)(descricao|nome|razao_social|nome_fantasia|fantasia)($|_)/i;

/** Nomes usados no pedWeb para data/hora de criação e atualização */
const NOME_AUTOMATICO = /^(date_update|datahora_cadastro|datahora_alteracao|data_cadastro|data_alteracao|created_at|updated_at)$/i;

/**
 * Data/hora preenchida pelo banco (DEFAULT CURRENT_TIMESTAMP/NOW(), ON UPDATE) ou pelo app
 * (nomes conhecidos). O que o banco não preencher sozinho, o CRUD preenche (server/crud.ts).
 */
function automaticoDe(c: any, type: FieldType) {
  if (type !== 'datetime' && type !== 'date') return {};
  const defaultAgora = /current_timestamp|now\(/i.test(String(c.COLUMN_DEFAULT ?? ''));
  const onUpdate = /on update/i.test(c.EXTRA || '');
  if (!defaultAgora && !onUpdate && !NOME_AUTOMATICO.test(c.COLUMN_NAME)) return {};
  const alteracao = onUpdate || /update|alteracao/i.test(c.COLUMN_NAME);
  return {
    automatico: (alteracao ? 'alteracao' : 'cadastro') as FieldDef['automatico'],
    defaultAgora: defaultAgora || undefined,
    onUpdate: onUpdate || undefined,
  };
}

// ponytail: cache sem expiração por conexão+base; o botão "Recarregar estrutura" limpa
const cache = new Map<string, ResourceDef[]>();

export function limparCacheMetadados(prefixo: string) {
  for (const k of cache.keys()) if (k.startsWith(prefixo)) cache.delete(k);
}

export async function carregarRecursos(pool: mysql.Pool, chave: string, base: string): Promise<ResourceDef[]> {
  const guardado = cache.get(chave);
  if (guardado) return guardado;

  const [tabelas] = await pool.query<any[]>(
    `SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [base],
  );
  const [colunas] = await pool.query<any[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            COLUMN_KEY, EXTRA, CHARACTER_MAXIMUM_LENGTH, NUMERIC_SCALE, COLUMN_COMMENT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [base],
  );
  const [chaves] = await pool.query<any[]>(
    `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`,
    [base],
  );

  const colunasPorTabela = new Map<string, any[]>();
  for (const c of colunas) {
    const lista = colunasPorTabela.get(c.TABLE_NAME) || [];
    lista.push(c);
    colunasPorTabela.set(c.TABLE_NAME, lista);
  }

  // Rótulo de combo de uma tabela: descrição/nome, senão a primeira coluna de texto fora da PK, senão a própria PK
  const rotuloDe = (tabela: string, pk: string) => {
    const cols = colunasPorTabela.get(tabela) || [];
    const textos = cols.filter(
      (c) => ['varchar', 'char'].includes(String(c.DATA_TYPE).toLowerCase()) && !pkDe(tabela).includes(c.COLUMN_NAME),
    );
    return (textos.find((c) => IMPORTANTE.test(c.COLUMN_NAME)) || textos[0])?.COLUMN_NAME || pk;
  };

  const pkDe = (tabela: string) =>
    chaves.filter((k) => k.TABLE_NAME === tabela && k.CONSTRAINT_NAME === 'PRIMARY').map((k) => String(k.COLUMN_NAME));

  const recursos: ResourceDef[] = [];
  for (const t of tabelas) {
    const nome = String(t.TABLE_NAME);
    const daTabela = chaves.filter((k) => k.TABLE_NAME === nome);
    const pk = pkDe(nome);

    // Ordem: id_app (ou PK), depois descrição/nome, depois o resto na ordem da tabela
    const todas = (colunasPorTabela.get(nome) || []).filter((c) => !BINARIOS.has(String(c.DATA_TYPE).toLowerCase()));
    const inicio = todas.some((c) => c.COLUMN_NAME === 'id_app') ? ['id_app'] : pk;
    const peso = (c: any) => (inicio.includes(c.COLUMN_NAME) ? 0 : IMPORTANTE.test(c.COLUMN_NAME) ? 1 : 2);
    const cols = [...todas].sort((a, b) => peso(a) - peso(b));
    if (!cols.length) continue;

    // Chave estrangeira de uma coluna só vira combo; compostas ficam como campo comum
    const fks = new Map<string, { tabela: string; coluna: string }>();
    const porConstraint = new Map<string, any[]>();
    for (const k of daTabela.filter((k) => k.REFERENCED_TABLE_NAME)) {
      const l = porConstraint.get(k.CONSTRAINT_NAME) || [];
      l.push(k);
      porConstraint.set(k.CONSTRAINT_NAME, l);
    }
    for (const l of porConstraint.values()) {
      if (l.length === 1) fks.set(l[0].COLUMN_NAME, { tabela: l[0].REFERENCED_TABLE_NAME, coluna: l[0].REFERENCED_COLUMN_NAME });
    }

    const autoIncrement = cols.some((c) => /auto_increment/i.test(c.EXTRA));
    let listados = 0;
    const fields: FieldDef[] = cols.map((c) => {
      const type = tipoDoCampo(c);
      const extra = String(c.EXTRA || '');
      // DEFAULT_GENERATED (default por expressão) não é coluna calculada
      const gerado = /auto_increment|virtual generated|stored generated/i.test(extra);
      const auto = automaticoDe(c, type);
      const automatico = Boolean(auto.automatico);
      const fk = fks.get(c.COLUMN_NAME);
      const texto = type === 'text';
      // id_app é a chave do pedWeb: em branco na inclusão, o painel gera uma (server/crud.ts)
      const gerarId = c.COLUMN_NAME === 'id_app' && texto && pk.length === 1 && pk[0] === 'id_app';
      // As 10 primeiras colunas "curtas" aparecem na grade
      const listed = type !== 'textarea' && type !== 'json' && listados < 10;
      if (listed) listados++;
      return {
        name: c.COLUMN_NAME,
        label: c.COLUMN_NAME,
        type,
        required:
          c.IS_NULLABLE === 'NO' && c.COLUMN_DEFAULT === null && !gerado && !automatico && !gerarId && type !== 'boolean',
        readOnly: gerado || automatico || undefined,
        gerarId: gerarId || undefined,
        hint: gerarId ? 'Em branco: o painel gera a chave, como o aplicativo faz' : c.COLUMN_COMMENT || undefined,
        ...auto,
        listed,
        searchable: texto || undefined,
        filterable: type !== 'textarea' && type !== 'json' ? true : undefined,
        options: type === 'enum' ? opcoesEnum(c.COLUMN_TYPE) : undefined,
        // O combo usa a PK da tabela referenciada como valor; FK para outra coluna fica como campo comum
        ref:
          fk && pkDe(fk.tabela).join() === fk.coluna
            ? { resource: fk.tabela, labelField: rotuloDe(fk.tabela, fk.coluna) }
            : undefined,
        scale: type === 'decimal' ? Math.min(Number(c.NUMERIC_SCALE ?? 2), 6) : undefined,
        maxLength: texto && c.CHARACTER_MAXIMUM_LENGTH ? Number(c.CHARACTER_MAXIMUM_LENGTH) : undefined,
        allowNegative: (type === 'number' || type === 'decimal') && !/unsigned/i.test(c.COLUMN_TYPE),
        width: type === 'number' && pk.includes(c.COLUMN_NAME) ? 'xs' : undefined,
      };
    });

    // Sem chave primária não há como identificar a linha: só inclusão e consulta
    const temPk = pk.length > 0 && pk.every((p) => fields.some((f) => f.name === p));
    const bruto: ResourceDef = {
      name: nome,
      table: nome,
      label: nome,
      labelSingular: 'Registro',
      description: t.TABLE_COMMENT || `Tabela ${nome} da base ${base}`,
      icon: 'Table',
      group: 'tabelas',
      pk: temPk ? pk : [],
      autoIncrement,
      labelField: rotuloDe(nome, pk[0] || fields[0].name),
      defaultSort: { field: temPk ? pk[0] : fields[0].name, dir: 'asc' },
      canCreate: true,
      canUpdate: temPk,
      canDelete: temPk,
      linhas: Number(t.TABLE_ROWS || 0),
      fields,
    };
    // Tabelas com cadastro próprio ganham rótulos, ordem e tipos desenhados à mão
    recursos.push(aplicarCadastro(bruto));
  }

  cache.set(chave, recursos);
  return recursos;
}

/** Nome do recurso dos usuários do painel (pedweb_admin.usuarios) */
export const RECURSO_USUARIOS = 'painel_usuarios';

/**
 * Recurso de pedweb_admin.usuarios, exibido junto das tabelas de qualquer base.
 * A senha vira campo de senha (gravada em bcrypt) e config_listas fica de fora:
 * é mantido pelo próprio painel.
 */
export function recursoUsuariosPainel(r: ResourceDef, base: string): ResourceDef {
  return {
    ...r,
    name: RECURSO_USUARIOS,
    label: 'Usuários do Painel',
    labelSingular: 'Usuário',
    description: `Usuários com acesso a este painel (${base}.usuarios)`,
    icon: 'Users',
    group: 'painel',
    schema: base,
    fields: r.fields
      .filter((f) => f.name !== 'config_listas')
      .map((f) => {
        // Senha do painel: bcrypt
        if (f.name === 'senha_hash' || f.name === 'senha') {
          return { ...f, label: 'Senha', type: 'password', required: false, listed: false, searchable: undefined, filterable: undefined } as typeof f;
        }
        // Credenciais de MySQL do usuário: é com elas que ele administra as bases.
        // A senha do MySQL precisa ser usada para conectar, então é gravada como digitada.
        const mysql: Record<string, Partial<typeof f>> = {
          mysql_host: { label: 'Servidor MySQL (host)', listed: true },
          host: { label: 'Servidor MySQL (host)', listed: true },
          mysql_port: { label: 'Porta', listed: true, width: 'xs' },
          mysql_porta: { label: 'Porta', listed: true, width: 'xs' },
          mysql_user: { label: 'Usuário do MySQL', listed: true },
          mysql_usuario: { label: 'Usuário do MySQL', listed: true },
          mysql_senha: { label: 'Senha do MySQL', type: 'password', hash: false, required: false, listed: false },
          mysql_password: { label: 'Senha do MySQL', type: 'password', hash: false, required: false, listed: false },
          senha_mysql: { label: 'Senha do MySQL', type: 'password', hash: false, required: false, listed: false },
        };
        return mysql[f.name] ? ({ ...f, ...mysql[f.name] } as typeof f) : f;
      }),
  };
}

/** Colunas graváveis: exclui geradas pelo banco e a PK auto-increment */
export function writableFields(resource: ResourceDef): FieldDef[] {
  return resource.fields.filter((f) => {
    if (f.readOnly) return false;
    if (resource.autoIncrement && resource.pk.includes(f.name)) return false;
    return true;
  });
}

/** Colunas aceitas em ordenação, filtros e rótulos (a senha nunca entra) */
export function columnNames(resource: ResourceDef): string[] {
  return resource.fields.filter((f) => f.type !== 'password').map((f) => f.name);
}
