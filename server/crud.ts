import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { Conexao, poolPainel, PREFIXO_BASE, BASE_ADMIN, q } from './db.js';
import { sessaoDaRequisicao } from './sessao.js';
import {
  FieldDef,
  ResourceDef,
  carregarRecursos,
  writableFields,
  columnNames,
  recursoUsuariosPainel,
  RECURSO_USUARIOS,
} from './schema.js';
import { SENHA_PADRAO, normalizarEmail } from './cadastros.js';

/** Separador usado para chaves primárias compostas na URL: /api/crud/x/12~34 */
const PK_SEPARATOR = '~';

/** Conexão, base e metadados da requisição, resolvidos pelos headers x-conexao e x-base */
interface Contexto {
  conexao: Conexao;
  base: string;
  recursos: ResourceDef[];
}

/** Valida os headers da sessão e carrega os metadados da base escolhida */
export async function contexto(req: Request): Promise<Contexto> {
  const conexao = await sessaoDaRequisicao(req);
  const base = String(req.header('x-base') || '');
  if (!base.toLowerCase().startsWith(PREFIXO_BASE) || base.toLowerCase() === BASE_ADMIN) {
    throw new Error(`Base de dados inválida: só são administradas bases com prefixo "${PREFIXO_BASE}".`);
  }
  // O cache dos metadados é por conta de MySQL + base: cada conta enxerga o que pode
  const daBase = await carregarRecursos(conexao.pool, `${conexao.user}@${conexao.host}|${base}`, base);
  // Usuários do painel (pedweb_admin.usuarios) aparecem junto das tabelas de qualquer base,
  // lidos pelo pool do painel: a conta do usuário não precisa enxergar pedweb_admin
  const admin = conexao.usuario.super
    ? await carregarRecursos(poolPainel(), `painel|${BASE_ADMIN}`, BASE_ADMIN)
    : [];
  const usuarios = admin.find((r) => r.name === 'usuarios');
  const recursos = usuarios ? [...daBase, recursoUsuariosPainel(usuarios, BASE_ADMIN)] : daBase;
  return { conexao, base, recursos };
}

/** Converte o valor recebido do formulário para o tipo esperado pela coluna do MySQL */
function coerceValue(field: FieldDef, raw: any): any {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') {
    // Campos obrigatórios em branco viram string vazia; opcionais viram NULL
    return field.required && field.type === 'text' ? '' : null;
  }

  switch (field.type) {
    case 'number': {
      // Inteiros vão como texto para não perder precisão em BIGINT
      const s = String(raw).trim();
      if (/^-?\d+$/.test(s)) return s;
      const n = Number(s);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case 'decimal': {
      const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
    // Sim/Não gravado como 'S'/'N' (padrão das tabelas do pedWeb)
    case 'simnao':
      return raw === true || raw === 'S' || raw === 's' || raw === 1 || raw === '1' ? 'S' : 'N';
    case 'json':
      if (typeof raw === 'string') {
        try {
          JSON.parse(raw);
          return raw;
        } catch {
          throw new Error(`O campo "${field.label}" não contém um JSON válido.`);
        }
      }
      return JSON.stringify(raw);
    case 'date':
      return String(raw).slice(0, 10);
    case 'datetime':
      return String(raw).replace('T', ' ').slice(0, 19);
    default:
      return String(raw);
  }
}

/** Data/hora atual no horário de Brasília, no formato do MySQL: 2026-09-18 16:30:00 */
function agoraBrasilia(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Chave id_app no mesmo formato do aplicativo pedWeb (lib/utils.ts): data e hora de
 * Brasília com milissegundos, mais 8 dígitos aleatórios.
 */
function gerarIdApp(): string {
  const agora = agoraBrasilia().replace(/\D/g, '');
  const milissegundos = String(Date.now() % 1000).padStart(3, '0');
  const aleatorio = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  return `${agora}${milissegundos}${aleatorio}`;
}

/**
 * Preenche as datas automáticas que o banco não preenche sozinho: na inclusão, todas;
 * na alteração, só as de "alteração" (date_update, datahora_alteracao...).
 */
function preencherAutomaticos(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const agora = agoraBrasilia();
  for (const f of resource.fields) {
    if (!f.automatico) continue;
    const preencher = isUpdate ? f.automatico === 'alteracao' && !f.onUpdate : !f.defaultAgora;
    if (preencher) payload[f.name] = f.type === 'date' ? agora.slice(0, 10) : agora;
  }
}

/** Monta o payload de gravação a partir do corpo da requisição, aplicando a whitelist de colunas */
function buildWritePayload(resource: ResourceDef, body: Record<string, any>): Record<string, any> {
  const payload: Record<string, any> = {};
  for (const field of writableFields(resource)) {
    if (!(field.name in body)) continue;
    // Senha: em branco mantém a senha atual. Grava em bcrypt, salvo onde o sistema de
    // origem compara em texto puro (app_usuarios do pedWeb), marcado com hash: false.
    if (field.type === 'password') {
      const plain = String(body[field.name] ?? '');
      if (plain.trim() !== '') {
        payload[field.name] = field.hash === false ? plain : bcrypt.hashSync(plain, bcrypt.genSaltSync(10));
      }
      continue;
    }
    payload[field.name] = coerceValue(field, body[field.name]);
  }
  return payload;
}

/** Valida os campos obrigatórios antes de tocar no banco, para devolver mensagem amigável */
function validateRequired(resource: ResourceDef, payload: Record<string, any>, isUpdate: boolean) {
  const faltando: string[] = [];
  for (const field of writableFields(resource)) {
    if (!field.required) continue;
    if (isUpdate && !(field.name in payload)) continue;
    const value = payload[field.name];
    if (value === null || value === undefined || value === '') faltando.push(field.label);
  }
  if (faltando.length) {
    throw new Error(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
  }
}

/** Traduz erros do MySQL para mensagens legíveis ao operador */
function friendlyDbError(err: any): string {
  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      return `Já existe um registro com esse valor único (${err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'chave duplicada'}).`;
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return 'Este registro não pode ser excluído porque existem registros vinculados a ele.';
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return 'Um dos vínculos informados (chave estrangeira) não existe. Verifique os campos de seleção.';
    case 'ER_DATA_TOO_LONG':
      return `Um dos campos excedeu o tamanho permitido: ${err.sqlMessage || ''}`;
    case 'ER_BAD_NULL_ERROR':
      return `Um campo obrigatório ficou em branco: ${err.sqlMessage || ''}`;
    case 'WARN_DATA_TRUNCATED':
      return 'Um dos valores selecionados não é aceito por esta coluna. Verifique os campos de seleção.';
    default:
      return err?.sqlMessage || err?.message || 'Erro inesperado ao acessar o banco de dados.';
  }
}

/** Decompõe o parâmetro :id em condição WHERE respeitando chaves compostas */
function pkCondition(resource: ResourceDef, idParam: string): { sql: string; params: any[] } {
  if (!resource.pk.length) throw new Error(`A tabela ${resource.table} não tem chave primária.`);
  const parts = String(idParam).split(PK_SEPARATOR);
  if (parts.length !== resource.pk.length) {
    throw new Error(`Identificador inválido: a tabela usa chave ${resource.pk.join(' + ')}.`);
  }
  return { sql: resource.pk.map((c) => `t.${q(c)} = ?`).join(' AND '), params: parts };
}

/** `base`.`tabela` */
const tabelaSql = (ctx: Contexto, resource: ResourceDef) => `${q(resource.schema || ctx.base)}.${q(resource.table)}`;

/**
 * Pool certo para o recurso: a tabela do painel (pedweb_admin) é lida pelas credenciais
 * do .env; as bases pedweb*, pela conta de MySQL do usuário logado.
 */
const poolDe = (ctx: Contexto, resource: ResourceDef) =>
  resource.schema === BASE_ADMIN ? poolPainel() : ctx.conexao.pool;

/** Colunas lidas explicitamente: as binárias ficam de fora do metadado e a senha nunca vai ao navegador */
const selectSql = (resource: ResourceDef) =>
  resource.fields
    .filter((f) => f.type !== 'password')
    .map((f) => `t.${q(f.name)}`)
    .join(', ');

function resolveResource(ctx: Contexto, nome: string): ResourceDef {
  const resource = ctx.recursos.find((r) => r.name === nome);
  if (!resource) throw new Error(`A tabela "${nome}" não existe na base ${ctx.base}.`);
  return resource;
}

/** Envolve a rota: resolve o contexto e devolve erros no formato { error } */
const rota =
  (fn: (ctx: Contexto, req: Request, res: Response) => Promise<any>) =>
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      await fn(await contexto(req), req, res);
    } catch (err: any) {
      res.status(err.status || 400).json({ error: friendlyDbError(err) });
    }
  };

export function createCrudRouter() {
  const router = Router();

  // --------------------------------------------------------
  // Metadados: alimenta as telas genéricas de CRUD
  // --------------------------------------------------------
  router.get(
    '/meta/resources',
    rota(async (ctx, _req, res) => res.json(ctx.recursos)),
  );

  // --------------------------------------------------------
  // Opções de chave estrangeira (combos dos formulários)
  // --------------------------------------------------------
  router.get(
    '/options/:resource',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      const labelField = String(req.query.label_field || resource.labelField);
      if (!columnNames(resource).includes(labelField)) {
        throw new Error(`Campo de rótulo "${labelField}" inválido.`);
      }
      if (!resource.pk.length) return res.json([]);

      const pkCol = q(resource.pk[0]);
      const [rows] = await poolDe(ctx, resource).query<any[]>(
        `SELECT t.${pkCol} AS value, t.${q(labelField)} AS label
           FROM ${tabelaSql(ctx, resource)} t
          ORDER BY t.${q(labelField)} ASC
          LIMIT 1000`,
      );
      res.json(rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) })));
    }),
  );

  // --------------------------------------------------------
  // Listagem paginada com busca e ordenação
  // --------------------------------------------------------
  router.get(
    '/crud/:resource',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      const colunas = columnNames(resource);

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const offset = (page - 1) * limit;

      const sortField = colunas.includes(String(req.query.sort)) ? String(req.query.sort) : resource.defaultSort.field;
      const dirQ = String(req.query.dir).toLowerCase();
      const sortDir = dirQ === 'asc' ? 'ASC' : dirQ === 'desc' ? 'DESC' : resource.defaultSort.dir.toUpperCase();

      const where: string[] = ['1 = 1'];
      const params: any[] = [];

      // Busca textual nos campos marcados como searchable
      const search = String(req.query.search || '').trim();
      if (search) {
        const searchable = resource.fields.filter((f) => f.searchable);
        if (searchable.length) {
          where.push(`(${searchable.map((f) => `t.${q(f.name)} LIKE ?`).join(' OR ')})`);
          searchable.forEach(() => params.push(`%${search}%`));
        }
      }

      // Filtro exato por coluna: ?filter_field=status&filter_value=aberto
      const filterField = String(req.query.filter_field || '');
      const filterValue = req.query.filter_value;
      if (filterField && filterValue !== undefined && filterValue !== '' && colunas.includes(filterField)) {
        where.push(`t.${q(filterField)} = ?`);
        params.push(filterValue);
      }

      // Busca avançada: ?filters=[{"field":"categoria","op":"contains","value":"semente"}]
      // Coluna e operador passam por whitelist; o valor vai sempre como parâmetro.
      const filtersRaw = String(req.query.filters || '').trim();
      if (filtersRaw) {
        let parsed: any[];
        try {
          parsed = JSON.parse(filtersRaw);
        } catch {
          throw new Error('Parâmetro "filters" não contém um JSON válido.');
        }
        if (!Array.isArray(parsed)) throw new Error('Parâmetro "filters" deve ser uma lista.');
        if (parsed.length > 20) throw new Error('São aceitos no máximo 20 filtros por consulta.');

        const OPS: Record<string, string> = { eq: '=', ne: '<>', gte: '>=', lte: '<=' };
        for (const f of parsed) {
          const campo = String(f?.field || '');
          const op = String(f?.op || '');
          const valor = f?.value;
          if (!colunas.includes(campo)) {
            throw new Error(`Filtro inválido: a coluna "${campo}" não existe em ${resource.table}.`);
          }
          if (valor === undefined || valor === null || valor === '') continue;
          if (op === 'contains') {
            where.push(`t.${q(campo)} LIKE ?`);
            params.push(`%${valor}%`);
          } else if (OPS[op]) {
            where.push(`t.${q(campo)} ${OPS[op]} ?`);
            params.push(valor);
          } else {
            throw new Error(`Filtro inválido: operador "${op}" não é suportado.`);
          }
        }
      }

      const whereSql = where.join(' AND ');
      const [countRows] = await poolDe(ctx, resource).query<any[]>(
        `SELECT COUNT(*) AS total FROM ${tabelaSql(ctx, resource)} t WHERE ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total || 0);

      const [rows] = await poolDe(ctx, resource).query<any[]>(
        `SELECT ${selectSql(resource)} FROM ${tabelaSql(ctx, resource)} t
          WHERE ${whereSql}
          ORDER BY t.${q(sortField)} ${sortDir}
          LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );

      res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    }),
  );

  // --------------------------------------------------------
  // Leitura de um registro
  // --------------------------------------------------------
  router.get(
    '/crud/:resource/:id',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      const cond = pkCondition(resource, req.params.id);
      const [rows] = await poolDe(ctx, resource).query<any[]>(
        `SELECT ${selectSql(resource)} FROM ${tabelaSql(ctx, resource)} t WHERE ${cond.sql} LIMIT 1`,
        cond.params,
      );
      if (!rows.length) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json(rows[0]);
    }),
  );

  // --------------------------------------------------------
  // Criar o usuário do aplicativo a partir de um vendedor
  // --------------------------------------------------------
  router.post(
    '/acoes/criar-usuario-vendedor/:id',
    rota(async (ctx, req, res) => {
      const vendedores = resolveResource(ctx, 'app_vendedores');
      const usuarios = resolveResource(ctx, 'app_usuarios');
      const cond = pkCondition(vendedores, req.params.id);

      const [linhas] = await ctx.conexao.pool.query<any[]>(
        `SELECT ${selectSql(vendedores)} FROM ${tabelaSql(ctx, vendedores)} t WHERE ${cond.sql} LIMIT 1`,
        cond.params,
      );
      const vendedor = linhas[0];
      if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado.' });

      const [jaTem] = await ctx.conexao.pool.query<any[]>(
        `SELECT ${q('nome')}, ${q('email')} FROM ${tabelaSql(ctx, usuarios)} WHERE ${q('vendedor_id_app')} = ? LIMIT 1`,
        [vendedor.id_app],
      );
      if (jaTem.length) {
        throw new Error(`Este vendedor já tem usuário: ${jaTem[0].nome || jaTem[0].email || 'sem nome'}.`);
      }

      // O login do aplicativo é o e-mail, então ele vem informado na confirmação
      const login = normalizarEmail(req.body?.email ?? vendedor.email);
      if (!login) throw new Error('Informe um e-mail válido: é com ele que o vendedor entra no aplicativo.');

      const [emailUsado] = await ctx.conexao.pool.query<any[]>(
        `SELECT ${q('nome')} FROM ${tabelaSql(ctx, usuarios)} WHERE LOWER(TRIM(${q('email')})) = ? LIMIT 1`,
        [login],
      );
      if (emailUsado.length) {
        throw new Error(`Já existe um usuário com o e-mail ${login} (${emailUsado[0].nome || 'sem nome'}).`);
      }

      // Só as colunas que existem nesta base são gravadas
      const valores: Record<string, any> = {
        id_app: gerarIdApp(),
        nome: vendedor.nome,
        email: login,
        senha: SENHA_PADRAO,
        admin: 'N',
        sigla: String(vendedor.apelido || vendedor.nome || '').slice(0, 3).toUpperCase(),
        vendedor_id_app: vendedor.id_app,
      };
      const payload: Record<string, any> = {};
      for (const f of usuarios.fields) {
        if (f.name in valores && valores[f.name] !== null && valores[f.name] !== undefined) {
          payload[f.name] = valores[f.name];
        }
      }
      preencherAutomaticos(usuarios, payload, false);

      const cols = Object.keys(payload);
      await ctx.conexao.pool.query(
        `INSERT INTO ${tabelaSql(ctx, usuarios)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => payload[c]),
      );
      res.json({ success: true, login, senha: SENHA_PADRAO, nome: vendedor.nome });
    }),
  );

  // --------------------------------------------------------
  // Inclusão
  // --------------------------------------------------------
  router.post(
    '/crud/:resource',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      const payload = buildWritePayload(resource, req.body || {});
      validateRequired(resource, payload, false);
      // Campo em branco na inclusão fica fora do INSERT, para valer o DEFAULT da coluna
      for (const c of Object.keys(payload)) if (payload[c] === null) delete payload[c];
      // Chave do pedWeb em branco: o painel gera, como o aplicativo faz
      for (const f of resource.fields) {
        if (f.gerarId && !payload[f.name]) payload[f.name] = gerarIdApp();
      }
      const senha = resource.fields.find((f) => f.type === 'password');
      if (senha && !payload[senha.name]) throw new Error(`Informe a ${senha.label} do novo usuário.`);
      preencherAutomaticos(resource, payload, false);

      const cols = Object.keys(payload);
      if (!cols.length) return res.status(400).json({ error: 'Nenhum campo foi informado para gravação.' });

      const [result] = await poolDe(ctx, resource).query<any>(
        `INSERT INTO ${tabelaSql(ctx, resource)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => payload[c]),
      );
      const newId = resource.autoIncrement
        ? String(result.insertId)
        : resource.pk.map((c) => payload[c]).join(PK_SEPARATOR);
      res.json({ success: true, id: newId });
    }),
  );

  // --------------------------------------------------------
  // Alteração
  // --------------------------------------------------------
  router.put(
    '/crud/:resource/:id',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      if (!resource.canUpdate) {
        return res.status(403).json({ error: `A tabela ${resource.table} não tem chave primária: alteração bloqueada.` });
      }
      const payload = buildWritePayload(resource, req.body || {});
      // A chave primária não é alterada: identifica a linha
      for (const c of resource.pk) delete payload[c];
      validateRequired(resource, payload, true);

      if (!Object.keys(payload).length) return res.status(400).json({ error: 'Nenhuma alteração foi informada.' });
      preencherAutomaticos(resource, payload, true);
      const cols = Object.keys(payload);

      const cond = pkCondition(resource, req.params.id);
      const [result] = await poolDe(ctx, resource).query<any>(
        `UPDATE ${tabelaSql(ctx, resource)} t SET ${cols.map((c) => `t.${q(c)} = ?`).join(', ')} WHERE ${cond.sql}`,
        [...cols.map((c) => payload[c]), ...cond.params],
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json({ success: true });
    }),
  );

  // --------------------------------------------------------
  // Exclusão
  // --------------------------------------------------------
  router.delete(
    '/crud/:resource/:id',
    rota(async (ctx, req, res) => {
      const resource = resolveResource(ctx, req.params.resource);
      if (!resource.canDelete) {
        return res.status(403).json({ error: `A tabela ${resource.table} não tem chave primária: exclusão bloqueada.` });
      }
      // O usuário logado não pode excluir a si mesmo (perderia o acesso no meio da sessão)
      if (resource.name === RECURSO_USUARIOS && String(req.params.id) === ctx.conexao.usuario?.id) {
        return res.status(400).json({ error: 'Você não pode excluir o seu próprio usuário.' });
      }
      const cond = pkCondition(resource, req.params.id);
      const [result] = await poolDe(ctx, resource).query<any>(
        `DELETE t FROM ${tabelaSql(ctx, resource)} t WHERE ${cond.sql}`,
        cond.params,
      );
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json({ success: true });
    }),
  );

  return router;
}
