import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type ErrorRequestHandler } from 'express';

import { createBossRouter } from './routes/boss.js';

const DEFAULT_PORT = 4173;

const envFile = path.resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function readPort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : DEFAULT_PORT;
}

const apiErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'invalid_json' });
    return;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    response.status(413).json({ error: 'payload_too_large' });
    return;
  }

  console.error('[api] unhandled request error');
  response.status(500).json({ error: 'internal_error' });
};

export async function createApp() {
  const app = express();
  const projectRoot = process.cwd();
  const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });
  app.use('/api/boss', express.json({ limit: '3968b', strict: true }), createBossRouter());
  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'not_found' });
  });
  app.use(apiErrorHandler);

  if (isProduction) {
    const distDirectory = path.resolve(projectRoot, 'dist');
    app.use(express.static(distDirectory, { index: false }));
    app.use((_request, response) => {
      response.sendFile(path.join(distDirectory, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      appType: 'spa',
      server: { middlewareMode: true },
    });
    app.use(vite.middlewares);
  }

  return app;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntryPoint) {
  const port = readPort(process.env.PORT);
  const app = await createApp();
  app.listen(port, () => {
    console.info(`NOXCAT server listening on http://localhost:${port}`);
  });
}
