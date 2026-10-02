import crypto from 'crypto';
import { Request } from 'express';
import { BASE_ADMIN, Conexao, poolPainel, poolPara, q } from './db.js';
import { colunasUsuarios, credenciaisMysql, ehSuperUsuario, primeira } from './usuarios.js';

/**
 * Sessão sem estado: o token é "usuarioId.expiracao.assinatura" (HMAC-SHA256).
 *
 * Nada fica guardado no processo — necessário na Vercel, onde cada requisição pode cair
 * em uma instância diferente. A cada chamada o painel relê o usuário em pedweb_admin e
 * reaproveita (ou cria) o pool da conta de MySQL dele.
 */
const SEGREDO =
  process.env.SESSION_SECRET ||
  (console.warn('SESSION_SECRET não definido: as sessões caem a cada reinício do servidor.'),
  crypto.randomBytes(32).toString('hex'));

const VALIDADE_MS = 12 * 60 * 60 * 1000;

const assinar = (dados: string) => crypto.createHmac('sha256', SEGREDO).update(dados).digest('base64url');

export function emitirToken(usuarioId: string): string {
  const dados = `${usuarioId}.${Date.now() + VALIDADE_MS}`;
  return `${dados}.${assinar(dados)}`;
}

/** Id do usuário gravado no token, ou null se inválido/expirado */
export function lerToken(token: string): string | null {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [id, exp, assinatura] = partes;
  const esperada = assinar(`${id}.${exp}`);
  if (
    esperada.length !== assinatura.length ||
    !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(assinatura))
  ) {
    return null;
  }
  if (Number(exp) < Date.now()) return null;
  return id;
}

/** Erro 401: o front volta para a tela de login */
function expirada(mensagem: string) {
  const err: any = new Error(mensagem);
  err.status = 401;
  return err;
}

/**
 * Conexão de trabalho da requisição: valida o token, relê o usuário em pedweb_admin e
 * devolve o pool da conta de MySQL dele.
 */
export async function sessaoDaRequisicao(req: Request): Promise<Conexao> {
  const id = lerToken(String(req.header('x-conexao') || ''));
  if (!id) throw expirada('Sessão expirada. Entre novamente no painel.');

  const colunas = await colunasUsuarios();
  const colId = primeira(colunas, ['id', 'id_app']);
  if (!colId) throw new Error(`A tabela ${BASE_ADMIN}.usuarios não tem coluna de id.`);

  const [linhas] = await poolPainel().query<any[]>(`SELECT * FROM ${q('usuarios')} WHERE ${q(colId)} = ? LIMIT 1`, [id]);
  const u = linhas[0];
  if (!u) throw expirada('O usuário desta sessão não existe mais.');
  if ('ativo' in u && !['1', 's', 'S', 'true'].includes(String(u.ativo))) {
    throw expirada('Este usuário está inativo.');
  }

  const cred = credenciaisMysql(u, colunas);
  return {
    pool: poolPara(cred.host, cred.port, cred.user, cred.senha),
    host: cred.host,
    port: cred.port,
    user: cred.user,
    usuario: {
      id: String(u[colId]),
      nome: String(u.nome || u.email || u.login || id),
      colunaId: colId,
      super: ehSuperUsuario(u, colunas),
    },
  };
}
