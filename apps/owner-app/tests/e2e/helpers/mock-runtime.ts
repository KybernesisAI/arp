import http from 'node:http';

/**
 * Minimal drop-in for the `/admin/*` surface the owner app talks to. Backed
 * by in-memory state so Playwright runs deterministic: no SQLite, no files.
 */
export interface MockRuntimeOptions {
  port: number;
  adminToken: string;
}

export interface MockRuntime {
  readonly port: number;
  stop(): Promise<void>;
  /** Seed a connection so the address book has something to show. */
  addConnection(connection: Record<string, unknown>): void;
}

export function startMockRuntime(opts: MockRuntimeOptions): Promise<MockRuntime> {
  const connections: Record<string, unknown>[] = [];
  const pendingInvitations: Array<{
    connection_id: string;
    proposal: unknown;
    invitation_url: string | null;
    created_at: string;
  }> = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${opts.port}`);

    if (!url.pathname.startsWith('/admin/')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.headers.authorization !== `Bearer ${opts.adminToken}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const body = await readJson(req);

    if (url.pathname === '/admin/connections' && req.method === 'GET') {
      respond(res, 200, { connections });
      return;
    }
    if (url.pathname === '/admin/connections' && req.method === 'POST') {
      const entry: Record<string, unknown> =
        (body?.token as Record<string, unknown> | undefined) ??
        body ??
        ({} as Record<string, unknown>);
      connections.push(entry);
      respond(res, 200, { connection: entry });
      return;
    }
    if (
      /^\/admin\/connections\/[^/]+$/.test(url.pathname) &&
      req.method === 'GET'
    ) {
      const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const conn = connections.find(
        (c) => (c as { connection_id?: string }).connection_id === id,
      );
      if (!conn) {
        respond(res, 404, { error: 'not_found' });
        return;
      }
      respond(res, 200, { connection: conn });
      return;
    }
    if (
      /^\/admin\/connections\/[^/]+\/revoke$/.test(url.pathname) &&
      req.method === 'POST'
    ) {
      const id = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const conn = connections.find(
        (c) => (c as { connection_id?: string }).connection_id === id,
      ) as { status?: string } | undefined;
      if (conn) conn.status = 'revoked';
      respond(res, 200, { ok: true });
      return;
    }
    if (
      url.pathname === '/admin/pairing/invitations' &&
      req.method === 'POST'
    ) {
      const proposal = body?.proposal as Record<string, unknown> | undefined;
      const connectionId = (proposal?.connection_id as string) ?? 'conn_unknown';
      const invitationUrl =
        typeof body?.invitation_url === 'string'
          ? (body.invitation_url as string)
          : null;
      pendingInvitations.push({
        connection_id: connectionId,
        proposal: proposal ?? {},
        invitation_url: invitationUrl,
        created_at: new Date().toISOString(),
      });
      respond(res, 200, {
        ok: true,
        connection_id: connectionId,
        invitation_url: invitationUrl,
      });
      return;
    }
    if (
      url.pathname === '/admin/pairing/invitations' &&
      req.method === 'GET'
    ) {
      respond(res, 200, { invitations: pendingInvitations });
      return;
    }
    if (url.pathname === '/admin/pairing/accept' && req.method === 'POST') {
      const token = body?.token as Record<string, unknown> | undefined;
      if (token) connections.push(token);
      respond(res, 200, { connection: token });
      return;
    }
    if (url.pathname === '/admin/keys/rotate' && req.method === 'POST') {
      respond(res, 501, {
        error: 'not_implemented',
        reason: 'Restart required for key rotation in v0.',
      });
      return;
    }
    if (
      /^\/admin\/audit\/[^/]+$/.test(url.pathname) &&
      req.method === 'GET'
    ) {
      respond(res, 200, {
        connection_id: decodeURIComponent(url.pathname.split('/').pop() ?? ''),
        total: 0,
        offset: 0,
        limit: 50,
        entries: [],
        verification: { valid: true, entriesSeen: 0 },
      });
      return;
    }

    respond(res, 404, { error: 'not_found' });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      resolve({
        port: opts.port,
        async stop() {
          await new Promise<void>((r) => server.close(() => r()));
        },
        addConnection(connection) {
          connections.push(connection);
        },
      });
    });
  });
}

async function readJson(
  req: http.IncomingMessage,
): Promise<Record<string, unknown> | null> {
  if (req.method === 'GET') return null;
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

function respond(
  res: http.ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}
