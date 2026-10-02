import { Router, Request, Response } from 'express';
import { Conexao, listarBases, q } from './db';
import { sessaoDaRequisicao } from './sessao';

/**
 * Liberação de bases por usuário DO MYSQL (não o usuário do painel): o super usuário
 * marca quais bases pedweb* cada conta do MySQL enxerga, e isso vira GRANT/REVOKE.
 *
 * Só mexe nas bases pedweb* que existem no servidor; nenhuma outra base, nem o
 * privilégio global, é tocada.
 */

/** Privilégios concedidos em uma base liberada */
const PRIVILEGIOS = 'ALL PRIVILEGES';

/** Contas internas do MySQL, que nunca aparecem na tela */
const CONTAS_INTERNAS = ['mysql.sys', 'mysql.session', 'mysql.infoschema'];

export interface UsuarioMysql {
  usuario: string;
  host: string;
  /** Tem privilégio global (*.*): enxerga tudo, independentemente das bases marcadas */
  global: boolean;
  /** É a conta usada nesta conexão do painel: não pode ser alterada aqui */
  atual: boolean;
}

/**
 * O MySQL recusa um GRANT/REVOKE quando a conta do painel não tem GRANT OPTION na base
 * (erro 1044/1227), mesmo podendo usar a base. A mensagem crua não diz isso.
 */
function erroDePrivilegio(err: any, quem: string, base: string): string {
  const cru = err?.sqlMessage || err?.message || 'erro desconhecido';
  if (['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(err?.code)) {
    return (
      `${base}: a conta ${quem}, usada por esta conexão do painel, não pode repassar privilégios desta base. ` +
      'Conceda GRANT OPTION a ela (ex.: GRANT ALL PRIVILEGES ON `' +
      base +
      '`.* TO ... WITH GRANT OPTION) ou conecte o painel com uma conta administrativa.'
    );
  }
  return `${base}: ${cru}`;
}

/** Literal 'usuario'@'host' com as aspas escapadas */
const conta = (usuario: string, host: string) =>
  `'${usuario.replace(/'/g, "''")}'@'${host.replace(/'/g, "''")}'`;

/**
 * O que precisa mudar para o usuário enxergar exatamente as bases marcadas.
 * Só entra na conta base que existe no servidor.
 */
export function calcularMudancas(atuais: string[], desejadas: string[], existentes: string[]) {
  const tem = new Set(atuais);
  const quer = new Set(desejadas.filter((b) => existentes.includes(b)));
  return {
    conceder: existentes.filter((b) => quer.has(b) && !tem.has(b)),
    revogar: existentes.filter((b) => !quer.has(b) && tem.has(b)),
  };
}

/** Bases pedweb* que a conta já enxerga, pelos privilégios por base (mysql.db) */
async function basesLiberadas(c: Conexao, usuario: string, host: string, existentes: string[]) {
  const [linhas] = await c.pool.query<any[]>(
    'SELECT Db AS base FROM mysql.db WHERE User = ? AND Host = ? AND Select_priv = ?',
    [usuario, host, 'Y'],
  );
  // O privilégio pode estar gravado com curinga (pedweb\_%): vale para as bases que ele cobre
  const padroes = linhas.map((l) => String(l.base));
  return existentes.filter((base) =>
    padroes.some((p) => new RegExp(`^${p.replace(/\\_/g, '_').replace(/%/g, '.*')}$`, 'i').test(base)),
  );
}

export function createLiberarBasesRouter() {
  /** Só o super usuário do painel chega aqui */
  async function sessao(req: Request, res: Response): Promise<Conexao | null> {
    let c: Conexao;
    try {
      c = await sessaoDaRequisicao(req);
    } catch (err: any) {
      res.status(err.status || 401).json({ error: err.message });
      return null;
    }
    if (!c.usuario.super) {
      res.status(403).json({ error: 'Só o super usuário libera bases para contas do MySQL.' });
      return null;
    }
    return c;
  }

  const router = Router();

  // Contas do MySQL do servidor conectado
  router.get('/mysql/usuarios', async (req: Request, res: Response) => {
    const c = await sessao(req, res);
    if (!c) return;
    try {
      const [linhas] = await c.pool.query<any[]>(
        `SELECT User AS usuario, Host AS host, Select_priv AS global
           FROM mysql.user WHERE User NOT IN (?) ORDER BY User, Host`,
        [CONTAS_INTERNAS],
      );
      const usuarios: UsuarioMysql[] = linhas.map((l) => ({
        usuario: String(l.usuario),
        host: String(l.host),
        global: String(l.global).toUpperCase() === 'Y',
        atual: String(l.usuario) === c.user,
      }));
      res.json(usuarios);
    } catch (err: any) {
      res.status(403).json({
        error: `Não foi possível ler as contas do MySQL com o usuário ${c.user}: ${err.sqlMessage || err.message}`,
      });
    }
  });

  // Bases que uma conta enxerga hoje
  router.get('/mysql/usuarios/bases', async (req: Request, res: Response) => {
    const c = await sessao(req, res);
    if (!c) return;
    try {
      const usuario = String(req.query.usuario || '');
      const host = String(req.query.host || '');
      const existentes = (await listarBases(c.pool)).map((b) => b.nome);
      res.json({ bases: await basesLiberadas(c, usuario, host, existentes) });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  // Aplica as marcações: concede o que falta e revoga o que sobra
  router.put('/mysql/usuarios/bases', async (req: Request, res: Response) => {
    const c = await sessao(req, res);
    if (!c) return;
    try {
      const usuario = String(req.body?.usuario || '');
      const host = String(req.body?.host || '');
      const desejadas: string[] = Array.isArray(req.body?.bases) ? req.body.bases.map(String) : [];

      // A conta precisa existir; assim nada do que vem do navegador entra no SQL sem conferência
      const [existe] = await c.pool.query<any[]>(
        'SELECT 1 FROM mysql.user WHERE User = ? AND Host = ? LIMIT 1',
        [usuario, host],
      );
      if (!existe.length) throw new Error(`A conta ${usuario}@${host} não existe neste servidor.`);
      if (CONTAS_INTERNAS.includes(usuario)) throw new Error('Esta é uma conta interna do MySQL.');
      // Mexer na própria conta derrubaria o painel no meio da operação
      if (usuario === c.user) throw new Error('Não dá para alterar a conta usada por esta conexão do painel.');

      const existentes = (await listarBases(c.pool)).map((b) => b.nome);
      const atuais = await basesLiberadas(c, usuario, host, existentes);
      const { conceder, revogar } = calcularMudancas(atuais, desejadas, existentes);

      // Cada base é aplicada por si: o que falhar vira aviso, sem desfazer o que deu certo
      const alvo = conta(usuario, host);
      const quem = `${c.user}@${c.host}`;
      const erros: string[] = [];
      const feitos = { conceder: [] as string[], revogar: [] as string[] };

      for (const base of conceder) {
        try {
          await c.pool.query(`GRANT ${PRIVILEGIOS} ON ${q(base)}.* TO ${alvo}`);
          feitos.conceder.push(base);
        } catch (err: any) {
          erros.push(erroDePrivilegio(err, quem, base));
        }
      }
      for (const base of revogar) {
        try {
          await c.pool.query(`REVOKE ${PRIVILEGIOS} ON ${q(base)}.* FROM ${alvo}`);
          feitos.revogar.push(base);
        } catch (err: any) {
          erros.push(erroDePrivilegio(err, quem, base));
        }
      }
      if (feitos.conceder.length || feitos.revogar.length) {
        await c.pool.query('FLUSH PRIVILEGES').catch(() => {});
      }

      res.json({
        conceder: feitos.conceder,
        revogar: feitos.revogar,
        erros,
        bases: await basesLiberadas(c, usuario, host, existentes),
      });
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  return router;
}
