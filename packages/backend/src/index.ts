import { Hono } from 'hono';

type Env = {
  Bindings: {
    TOOLS: R2Bucket;
    DB: D1Database;
  };
};

const app = new Hono<Env>();

app.get('/v1/registry', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM tools WHERE published = 1 ORDER BY name').all();
  return c.json(result.results);
});

app.get('/v1/tools/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.DB.prepare('SELECT * FROM tools WHERE id = ?').bind(id).first();
  if (!result) return c.json({ error: 'Tool not found' }, 404);
  return c.json(result);
});

// R2 static serving for tool assets
app.get('/tools/:id/*', async (c) => {
  const path = c.req.path.replace(/^\//, '');
  const obj = await c.env.TOOLS.get(path);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=3600');
  return new Response(obj.body, { headers });
});

app.get('/', (c) => c.redirect('https://freedatastore.online'));

export default app;
