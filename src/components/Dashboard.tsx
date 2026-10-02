import React, { useState } from 'react';
import { Table, CheckCircle2, XCircle, Search, KeyRound, ArrowRight } from 'lucide-react';
import { ConexaoAtiva, DbConnectionStatus, ResourceDef } from '../types';
import { formatNumberBR } from '../utils/formatters';
import { INPUT_CLASS } from '../utils/formStyles';

interface DashboardProps {
  conexao: ConexaoAtiva;
  base: string;
  resources: ResourceDef[];
  recordCounts: Record<string, number>;
  dbStatus: DbConnectionStatus | null;
  onNavigate: (resourceName: string) => void;
}

/** Visão geral da base: status da conexão e atalho para cada tabela */
export const Dashboard: React.FC<DashboardProps> = ({ conexao, base, resources, recordCounts, dbStatus, onNavigate }) => {
  const [filtro, setFiltro] = useState('');
  const tabelas = resources.filter((r) => r.name.toLowerCase().includes(filtro.trim().toLowerCase()));
  const semPk = resources.filter((r) => !r.pk.length).length;

  return (
    <div className="space-y-5">
      {/* Identificação da base administrada */}
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
              Base Administrada
            </div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 truncate font-mono">{base}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-stone-500 dark:text-stone-400">
              <span>{formatNumberBR(resources.length)} tabela(s)</span>
              {semPk > 0 && (
                <>
                  <span className="text-stone-300 dark:text-stone-700">•</span>
                  <span title="Sem chave primária a linha não pode ser identificada: só inclusão e consulta">
                    {semPk} sem chave primária (somente leitura e inclusão)
                  </span>
                </>
              )}
            </div>
          </div>

          <div
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs ${
              dbStatus?.connected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300'
                : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
            }`}
          >
            {dbStatus?.connected ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            <div>
              <div className="font-semibold">{dbStatus?.connected ? 'MySQL conectado' : 'MySQL indisponível'}</div>
              <div className="text-[10px] opacity-80 font-mono">
                {dbStatus?.connected
                  ? `${conexao.host}:${conexao.porta} • ${dbStatus.latencyMs}ms`
                  : dbStatus?.error || 'Verificando…'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabelas */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Tabelas</h3>
        <div className="relative w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            id="visao-geral-filtro"
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar tabelas…"
            className={`${INPUT_CLASS} w-full pl-9`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {tabelas.map((r) => (
          <button
            key={r.name}
            onClick={() => onNavigate(r.name)}
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-xs text-left hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 font-mono truncate" title={r.name}>
                  {r.name}
                </div>
                <div className="text-2xl font-bold text-stone-900 dark:text-stone-100 mt-1 font-mono">
                  {formatNumberBR(recordCounts[r.name] ?? r.linhas)}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                  {r.fields.length} coluna(s)
                  {r.pk.length ? ` • PK ${r.pk.join(' + ')}` : ' • sem chave primária'}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900">
                {r.pk.length ? (
                  <Table className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <KeyRound className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                )}
              </div>
            </div>
            <div className="mt-3 text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Abrir manutenção</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-stone-400">
        A quantidade de registros é estimada pelo MySQL até a tabela ser aberta.
      </p>
    </div>
  );
};
