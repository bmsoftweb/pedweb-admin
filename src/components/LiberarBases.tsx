import React, { useEffect, useState } from 'react';
import { ShieldCheck, Database, Loader2, AlertCircle, Inbox, Save, Lock, Globe } from 'lucide-react';
import { BaseDados } from '../types';
import {
  UsuarioMysql,
  fetchUsuariosMysql,
  fetchBasesDoUsuarioMysql,
  salvarBasesDoUsuarioMysql,
  fetchBases,
} from '../services/api';
import { formatBytes, formatNumberBR } from '../utils/formatters';
import { Toggle } from './Toggle';

interface LiberarBasesProps {
  onToast: (msg: string) => void;
}

/**
 * Liberação de bases por conta DO MYSQL (não do painel): o super usuário marca quais
 * bases pedweb* cada conta enxerga, e o servidor aplica isso com GRANT/REVOKE.
 */
export const LiberarBases: React.FC<LiberarBasesProps> = ({ onToast }) => {
  const [usuarios, setUsuarios] = useState<UsuarioMysql[] | null>(null);
  const [bases, setBases] = useState<BaseDados[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [escolhido, setEscolhido] = useState<UsuarioMysql | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [originais, setOriginais] = useState<string[]>([]);
  const [carregandoBases, setCarregandoBases] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  /** Bases que o MySQL recusou na última aplicação */
  const [pendencias, setPendencias] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [contas, lista] = await Promise.all([fetchUsuariosMysql(), fetchBases()]);
        if (!vivo) return;
        setUsuarios(contas);
        setBases(lista);
      } catch (err: any) {
        if (vivo) setErro(err.message || 'Falha ao ler as contas do MySQL.');
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const escolher = async (u: UsuarioMysql) => {
    setEscolhido(u);
    setErro(null);
    setPendencias([]);
    setCarregandoBases(true);
    try {
      const atuais = await fetchBasesDoUsuarioMysql(u.usuario, u.host);
      setMarcadas(atuais);
      setOriginais(atuais);
    } catch (err: any) {
      setErro(err.message || 'Falha ao ler as bases desta conta.');
      setMarcadas([]);
      setOriginais([]);
    } finally {
      setCarregandoBases(false);
    }
  };

  const alternar = (base: string) =>
    setMarcadas((prev) => (prev.includes(base) ? prev.filter((b) => b !== base) : [...prev, base]));

  const conceder = marcadas.filter((b) => !originais.includes(b));
  const revogar = originais.filter((b) => !marcadas.includes(b));
  const mudou = conceder.length > 0 || revogar.length > 0;
  const bloqueado = Boolean(escolhido?.atual);

  const salvar = async () => {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await salvarBasesDoUsuarioMysql(escolhido.usuario, escolhido.host, marcadas);
      setMarcadas(r.bases);
      setOriginais(r.bases);
      setPendencias(r.erros);
      setConfirmando(false);
      onToast(
        `${escolhido.usuario}@${escolhido.host}: ${formatNumberBR(r.conceder.length)} base(s) liberada(s), ` +
          `${formatNumberBR(r.revogar.length)} bloqueada(s).`,
      );
    } catch (err: any) {
      setErro(err.message || 'Não foi possível aplicar as liberações.');
      setConfirmando(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Liberar Bases</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Escolha uma conta <strong>do MySQL</strong> e marque as bases que ela enxerga. Isso altera os
              privilégios no servidor MySQL (GRANT / REVOKE), não os usuários do painel.
            </p>
          </div>
        </div>
      </div>

      {pendencias.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>O MySQL recusou estas bases (as demais foram aplicadas):</span>
          </div>
          <ul className="mt-1.5 ml-7 list-disc space-y-1">
            {pendencias.map((p) => (
              <li key={p} className="break-words">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {erro && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{erro}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-4 items-start">
        {/* Contas do MySQL */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Contas do MySQL
          </div>

          {!usuarios && !erro && (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Lendo as contas…</span>
            </div>
          )}

          {usuarios && !usuarios.length && (
            <div className="py-10 flex flex-col items-center gap-2 text-stone-400">
              <Inbox className="w-7 h-7" />
              <span className="text-xs">Nenhuma conta encontrada</span>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {(usuarios || []).map((u) => {
              const ativa = escolhido?.usuario === u.usuario && escolhido?.host === u.host;
              return (
                <button
                  key={`${u.usuario}@${u.host}`}
                  onClick={() => escolher(u)}
                  className={`w-full px-4 py-2.5 flex items-center justify-between gap-2 text-left border-l-2 transition-colors cursor-pointer ${
                    ativa
                      ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40'
                      : 'border-transparent hover:bg-stone-100 dark:hover:bg-stone-800/70'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold font-mono text-stone-800 dark:text-stone-100 truncate">
                      {u.usuario}
                    </span>
                    <span className="block text-[10px] text-stone-500 dark:text-stone-400 font-mono truncate">
                      @{u.host}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    {u.global && (
                      <span title="Tem privilégio global: enxerga todas as bases" className="text-amber-600 dark:text-amber-400">
                        <Globe className="w-3.5 h-3.5" />
                      </span>
                    )}
                    {u.atual && (
                      <span title="Conta usada por esta conexão do painel" className="text-stone-400">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bases da conta escolhida */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              Bases liberadas {escolhido && <span className="font-mono normal-case">• {escolhido.usuario}@{escolhido.host}</span>}
            </span>
            {escolhido && (
              <button
                onClick={() => setConfirmando(true)}
                disabled={!mudou || bloqueado || salvando}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar</span>
              </button>
            )}
          </div>

          {!escolhido && (
            <div className="py-16 text-center text-xs text-stone-500 dark:text-stone-400">
              Escolha uma conta do MySQL ao lado.
            </div>
          )}

          {escolhido && bloqueado && (
            <div className="m-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
              Esta é a conta usada por esta conexão do painel. Alterá-la aqui derrubaria o seu próprio acesso, então
              ela fica bloqueada.
            </div>
          )}

          {escolhido && escolhido.global && (
            <div className="m-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
              Esta conta tem privilégio global no MySQL: ela enxerga todas as bases, marcadas ou não. Tirar isso exige
              mexer no privilégio global, fora desta tela.
            </div>
          )}

          {escolhido && carregandoBases && (
            <div className="py-10 flex items-center justify-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Lendo as bases desta conta…</span>
            </div>
          )}

          {escolhido && !carregandoBases && (
            <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {bases.map((b) => (
                <div key={b.nome} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Database className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold font-mono text-stone-800 dark:text-stone-100 truncate">
                        {b.nome}
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-stone-400">
                        {formatNumberBR(b.tabelas)} tabela(s) • {formatBytes(b.bytes)}
                      </div>
                    </div>
                  </div>
                  <Toggle
                    id={`liberar-${b.nome}`}
                    checked={marcadas.includes(b.nome)}
                    onChange={() => alternar(b.nome)}
                    disabled={bloqueado}
                  />
                </div>
              ))}
              {!bases.length && (
                <div className="py-10 text-center text-xs text-stone-500 dark:text-stone-400">
                  Nenhuma base pedweb* neste servidor.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmação: mexe nos privilégios do servidor MySQL */}
      {confirmando && escolhido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs"
            onClick={salvando ? undefined : () => setConfirmando(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl z-10 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">Alterar privilégios no MySQL?</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Conta{' '}
                  <strong className="font-mono text-stone-700 dark:text-stone-200">
                    {escolhido.usuario}@{escolhido.host}
                  </strong>
                  . Isto roda GRANT / REVOKE no servidor e vale para qualquer sistema que use esta conta.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              {conceder.length > 0 && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300">
                  <strong>Liberar:</strong> <span className="font-mono">{conceder.join(', ')}</span>
                </div>
              )}
              {revogar.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300">
                  <strong>Bloquear:</strong> <span className="font-mono">{revogar.join(', ')}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConfirmando(false)}
                disabled={salvando}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-300 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                id="btn-confirmar-liberacao"
                onClick={salvar}
                disabled={salvando}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{salvando ? 'Aplicando…' : 'Aplicar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
