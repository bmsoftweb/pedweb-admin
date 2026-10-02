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
  /** Sim/Não gravado como 'S'/'N' (padrão das tabelas do pedWeb) */
  | 'simnao';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  /** Data/hora de criação ou atualização preenchida automaticamente: fora da edição */
  automatico?: 'cadastro' | 'alteracao';
  listed?: boolean;
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  options?: { value: string; label: string }[];
  ref?: { resource: string; labelField: string };
  scale?: number;
  maxLength?: number;
  /** Campo numérico que aceita valor negativo */
  allowNegative?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg';
}

export type ResourceGroup = 'tabelas' | 'painel' | 'cadastros';

/** Grade filha exibida ao selecionar uma linha da listagem (mestre-detalhe) */
export interface DetailDef {
  resource: string;
  foreignKey: string;
  label: string;
  totalField?: string;
}

export interface ResourceDef {
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  icon: string;
  group: ResourceGroup;
  pk: string[];
  autoIncrement: boolean;
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Linhas aproximadas (TABLE_ROWS), usado na visão geral */
  linhas: number;
  details?: DetailDef[];
  fields: FieldDef[];
}

/** Conexão aberta no servidor MySQL escolhido; a senha fica só no servidor */
export interface ConexaoAtiva {
  token: string;
  host: string;
  porta: number;
  usuario: string;
  /** Usuário do painel (pedweb_admin.usuarios), depois do login */
  usuarioPainel?: UsuarioPainel;
}

export interface UsuarioPainel {
  id: string;
  nome: string;
  email: string;
  /** Só o super usuário vê e administra os usuários do painel */
  super: boolean;
}

export interface BaseDados {
  nome: string;
  tabelas: number;
  bytes: number;
}

export type RegistroCrud = Record<string, any>;

/** Operadores aceitos pela busca avançada */
export type FiltroOp = 'contains' | 'eq' | 'ne' | 'gte' | 'lte';

export interface FiltroAvancado {
  field: string;
  op: FiltroOp;
  value: string;
}

export interface ListaPaginada {
  data: RegistroCrud[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OpcaoRef {
  value: string;
  label: string;
}

export interface DbConnectionStatus {
  connected: boolean;
  latencyMs: number;
  version?: string;
  database?: string;
  host?: string;
  port?: number;
  user?: string;
  error?: string;
}
