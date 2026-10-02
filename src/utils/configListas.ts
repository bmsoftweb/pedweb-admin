import { fetchConfigListas, saveConfigListas } from '../services/api';

/**
 * Preferências de cada lista, gravadas em pedweb_admin.usuarios.config_listas como JSON.
 * A chave é base + tabela, porque as bases pedweb* repetem os nomes das tabelas.
 */
export type Grade = 'ambas' | 'horizontais' | 'verticais' | 'nenhuma';

/** Como as larguras são definidas: recalculadas na abertura ou fixadas pelo usuário */
export type ModoLargura = 'manual' | 'ajustar' | 'melhor';

export interface ConfigLista {
  larguras?: Record<string, number>;
  ordem?: string[];
  grade?: Grade;
  /** false depois de 'Ajustar largura': as colunas ocupam tudo, sem a coluna vazia do fim */
  sobra?: boolean;
  modo?: ModoLargura;
  /** Colunas exibidas na lista, escolhidas pelo ícone ao lado do rótulo na edição */
  colunas?: string[];
}

let cache: Record<string, ConfigLista> | null = null;
let carregando: Promise<Record<string, ConfigLista>> | null = null;
let gravacao: ReturnType<typeof setTimeout> | null = null;
let prefixo = '';

/** Base atual: as preferências são separadas por base */
export function setBaseConfigListas(base: string | null) {
  prefixo = base ? `${base}.` : '';
}

export async function lerConfigLista(recurso: string): Promise<ConfigLista> {
  if (!cache) {
    carregando =
      carregando ||
      fetchConfigListas()
        .then((c) => (cache = (c as Record<string, ConfigLista>) || {}))
        .catch(() => (cache = {}));
    await carregando;
  }
  return cache?.[prefixo + recurso] || {};
}

/** Guarda a preferência e grava o JSON inteiro depois de um respiro, para não gravar a cada pixel */
export function salvarConfigLista(recurso: string, config: ConfigLista) {
  cache = { ...(cache || {}), [prefixo + recurso]: config };
  if (gravacao) clearTimeout(gravacao);
  gravacao = setTimeout(() => saveConfigListas(cache || {}).catch(() => {}), 800);
}

export function limparConfigListas() {
  cache = null;
  carregando = null;
}
