import { ConexaoAtiva } from '../types';

/**
 * Sessão do painel e opção "Lembrar neste dispositivo".
 *
 * - Marcada: a sessão (conexão e base) fica no localStorage e sobrevive ao fechar o
 *   navegador — enquanto o servidor do painel continuar no ar, porque é lá que a senha
 *   do MySQL vive. O servidor/porta/usuário e o último usuário do painel ficam guardados
 *   para vir preenchidos no próximo acesso.
 * - Desmarcada: a sessão fica no sessionStorage (termina ao fechar o navegador) e nada
 *   de acesso é guardado — o que já estava guardado é apagado.
 *
 * Nenhuma senha é armazenada no navegador, em qualquer dos casos.
 */

const SESSAO_CONEXAO = 'pedweb_admin_conexao';
const SESSAO_BASE = 'pedweb_admin_base';
const LEMBRETE = 'pedweb_admin_ultimos_hosts';
const ULTIMO_USUARIO = 'pedweb_admin_ultimo_usuario';
const LEMBRAR = 'pedweb_admin_lembrar_dispositivo';

export interface LembreteConexao {
  host: string;
  porta: number;
  usuario: string;
}

/** O acesso ao storage pode lançar exceção (modo privado, bloqueio de cookies) */
function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

export function lerLembrar(): boolean {
  return seguro(() => localStorage.getItem(LEMBRAR) === '1', false);
}

/** Guarda a opção; ao desmarcar, apaga tudo o que havia sido lembrado */
export function salvarLembrar(lembrar: boolean) {
  seguro(() => {
    if (lembrar) {
      localStorage.setItem(LEMBRAR, '1');
      return;
    }
    localStorage.removeItem(LEMBRAR);
    localStorage.removeItem(LEMBRETE);
    localStorage.removeItem(ULTIMO_USUARIO);
    localStorage.removeItem(SESSAO_CONEXAO);
    localStorage.removeItem(SESSAO_BASE);
  }, undefined);
}

/** Onde a sessão é guardada, conforme a opção */
const destino = () => (lerLembrar() ? localStorage : sessionStorage);
const outro = () => (lerLembrar() ? sessionStorage : localStorage);

function guardar(chave: string, valor: string | null) {
  seguro(() => {
    if (valor === null) destino().removeItem(chave);
    else destino().setItem(chave, valor);
    // Evita que sobre uma cópia no armazenamento que não foi escolhido
    outro().removeItem(chave);
  }, undefined);
}

export function lerSessao(): { conexao: ConexaoAtiva | null; base: string | null } {
  return seguro(
    () => {
      const bruto = localStorage.getItem(SESSAO_CONEXAO) ?? sessionStorage.getItem(SESSAO_CONEXAO);
      return {
        conexao: bruto ? (JSON.parse(bruto) as ConexaoAtiva) : null,
        base: localStorage.getItem(SESSAO_BASE) ?? sessionStorage.getItem(SESSAO_BASE),
      };
    },
    { conexao: null, base: null },
  );
}

export function salvarConexao(conexao: ConexaoAtiva | null) {
  guardar(SESSAO_CONEXAO, conexao ? JSON.stringify(conexao) : null);
}

export function salvarBase(base: string | null) {
  guardar(SESSAO_BASE, base);
}

/** Servidores usados com sucesso, o mais recente primeiro (só com "lembrar" marcado) */
export function lerLembretes(): LembreteConexao[] {
  return seguro(() => JSON.parse(localStorage.getItem(LEMBRETE) || '[]'), []);
}

export function salvarLembrete(dados: LembreteConexao) {
  if (!lerLembrar()) return;
  seguro(() => {
    const outros = lerLembretes().filter((l) => !(l.host === dados.host && l.porta === dados.porta));
    localStorage.setItem(LEMBRETE, JSON.stringify([dados, ...outros].slice(0, 10)));
  }, undefined);
}

/** Último usuário do painel que entrou neste dispositivo */
export function lerUltimoUsuario(): string {
  return seguro(() => localStorage.getItem(ULTIMO_USUARIO) || '', '');
}

export function salvarUltimoUsuario(usuario: string) {
  if (!lerLembrar()) return;
  seguro(() => localStorage.setItem(ULTIMO_USUARIO, usuario), undefined);
}
