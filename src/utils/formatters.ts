import { FieldDef } from '../types';

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatNumberBR(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '—';
  const parts = String(dateStr).split('T')[0].split(' ')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export function formatDateTimeBR(dateStr: string): string {
  if (!dateStr) return '—';
  const normalized = String(dateStr).replace(' ', 'T');
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Converte o valor do MySQL para o formato aceito por <input type="date" | "datetime-local"> */
export function toInputDate(value: any): string {
  if (!value) return '';
  return String(value).replace(' ', 'T').slice(0, 10);
}

export function toInputDateTime(value: any): string {
  if (!value) return '';
  return String(value).replace(' ', 'T').slice(0, 16);
}

/** Renderização de uma célula da grade conforme o tipo do campo */
export function formatCellValue(field: FieldDef, value: any): string {
  if (value === null || value === undefined || value === '') return '—';

  switch (field.type) {
    case 'boolean':
      return Number(value) === 1 ? 'Sim' : 'Não';
    case 'simnao':
      return String(value).toUpperCase() === 'S' ? 'Sim' : 'Não';
    case 'date':
      return formatDateBR(String(value));
    case 'datetime':
      return formatDateTimeBR(String(value));
    case 'decimal': {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: field.scale ?? 2,
        maximumFractionDigits: field.scale ?? 2,
      }).format(n);
    }
    case 'number':
      return formatNumberBR(Number(value));
    case 'password':
      return '••••••••';
    case 'enum': {
      const opt = field.options?.find((o) => o.value === String(value));
      return opt ? opt.label : String(value);
    }
    default: {
      const text = String(value);
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
  }
}

/** Cores de destaque por status, reaproveitadas em grades e painéis */
export const STATUS_COLORS: Record<string, string> = {
  // Pedidos
  aberto: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  fechado: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  bloqueado: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800',
  faturado: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800',
  enviado: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-800',
  entregue: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  cancelado_cliente: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
  cancelado_loja: 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  // Títulos financeiros
  vencido: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800',
  liquidado: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  // Crédito
  aprovado: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  em_analise: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  suspenso: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800',
  // Estoque
  pronta_entrega: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  sob_encomenda: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  baixo_estoque: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  // Unidades
  matriz: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800',
  filial: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
};

export const GROUP_LABELS: Record<string, string> = {
  cadastros: 'Cadastros',
  painel: 'Painel',
  tabelas: 'Tabelas',
};

/** Tamanho em disco legível: 1,5 MB */
export function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = n > 0 ? Math.min(unidades.length - 1, Math.floor(Math.log(n) / Math.log(1024))) : 0;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n / 1024 ** i)} ${unidades[i]}`;
}
