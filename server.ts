import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createApiApp } from './server/apiApp.ts';
import { attachCollabWebSocket } from './server/collabHub.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApiApp();
  const httpServer = http.createServer(app);
  attachCollabWebSocket(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
