import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ConexaoAtiva, ResourceDef, DbConnectionStatus } from './types';
import {
  setConexaoSessao,
  setBaseSessao,
  fetchResources,
  fetchDbStatus,
  invalidateOptions,
  desconectar,
  onConexaoExpirada,
} from './services/api';
import { setBaseConfigListas, limparConfigListas } from './utils/configListas';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { BasesView } from './components/BasesView';
import { Dashboard } from './components/Dashboard';
import { LiberarBases } from './components/LiberarBases';
import { CrudView } from './components/CrudView';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/theme';
import { lerSessao, salvarConexao, salvarBase } from './utils/session';

export default function App() {
  // ----------------------------------------------------------
  // Tema claro / escuro
  // ----------------------------------------------------------
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // ----------------------------------------------------------
  // Sessão: 1. login do usuário (abre a conexão MySQL dele)  2. base escolhida
  // ----------------------------------------------------------
  const [conexao, setConexao] = useState<ConexaoAtiva | null>(() => lerSessao().conexao);
  const [base, setBase] = useState<string | null>(() => lerSessao().base);

  // Token e base precisam acompanhar toda chamada da API (antes do primeiro efeito dos filhos)
  setConexaoSessao(conexao?.token ?? null);
  setBaseSessao(base);
  setBaseConfigListas(base);

  // ----------------------------------------------------------
  // Navegação e estado geral
  // ----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [resources, setResources] = useState<ResourceDef[]>([]);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [recordCounts, setRecordCounts] = useState<Record<string, number>>({});
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [createToken, setCreateToken] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** Motivo exibido na tela de conexão quando o servidor recusa a sessão */
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const trocarBase = useCallback((nova: string | null) => {
    setBase(nova);
    salvarBase(nova);
    setResources([]);
    setResourcesError(null);
    setRecordCounts({});
    setDbStatus(null);
    setActiveTab('dashboard');
    invalidateOptions();
  }, []);

  const handleLogout = useCallback(() => {
    desconectar();
    trocarBase(null);
    setConexao(null);
    salvarConexao(null);
    limparConfigListas();
  }, [trocarBase]);

  // Servidor reiniciado ou conexão fechada: volta para a tela de conexão
  useEffect(() => {
    onConexaoExpirada((msg) => {
      trocarBase(null);
      setConexao(null);
      salvarConexao(null);
      limparConfigListas();
      setAvisoLogin(msg);
    });
  }, [trocarBase]);

  // Metadados das tabelas e saúde do banco
  useEffect(() => {
    if (!conexao || !base) return;
    let alive = true;
    (async () => {
      try {
        const list = await fetchResources();
        if (alive) setResources(list);
      } catch (err: any) {
        if (alive) setResourcesError(err.message || 'Falha ao ler a estrutura da base.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [conexao?.token, base]);

  useEffect(() => {
    if (conexao && base && activeTab === 'dashboard') fetchDbStatus().then(setDbStatus);
  }, [conexao?.token, base, activeTab, refreshToken]);

  const handleCountChange = useCallback((resourceName: string, total: number) => {
    setRecordCounts((prev) => (prev[resourceName] === total ? prev : { ...prev, [resourceName]: total }));
  }, []);

  const activeResource = useMemo(
    () => resources.find((r) => r.name === activeTab) || null,
    [resources, activeTab],
  );

  // ----------------------------------------------------------
  // 1. Login (valida no pedweb_admin e abre a conexão MySQL do usuário)
  // ----------------------------------------------------------
  if (!conexao?.usuarioPainel) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onEntrar={(nova) => {
          setConexaoSessao(nova.token);
          setConexao(nova);
          salvarConexao(nova);
          limparConfigListas();
          setAvisoLogin(null);
          showToast(`Bem-vindo, ${nova.usuarioPainel?.nome ?? ''}!`);
        }}
      />
    );
  }

  // ----------------------------------------------------------
  // 2. Escolha da base pedweb*
  // ----------------------------------------------------------
  if (!base) {
    return (
      <BasesView
        conexao={conexao}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onEscolher={trocarBase}
        onDesconectar={handleLogout}
      />
    );
  }

  // ----------------------------------------------------------
  // 3. CRUD das tabelas
  // ----------------------------------------------------------
  const ehLiberarBases = activeTab === 'liberar-bases' && Boolean(conexao.usuarioPainel.super);
  const headerTitle = activeResource ? activeResource.label : ehLiberarBases ? 'Liberar Bases' : 'Visão Geral';
  const headerSubtitle = activeResource
    ? activeResource.description
    : ehLiberarBases
    ? 'Bases que cada conta do MySQL enxerga'
    : 'Tabelas da base e saúde da conexão';

  return (
    <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Notificação */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        resources={resources}
        recordCounts={recordCounts}
        conexao={conexao}
        base={base}
        onTrocarBase={() => trocarBase(null)}
        onLogout={handleLogout}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header
          title={headerTitle}
          subtitle={headerSubtitle}
          conexao={conexao}
          base={base}
          dbStatus={dbStatus}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onRefresh={() => setRefreshToken((t) => t + 1)}
          onCreate={activeResource?.canCreate ? () => setCreateToken((t) => t + 1) : undefined}
          createLabel={activeResource ? `Novo ${activeResource.labelSingular}` : undefined}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* As telas de CRUD ocupam toda a área útil, sem container centralizado */}
        {activeResource ? (
          <main className="flex-1 flex flex-col min-h-0 w-full">
            <CrudView
              key={activeResource.name}
              resource={activeResource}
              allResources={resources}
              refreshToken={refreshToken}
              createToken={createToken}
              onToast={showToast}
              onCountChange={handleCountChange}
              onNavigate={setActiveTab}
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto min-h-0 w-full">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
              {resourcesError ? (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-sm text-rose-700 dark:text-rose-300">
                  {resourcesError}
                </div>
              ) : ehLiberarBases ? (
                <LiberarBases onToast={showToast} />
              ) : activeTab === 'dashboard' ? (
                <Dashboard
                  conexao={conexao}
                  base={base}
                  resources={resources.filter((r) => r.group === 'tabelas')}
                  recordCounts={recordCounts}
                  dbStatus={dbStatus}
                  onNavigate={setActiveTab}
                />
              ) : (
                /* Recurso ainda não carregado (metadados em trânsito) */
                <div className="py-24 text-center text-sm text-stone-500 dark:text-stone-400">
                  Carregando a estrutura da tela…
                </div>
              )}
            </div>

            <footer className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 text-stone-500 text-xs py-4 px-4">
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>Administração pedWeb</strong> • Manutenção das Bases de Dados
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono">
                    {conexao.usuario}@{conexao.host}:{conexao.porta}
                  </span>
                  <span>•</span>
                  <span className="font-mono">{base}</span>
                </div>
              </div>
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}
