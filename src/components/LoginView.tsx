import React, { useState } from 'react';
import { Lock, ArrowRight, AlertCircle, Eye, EyeOff, Mail } from 'lucide-react';
import { ConexaoAtiva } from '../types';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';
import { Toggle } from './Toggle';
import { login } from '../services/api';
import { INPUT_CLASS_LG, LABEL_CLASS } from '../utils/formStyles';
import { lerUltimoUsuario, salvarUltimoUsuario, lerLembrar, salvarLembrar } from '../utils/session';

interface LoginViewProps {
  /** Mensagem mostrada ao abrir a tela, ex.: sessão recusada pelo servidor */
  avisoInicial?: string | null;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  onEntrar: (conexao: ConexaoAtiva) => void;
}

/**
 * Tela única de acesso: usuário e senha do painel (pedweb_admin.usuarios). As credenciais
 * de MySQL ficam gravadas na linha do usuário, então é o servidor que abre a conexão —
 * cada um administra só as bases que a sua conta do MySQL enxerga.
 */
export const LoginView: React.FC<LoginViewProps> = ({ avisoInicial, theme = 'light', onToggleTheme, onEntrar }) => {
  const [usuario, setUsuario] = useState(() => lerUltimoUsuario());
  const [senha, setSenha] = useState('');
  const [lembrar, setLembrar] = useState(() => lerLembrar());
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(avisoInicial ?? null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = usuario.trim().toLowerCase();
    if (!u) {
      setErrorMessage('Informe o seu usuário / e-mail.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const conexao = await login({ usuario: u, senha });
      // Só guarda os dados de acesso depois de um login válido
      salvarLembrar(lembrar);
      salvarUltimoUsuario(u);
      onEntrar(conexao);
    } catch (err: any) {
      setErrorMessage(err.message || 'Não foi possível validar o acesso.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col items-center p-4 sm:p-6 select-none relative">
      {onToggleTheme && (
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
        </div>
      )}

      <div className="w-full max-w-md my-auto">
        {/* Identidade visual */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 px-6 min-w-20 rounded-2xl bg-blue-700 text-white font-black text-xl tracking-widest shadow-lg shadow-blue-700/20 mb-3 border border-blue-600">
            ADMIN
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Administração de Bases pedWeb
          </h1>
        </div>

        {/* Formulário */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Acesso Restrito</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Entre com o seu usuário e senha do painel
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="input-login-usuario" className={`block ${LABEL_CLASS} mb-1.5`}>
                Usuário / E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="input-login-usuario"
                  type="text"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="ex: admin@bmsoft.com.br"
                  autoComplete="username"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-10`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="input-login-senha" className={`block ${LABEL_CLASS} mb-1.5`}>
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-login-senha"
                  type={showPassword ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Digite sua senha de acesso"
                  autoComplete="current-password"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-10 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Toggle
              id="input-login-lembrar"
              checked={lembrar}
              onChange={setLembrar}
              size="sm"
              label="Lembrar neste dispositivo"
              title="Mantém a sessão ao fechar o navegador e preenche o usuário no próximo acesso. A senha nunca é guardada."
            />

            <button
              id="btn-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-700/20 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Painel</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
