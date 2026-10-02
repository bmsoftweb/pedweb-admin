import React, { useEffect, useRef, useState } from 'react';
import {
  Database,
  ArrowRight,
  AlertCircle,
  Loader2,
  Inbox,
  LogOut,
  RefreshCw,
  Copy,
  CheckCircle2,
  X,
} from 'lucide-react';
import { BaseDados, ConexaoAtiva } from '../types';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';
import { fetchBases, clonarBase } from '../services/api';
import { formatBytes, formatNumberBR } from '../utils/formatters';
import { INPUT_CLASS_LG, LABEL_CLASS, HINT_CLASS } from '../utils/formStyles';

interface BasesViewProps {
  conexao: ConexaoAtiva;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  onEscolher: (base: string) => void;
  onDesconectar: () => void;
}

/** Passo 2: qual base pedweb* do servidor conectado será administrada */
export const BasesView: React.FC<BasesViewProps> = ({ conexao, theme = 'light', onToggleTheme, onEscolher, onDesconectar }) => {
  /** Criar base (clonar a estrutura) é só do super usuário */
  const podeClonar = Boolean(conexao.usuarioPainel?.super);
  const [bases, setBases] = useState<BaseDados[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nova base a partir da estrutura de outra
  const [clonando, setClonando] = useState<BaseDados | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [erroClone, setErroClone] = useState<string | null>(null);
  const [clonagemEmCurso, setClonagemEmCurso] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Objetos que não puderam ser copiados na última clonagem */
  const [pendencias, setPendencias] = useState<string[]>([]);
  const campoNome = useRef<HTMLInputElement>(null);

  const carregar = () => {
    setBases(null);
    setError(null);
    fetchBases()
      .then(setBases)
      .catch((err) => setError(err.message || 'Falha ao listar as bases de dados.'));
  };

  useEffect(carregar, [conexao.token]);

  const abrirClonagem = (b: BaseDados) => {
    setClonando(b);
    setNomeNovo(`${b.nome}_copia`);
    setErroClone(null);
    setAviso(null);
    setPendencias([]);
    setTimeout(() => campoNome.current?.focus(), 0);
  };

  const confirmarClonagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clonando) return;
    setClonagemEmCurso(true);
    setErroClone(null);
    try {
      const nova = await clonarBase(clonando.nome, nomeNovo.trim().toLowerCase());
      setClonando(null);
      const partes = [
        `${formatNumberBR(nova.tabelas)} tabela(s)`,
        ...(nova.fks ? [`${formatNumberBR(nova.fks)} chave(s) estrangeira(s)`] : []),
        ...(nova.visoes ? [`${formatNumberBR(nova.visoes)} visão(ões)`] : []),
        ...(nova.funcoes ? [`${formatNumberBR(nova.funcoes)} função(ões)`] : []),
        ...(nova.procedures ? [`${formatNumberBR(nova.procedures)} procedure(s)`] : []),
        ...(nova.triggers ? [`${formatNumberBR(nova.triggers)} trigger(s)`] : []),
      ];
      setAviso(`Base ${nova.nome} criada com ${partes.join(', ')}, sem dados.`);
      setPendencias(nova.erros);
      carregar();
    } catch (err: any) {
      setErroClone(err.message || 'Não foi possível criar a base.');
    } finally {
      setClonagemEmCurso(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col items-center p-4 sm:p-6 select-none relative">
      {onToggleTheme && (
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
        </div>
      )}

      <div className="w-full max-w-xl my-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 px-6 min-w-20 rounded-2xl bg-blue-700 text-white font-black text-xl tracking-widest shadow-lg shadow-blue-700/20 mb-3 border border-blue-600">
            ADMIN
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Administração de Bases pedWeb
          </h1>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Base de Dados</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                Escolha a base em que vai trabalhar •{' '}
                <span className="font-mono">
                  {conexao.usuario}@{conexao.host}:{conexao.porta}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={carregar}
                title="Recarregar a lista de bases"
                className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={onDesconectar}
                title="Sair do painel"
                className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {aviso && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{aviso}</span>
            </div>
          )}

          {pendencias.length > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>Estes objetos não puderam ser copiados:</span>
              </div>
              <ul className="mt-1.5 ml-7 list-disc space-y-0.5 max-h-28 overflow-y-auto">
                {pendencias.map((p) => (
                  <li key={p} className="font-mono text-[11px] break-words">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {!bases && !error && (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Listando as bases pedweb*…</span>
            </div>
          )}

          {bases && bases.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-stone-400">
              <Inbox className="w-8 h-8" />
              <span className="text-sm font-medium text-stone-600 dark:text-stone-300">
                Nenhuma base com prefixo pedweb neste servidor
              </span>
            </div>
          )}

          {bases && bases.length > 0 && (
            <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-2">
              {bases.map((b) => (
                <div
                  key={b.nome}
                  className="flex items-stretch gap-1 p-3 rounded-xl border border-stone-200 dark:border-stone-800 hover:border-blue-300 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all group"
                >
                  <button
                    id={`btn-base-${b.nome}`}
                    onClick={() => onEscolher(b.nome)}
                    className="flex-1 flex items-center justify-between gap-3 min-w-0 cursor-pointer text-left"
                  >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl border bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 flex items-center justify-center shrink-0">
                      <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 font-mono truncate">
                        {b.nome}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400">
                        {formatNumberBR(b.tabelas)} tabela(s) • {formatBytes(b.bytes)}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-blue-600 dark:text-stone-600 dark:group-hover:text-blue-400 shrink-0" />
                  </button>

                  {podeClonar && (
                  <button
                    id={`btn-clonar-${b.nome}`}
                    onClick={() => abrirClonagem(b)}
                    title={`Criar uma base nova com as tabelas de ${b.nome}, sem os dados`}
                    className="w-9 shrink-0 flex items-center justify-center rounded-lg text-stone-300 hover:text-blue-600 hover:bg-blue-50 dark:text-stone-600 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nova base com a estrutura de outra */}
      {clonando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs"
            onClick={clonagemEmCurso ? undefined : () => setClonando(null)}
            aria-hidden="true"
          />
          <form
            onSubmit={confirmarClonagem}
            className="relative w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
                <Copy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Nova base de dados</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Cria uma base com a estrutura de{' '}
                  <strong className="font-mono text-stone-700 dark:text-stone-200">{clonando.nome}</strong>:
                  tabelas (colunas, índices e valores padrão), chaves estrangeiras, visões, funções,
                  procedures e triggers. Os dados <strong>não</strong> são copiados.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="input-nova-base" className={`block ${LABEL_CLASS} mb-1.5`}>
                Nome da nova base
              </label>
              <input
                id="input-nova-base"
                ref={campoNome}
                type="text"
                value={nomeNovo}
                onChange={(e) => {
                  setNomeNovo(e.target.value);
                  setErroClone(null);
                }}
                maxLength={64}
                spellCheck={false}
                required
                className={`${INPUT_CLASS_LG} w-full font-mono`}
              />
              <p className={`${HINT_CLASS} mt-1`}>
                Precisa começar com <span className="font-mono">pedweb</span>; use letras minúsculas, números e
                sublinhado.
              </p>
            </div>

            {erroClone && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{erroClone}</span>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setClonando(null)}
                disabled={clonagemEmCurso}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
              <button
                type="submit"
                id="btn-confirmar-clonagem"
                disabled={clonagemEmCurso}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {clonagemEmCurso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                <span>{clonagemEmCurso ? 'Criando…' : 'Criar base'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
