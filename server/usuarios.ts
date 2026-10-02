import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { BASE_ADMIN, CONFIG_PAINEL, poolPainel, q, testarConexao } from './db.js';
import { emitirToken, sessaoDaRequisicao } from './sessao.js';

/**
 * Login do painel e preferências das listas, em pedweb_admin.usuarios — lido pelo pool
 * do painel (.env), não pela conexão do usuário.
 *
 * A estrutura da tabela é lida do banco: login por email, login, usuario ou nome; senha
 * em senha_hash ou senha; linha identificada por id ou id_app. As credenciais de MySQL
 * do usuário ficam na própria linha (mysql_host, mysql_port, mysql_user, mysql_senha) e
 * é com elas que o painel abre a conexão onde ele administra as bases pedweb*.
 */
const TABELA = q('usuarios');

/** Nomes aceitos para cada credencial de MySQL na linha do usuário */
export const COLUNAS_MYSQL = {
  host: ['mysql_host', 'host'],
  port: ['mysql_port', 'mysql_porta', 'porta', 'port'],
  user: ['mysql_user', 'mysql_usuario', 'usuario_mysql'],
  senha: ['mysql_senha', 'mysql_password', 'senha_mysql'],
};

/**
 * Credenciais de MySQL do usuário. O que estiver em branco cai para o .env do painel,
 * de modo que um usuário sem conta própria ainda entra com a conta do painel; mas quem
 * tem usuário próprio não herda a senha do painel.
 */
export function credenciaisMysql(usuario: Record<string, any>, colunas: string[]) {
  const valor = (candidatas: string[]) => {
    const coluna = primeira(colunas, candidatas);
    const bruto = coluna ? usuario[coluna] : null;
    return bruto === null || bruto === undefined || String(bruto).trim() === '' ? '' : String(bruto).trim();
  };
  const user = valor(COLUNAS_MYSQL.user);
  return {
    host: valor(COLUNAS_MYSQL.host) || CONFIG_PAINEL.host,
    port: Number(valor(COLUNAS_MYSQL.port)) || CONFIG_PAINEL.port,
    user: user || CONFIG_PAINEL.user,
    senha: valor(COLUNAS_MYSQL.senha) || (user ? '' : CONFIG_PAINEL.password),
  };
}

/** Validação de senha tolerante a bases legadas: bcrypt, texto puro, MD5, SHA-256 e SHA-1 */
function verifyPasswordMatch(inputPassword: string, storedHash: string): boolean {
  if (!storedHash || storedHash.trim() === '') return false;
  if (/^\$2[aby]\$/.test(storedHash)) {
    try {
      if (bcrypt.compareSync(inputPassword, storedHash)) return true;
    } catch {
      // segue para os demais formatos
    }
  }
  if (inputPassword === storedHash) return true;
  const guardado = storedHash.toLowerCase();
  return ['md5', 'sha256', 'sha1'].some(
    (alg) => crypto.createHash(alg).update(inputPassword).digest('hex') === guardado,
  );
}

export async function colunasUsuarios(): Promise<string[]> {
  const [rows] = await poolPainel().query<any[]>(
    `SELECT COLUMN_NAME AS nome FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuarios' ORDER BY ORDINAL_POSITION`,
    [BASE_ADMIN],
  );
  return rows.map((r) => String(r.nome));
}

export const primeira = (colunas: string[], candidatas: string[]) => candidatas.find((x) => colunas.includes(x));

/** Valores que significam "sim" nas colunas de marcação da base (1, 'S', true…) */
const ligado = (valor: unknown) => ['1', 's', 'sim', 'true'].includes(String(valor ?? '').trim().toLowerCase());

/** Coluna do papel do usuário (pedweb_admin usa `nivel`) */
const COLUNAS_NIVEL = ['nivel', 'tipo', 'perfil', 'papel'];

/** Colunas de sim/não que marcam o super usuário, quando não há coluna de papel */
const COLUNAS_SUPER = ['super', 'superusuario', 'super_usuario'];

/**
 * Super usuário: só ele administra os usuários do painel e libera bases no MySQL.
 * A marcação é o papel = 'super' (coluna `nivel` no pedweb_admin); 'admin' NÃO é super.
 * Sem coluna de papel, vale uma coluna de sim/não super/superusuario/super_usuario.
 * Sem nenhuma das duas, ninguém é super — essas telas simplesmente não aparecem.
 */
export function ehSuperUsuario(usuario: Record<string, any>, colunas: string[]): boolean {
  const nivel = primeira(colunas, COLUNAS_NIVEL);
  if (nivel) return String(usuario[nivel] ?? '').trim().toLowerCase() === 'super';
  const marcacao = primeira(colunas, COLUNAS_SUPER);
  return marcacao ? ligado(usuario[marcacao]) : false;
}

/** Usuário da sessão; responde 401 e devolve null quando o token não vale mais */
async function usuarioDaRequisicao(req: Request, res: Response) {
  try {
    return (await sessaoDaRequisicao(req)).usuario;
  } catch (err: any) {
    res.status(err.status || 401).json({ error: err.message });
    return null;
  }
}

export function createUsuariosRouter() {
  const router = Router();

  router.post('/login', async (req: Request, res: Response) => {
    const login = String(req.body?.usuario || '').trim().toLowerCase();
    const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
    if (!login) return res.status(400).json({ error: 'Informe o seu usuário / e-mail.' });

    try {
      const colunas = await colunasUsuarios();
      if (!colunas.length) {
        return res.status(500).json({ error: `A tabela ${BASE_ADMIN}.usuarios não existe neste servidor.` });
      }
      const colsLogin = ['email', 'login', 'usuario', 'nome'].filter((x) => colunas.includes(x));
      const colSenha = primeira(colunas, ['senha_hash', 'senha']);
      const colId = primeira(colunas, ['id', 'id_app']);
      if (!colsLogin.length || !colSenha || !colId) {
        return res.status(500).json({
          error: `${BASE_ADMIN}.usuarios precisa de coluna de login (email/login/usuario/nome), de senha (senha_hash/senha) e de id. Colunas encontradas: ${colunas.join(', ')}.`,
        });
      }

      const [rows] = await poolPainel().query<any[]>(
        `SELECT * FROM ${TABELA} WHERE ${colsLogin.map((x) => `LOWER(TRIM(${q(x)})) = ?`).join(' OR ')} LIMIT 1`,
        colsLogin.map(() => login),
      );
      const u = rows[0];
      if (!u) return res.status(401).json({ error: `O usuário "${login}" não foi localizado.` });

      if ('ativo' in u && !['1', 's', 'S', 'true'].includes(String(u.ativo))) {
        return res.status(401).json({ error: 'Este usuário está inativo.' });
      }
      if (!verifyPasswordMatch(senha, String(u[colSenha] ?? ''))) {
        return res.status(401).json({ error: 'Senha incorreta para o usuário informado.' });
      }

      // A manutenção das bases usa a conta de MySQL gravada na linha do usuário
      const cred = credenciaisMysql(u, colunas);
      if (!cred.host || !cred.user) {
        return res.status(500).json({
          error:
            'Este usuário não tem credenciais de MySQL (mysql_host, mysql_port, mysql_user, mysql_senha) ' +
            'e o painel não tem credenciais padrão no .env. Peça ao super usuário para preenchê-las.',
        });
      }

      try {
        await testarConexao(cred.host, cred.port, cred.user, cred.senha);
      } catch (err: any) {
        return res.status(401).json({
          error: `Login aceito, mas a conta de MySQL deste usuário (${cred.user}@${cred.host}:${cred.port}) não conectou: ${err.message}`,
        });
      }

      res.json({
        // Token assinado: a sessão não ocupa memória do servidor (ver server/sessao.ts)
        token: emitirToken(String(u[colId])),
        host: cred.host,
        porta: cred.port,
        usuario: cred.user,
        usuarioPainel: {
          id: String(u[colId]),
          nome: String(u.nome || u.email || u.login || login),
          email: u.email || '',
          super: ehSuperUsuario(u, colunas),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Preferências das listas (larguras, ordem e colunas visíveis), em usuarios.config_listas
  router.get('/config-listas', async (req: Request, res: Response) => {
    const usuario = await usuarioDaRequisicao(req, res);
    if (!usuario) return;
    try {
      const [rows] = await poolPainel().query<any[]>(
        `SELECT config_listas FROM ${TABELA} WHERE ${q(usuario.colunaId)} = ? LIMIT 1`,
        [usuario.id],
      );
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(rows[0]?.config_listas || '{}') || {};
      } catch {
        // conteúdo inválido no banco não impede o painel de abrir
      }
      res.json(config);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  router.put('/config-listas', async (req: Request, res: Response) => {
    const usuario = await usuarioDaRequisicao(req, res);
    if (!usuario) return;
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return res.status(400).json({ error: 'Configuração inválida.' });
    }
    try {
      const [r] = await poolPainel().query<any>(
        `UPDATE ${TABELA} SET config_listas = ? WHERE ${q(usuario.colunaId)} = ?`,
        [JSON.stringify(corpo), usuario.id],
      );
      if (!r.affectedRows) return res.status(404).json({ error: 'Usuário da sessão não encontrado.' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  return router;
}
