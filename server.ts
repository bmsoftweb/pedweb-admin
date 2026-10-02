import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { obterConexao, fecharConexao, listarBases, clonarBase, checkDbHealth } from './server/db';
import { createCrudRouter, contexto } from './server/crud';
import { limparCacheMetadados } from './server/schema';
import { createUsuariosRouter } from './server/usuarios';
import { createLiberarBasesRouter } from './server/liberarBases';

const PORT = Number(process.env.ADMIN_PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // ==========================================================
  // 0. Sessão: o login (server/usuarios.ts) é que abre a conexão MySQL do usuário
  // ==========================================================
  app.delete('/api/conexao', async (req: Request, res: Response) => {
    await fecharConexao(String(req.header('x-conexao') || ''));
    res.json({ success: true });
  });

  // Login do painel e config_listas em pedweb_admin.usuarios
  app.use('/api', createUsuariosRouter());

  // Liberação de bases por conta do MySQL (só super usuário)
  app.use('/api', createLiberarBasesRouter());

  // Bases pedweb* do servidor conectado
  app.get('/api/bases', async (req: Request, res: Response) => {
    const token = String(req.header('x-conexao') || '');
    const c = obterConexao(token);
    if (!c) return res.status(401).json({ error: 'Conexão expirada. Conecte-se novamente ao servidor MySQL.' });
    if (!c.usuario) return res.status(401).json({ error: 'Faça login no painel para continuar.' });
    try {
      limparCacheMetadados(`${token}|`);
      res.json(await listarBases(c.pool));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clonar a estrutura de uma base para uma base nova (sem dados)
  app.post('/api/bases', async (req: Request, res: Response) => {
    const c = obterConexao(String(req.header('x-conexao') || ''));
    if (!c) return res.status(401).json({ error: 'Conexão expirada. Conecte-se novamente ao servidor MySQL.' });
    if (!c.usuario) return res.status(401).json({ error: 'Faça login no painel para continuar.' });
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

  // ==========================================================
  // VITE / SPA
  // ==========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin pedWeb rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor administrativo:', err);
  process.exit(1);
});
