import 'dotenv/config';
import express, { Request, Response } from 'express';
import { Conexao, listarBases, clonarBase, checkDbHealth } from './db';
import { createCrudRouter, contexto } from './crud';
import { limparCacheMetadados } from './schema';
import { createUsuariosRouter } from './usuarios';
import { createLiberarBasesRouter } from './liberarBases';
import { sessaoDaRequisicao } from './sessao';

/**
 * App Express com as rotas /api.
 * Local: server.ts acrescenta o Vite e o listen. Na Vercel: api/index.ts.
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  /** Sessão da requisição; responde 401 e devolve null quando o token não vale mais */
  async function sessao(req: Request, res: Response): Promise<Conexao | null> {
    try {
      return await sessaoDaRequisicao(req);
    } catch (err: any) {
      res.status(err.status || 401).json({ error: err.message });
      return null;
    }
  }

  // ==========================================================
  // 0. Sessão: quem abre é o login (server/usuarios.ts); sair é só largar o token
  // ==========================================================
  app.delete('/api/conexao', (_req: Request, res: Response) => {
    res.json({ success: true });
  });

  // Login do painel e config_listas em pedweb_admin.usuarios
  app.use('/api', createUsuariosRouter());

  // Liberação de bases por conta do MySQL (só super usuário)
  app.use('/api', createLiberarBasesRouter());

  // Bases pedweb* que a conta de MySQL do usuário enxerga
  app.get('/api/bases', async (req: Request, res: Response) => {
    const c = await sessao(req, res);
    if (!c) return;
    try {
      limparCacheMetadados(`${c.user}@${c.host}|`);
      res.json(await listarBases(c.pool));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clonar a estrutura de uma base para uma base nova (sem dados)
  app.post('/api/bases', async (req: Request, res: Response) => {
    const c = await sessao(req, res);
    if (!c) return;
    if (!c.usuario.super) return res.status(403).json({ error: 'Só o super usuário pode criar bases.' });
    try {
      const origem = String(req.body?.origem || '');
      const nome = String(req.body?.nome || '').trim().toLowerCase();
      res.json(await clonarBase(c.pool, origem, nome));
    } catch (err: any) {
      res.status(400).json({ error: err.sqlMessage || err.message });
    }
  });

  app.get('/api/db/status', async (req: Request, res: Response) => {
    try {
      const ctx = await contexto(req);
      res.json(await checkDbHealth(ctx.conexao, ctx.base));
    } catch (err: any) {
      res.status(err.status || 400).json({ connected: false, latencyMs: 0, error: err.message });
    }
  });

  // ==========================================================
  // 1. CRUD genérico dirigido pelos metadados da base
  // ==========================================================
  app.use('/api', createCrudRouter());

  return app;
}
