import { defineConfig, loadEnv, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/** Serve api/quest/chat.ts during `npm run dev`, mirroring the Vercel function. */
function devApi(): Plugin {
  return {
    name: 'naga-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/quest/chat', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/quest/chat.ts');
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const request = new Request(`http://localhost/api/quest/chat`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response> | Response) | undefined;
          if (!handler) { res.statusCode = 405; res.end(); return; }
          const out = await handler(request);
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose server-side keys to the dev API only (never to client code: no VITE_ prefix).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [devApi(), ...(mode === 'https' ? [basicSsl()] : [])],
    server: { host: true, port: 5173 },
    build: { target: 'es2022', outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
