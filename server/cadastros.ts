/**
 * Cadastros: telas desenhadas à mão sobre tabelas do pedWeb, no modelo do crmWeb
 * (rótulos em português, ordem dos campos, tipos e dicas escolhidos um a um).
 *
 * Diferença para o crmWeb: lá o registro de metadados descreve a tabela inteira; aqui
 * ele é uma camada sobre o que foi lido do INFORMATION_SCHEMA, para a tela continuar
 * funcionando quando a base tiver colunas a mais ou a menos.
 */
import { FieldDef, ResourceDef } from './schema.js';

/** Ajuste de uma coluna; `null` esconde a coluna da tela */
type Ajuste = Partial<FieldDef> | null;

export interface CadastroDef {
  label: string;
  labelSingular: string;
  description: string;
  /** Ícone lucide-react exibido no menu */
  icon: string;
  labelField: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  /** Ordem dos campos na tela; o que não estiver aqui vem depois, na ordem da tabela */
  ordem: string[];
  /** false esconde o "Novo": registros que vêm de outro sistema */
  podeIncluir?: boolean;
  /** false abre o registro só para consulta, sem gravar */
  podeAlterar?: boolean;
  /** false tira a exclusão: registros mantidos por outro sistema */
  podeExcluir?: boolean;
  colunas: Record<string, Ajuste>;
}

export const CADASTROS: Record<string, CadastroDef> = {
  app_usuarios: {
    label: 'Usuários',
    labelSingular: 'Usuário',
    description: 'Quem acessa o aplicativo pedWeb',
    icon: 'KeyRound',
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    ordem: ['id_app', 'nome', 'email', 'senha', 'sigla', 'ativo', 'admin', 'tipo', 'vendedor_id_app', 'id_bm'],
    colunas: {
      id_app: { label: 'ID', listed: true, width: 'sm' },
      nome: { label: 'Nome', required: true, listed: true, searchable: true },
      email: { label: 'E-mail', required: true, listed: true, searchable: true, hint: 'É com ele que o usuário entra no aplicativo' },
      // O pedWeb compara a senha em texto puro no login, então ela é gravada como digitada
      senha: { label: 'Senha', type: 'password', hash: false, hint: 'Em branco na alteração: mantém a senha atual' },
      sigla: { label: 'Sigla', listed: true, width: 'xs' },
      // char(1) com S/N: interruptor na edição e Sim/Não na lista
      ativo: { label: 'Ativo', type: 'simnao', listed: true, filterable: true, width: 'xs' },
      admin: { label: 'Administrador', type: 'simnao', listed: true, filterable: true, width: 'xs' },
      tipo: { label: 'Tipo', listed: true, filterable: true },
      vendedor_id_app: { label: 'Vendedor', listed: true, filterable: true, ref: { resource: 'app_vendedores', labelField: 'nome' } },
      id_bm: { label: 'ID bmsoft', hint: 'Código do usuário no sistema bmsoft' },
      // Preferências do aplicativo: mantidas pelo próprio pedWeb
      config: null,
    },
  },
  app_vendedores: {
    label: 'Vendedores',
    labelSingular: 'Vendedor',
    description: 'Vendedores, comissões e meta mensal',
    icon: 'UserCheck',
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    // Vendedores vêm do bmsoft: a tela é só de consulta
    podeIncluir: false,
    podeAlterar: false,
    podeExcluir: false,
    ordem: [
      'id_app', 'nome', 'apelido', 'ativo', 'meta_mensal', 'listas_preco',
      'comissao_A', 'comissao_B', 'comissao_C', 'comissao_D', 'comissao_E', 'comissao_F', 'id_bm',
    ],
    colunas: {
      id_app: { label: 'ID', listed: true, width: 'sm' },
      nome: { label: 'Nome', required: true, listed: true, searchable: true },
      apelido: { label: 'Apelido', listed: true, searchable: true },
      // char(1) com S/N: interruptor na edição e Sim/Não na lista
      ativo: { label: 'Ativo', type: 'simnao', listed: true, filterable: true, width: 'xs' },
      meta_mensal: { label: 'Meta mensal (R$)', listed: true },
      listas_preco: { label: 'Listas de preço', hint: 'Números das listas que este vendedor pode usar, separados por vírgula' },
      comissao_A: { label: 'Comissão A (%)' },
      comissao_B: { label: 'Comissão B (%)' },
      comissao_C: { label: 'Comissão C (%)' },
      comissao_D: { label: 'Comissão D (%)' },
      comissao_E: { label: 'Comissão E (%)' },
      comissao_F: { label: 'Comissão F (%)' },
      id_bm: { label: 'ID bmsoft', hint: 'Código do vendedor no sistema bmsoft' },
    },
  },
};

export const ehCadastro = (tabela: string) => Object.prototype.hasOwnProperty.call(CADASTROS, tabela);

/** Senha dada ao usuário criado a partir de um vendedor */
export const SENHA_PADRAO = '1234';

/** O login do aplicativo é o e-mail: sem um e-mail válido não há como criar o usuário */
export function normalizarEmail(valor: unknown): string {
  const email = String(valor ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) ? email : '';
}

/** Aplica a camada de cadastro sobre o recurso lido do banco */
export function aplicarCadastro(resource: ResourceDef): ResourceDef {
  const def = CADASTROS[resource.table];
  if (!def) return resource;

  const campos = resource.fields
    .filter((f) => def.colunas[f.name] !== null)
    .map((f) => {
      const ajuste = def.colunas[f.name] as Partial<FieldDef> | undefined;
      // Rótulo e listagem só valem para colunas descritas; o resto segue o que veio do banco
      return ajuste ? ({ ...f, ...ajuste } as FieldDef) : f;
    });

  const posicao = (f: FieldDef) => {
    const i = def.ordem.indexOf(f.name);
    return i < 0 ? def.ordem.length : i;
  };
  campos.sort((a, b) => posicao(a) - posicao(b));

  const existe = (nome: string) => campos.some((f) => f.name === nome);
  return {
    ...resource,
    label: def.label,
    labelSingular: def.labelSingular,
    description: def.description,
    icon: def.icon,
    group: 'cadastros',
    canCreate: def.podeIncluir !== false && resource.canCreate,
    canUpdate: def.podeAlterar !== false && resource.canUpdate,
    canDelete: def.podeExcluir !== false && resource.canDelete,
    labelField: existe(def.labelField) ? def.labelField : resource.labelField,
    defaultSort: existe(def.defaultSort.field) ? def.defaultSort : resource.defaultSort,
    fields: campos,
  };
}
