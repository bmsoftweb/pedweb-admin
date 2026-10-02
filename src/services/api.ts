import {
  ResourceDef,
  ListaPaginada,
  FiltroAvancado,
  RegistroCrud,
  OpcaoRef,
  DbConnectionStatus,
  ConexaoAtiva,
  BaseDados,
  UsuarioPainel,
} from '../types';

/**
 * O token da conexão MySQL e a base escolhida acompanham toda requisição nos
 * headers x-conexao e x-base.
 */
let tokenAtual: string | null = null;
let baseAtual: string | null = null;

export function setConexaoSessao(token: string | null) {
  tokenAtual = token;
}

export function setBaseSessao(base: string | null) {
  baseAtual = base;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (tokenAtual) h['x-conexao'] = tokenAtual;
  if (baseAtual) h['x-base'] = baseAtual;
  return h;
}

/** Disparado quando o servidor não reconhece mais a conexão (ex.: servidor reiniciado) */
let aoExpirar: (msg: string) => void = () => {};
export function onConexaoExpirada(fn: (msg: string) => void) {
  aoExpirar = fn;
}

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Falha na requisição (HTTP ${res.status}).`;
    if (res.status === 401) aoExpirar(msg);
    throw new Error(msg);
  }
  return data;
}

// ------------------------------------------------------------
// Conexão e escolha da base
// ------------------------------------------------------------
/**
 * Login do painel: valida usuário e senha em pedweb_admin.usuarios e já abre, no
 * servidor, a conexão MySQL com as credenciais gravadas na linha desse usuário.
 */
export async function login(payload: { usuario: string; senha: string }): Promise<ConexaoAtiva> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha no login (HTTP ${res.status}).`);
  return data;
}

/** Preferências das listas do usuário (larguras, ordem e colunas visíveis), em usuarios.config_listas */
export async function fetchConfigListas(): Promise<Record<string, unknown>> {
  const res = await fetch('/api/config-listas', { headers: headers() });
  return parseOrThrow(res);
}

export async function saveConfigListas(config: Record<string, unknown>): Promise<void> {
  await fetch('/api/config-listas', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(config),
  });
}

export async function desconectar(): Promise<void> {
  await fetch('/api/conexao', { method: 'DELETE', headers: headers() }).catch(() => {});
}

export async function fetchBases(): Promise<BaseDados[]> {
  const res = await fetch('/api/bases', { headers: headers() });
  return parseOrThrow(res);
}

export interface BaseClonada {
  nome: string;
  tabelas: number;
  fks: number;
  visoes: number;
  funcoes: number;
  procedures: number;
  triggers: number;
  /** Objetos que não puderam ser copiados (privilégio, dependência externa…) */
  erros: string[];
}

/** Cria uma base nova com a mesma estrutura de outra (sem os dados) */
export async function clonarBase(origem: string, nome: string): Promise<BaseClonada> {
  const res = await fetch('/api/bases', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ origem, nome }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Liberação de bases por conta do MySQL (só super usuário)
// ------------------------------------------------------------
export interface UsuarioMysql {
  usuario: string;
  host: string;
  /** Tem privilégio global: enxerga todas as bases, marcadas ou não */
  global: boolean;
  /** Conta usada por esta conexão do painel: não pode ser alterada */
  atual: boolean;
}

export async function fetchUsuariosMysql(): Promise<UsuarioMysql[]> {
  const res = await fetch('/api/mysql/usuarios', { headers: headers() });
  return parseOrThrow(res);
}

export async function fetchBasesDoUsuarioMysql(usuario: string, host: string): Promise<string[]> {
  const qs = new URLSearchParams({ usuario, host });
  const res = await fetch(`/api/mysql/usuarios/bases?${qs.toString()}`, { headers: headers() });
  return (await parseOrThrow(res)).bases;
}

export async function salvarBasesDoUsuarioMysql(
  usuario: string,
  host: string,
  bases: string[],
): Promise<{ conceder: string[]; revogar: string[]; erros: string[]; bases: string[] }> {
  const res = await fetch('/api/mysql/usuarios/bases', {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ usuario, host, bases }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Metadados e status
// ------------------------------------------------------------
export async function fetchResources(): Promise<ResourceDef[]> {
  const res = await fetch('/api/meta/resources', { headers: headers() });
  return parseOrThrow(res);
}

export async function fetchDbStatus(): Promise<DbConnectionStatus> {
  try {
    const res = await fetch('/api/db/status', { headers: headers() });
    return await res.json();
  } catch (err: any) {
    return { connected: false, latencyMs: 0, error: err.message || 'Falha ao conectar com a API' };
  }
}

// ------------------------------------------------------------
// CRUD genérico
// ------------------------------------------------------------
export async function listRecords(
  resource: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    filterField?: string;
    filterValue?: string;
    filters?: FiltroAvancado[];
  } = {},
): Promise<ListaPaginada> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.filterField && params.filterValue) {
    qs.set('filter_field', params.filterField);
    qs.set('filter_value', params.filterValue);
  }
  if (params.filters && params.filters.length) {
    qs.set('filters', JSON.stringify(params.filters));
  }

  const res = await fetch(`/api/crud/${encodeURIComponent(resource)}?${qs.toString()}`, { headers: headers() });
  return parseOrThrow(res);
}

export async function getRecord(resource: string, id: string): Promise<RegistroCrud> {
  const res = await fetch(`/api/crud/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`, { headers: headers() });
  return parseOrThrow(res);
}

export async function createRecord(
  resource: string,
  payload: RegistroCrud,
): Promise<{ success: boolean; id: string }> {
  const res = await fetch(`/api/crud/${encodeURIComponent(resource)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function updateRecord(
  resource: string,
  id: string,
  payload: RegistroCrud,
): Promise<{ success: boolean }> {
  const res = await fetch(`/api/crud/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(res);
}

export async function deleteRecord(resource: string, id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/crud/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return parseOrThrow(res);
}

/** Cria o usuário do aplicativo a partir de um vendedor, com a senha padrão */
export async function criarUsuarioDoVendedor(
  idVendedor: string,
  email: string,
): Promise<{ login: string; senha: string; nome: string }> {
  const res = await fetch(`/api/acoes/criar-usuario-vendedor/${encodeURIComponent(idVendedor)}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email }),
  });
  return parseOrThrow(res);
}

// ------------------------------------------------------------
// Combos de chave estrangeira, com cache em memória
// ------------------------------------------------------------
const optionsCache = new Map<string, OpcaoRef[]>();

export async function fetchOptions(resource: string, labelField: string): Promise<OpcaoRef[]> {
  const key = `${resource}:${labelField}`;
  const cached = optionsCache.get(key);
  if (cached) return cached;

  const res = await fetch(
    `/api/options/${encodeURIComponent(resource)}?label_field=${encodeURIComponent(labelField)}`,
    { headers: headers() },
  );
  const data = await parseOrThrow(res);
  optionsCache.set(key, data);
  return data;
}

/** Invalida o cache de combos após gravações que alteram listas de referência */
export function invalidateOptions(resource?: string) {
  if (!resource) {
    optionsCache.clear();
    return;
  }
  for (const key of Array.from(optionsCache.keys())) {
    if (key.startsWith(`${resource}:`)) optionsCache.delete(key);
  }
}
