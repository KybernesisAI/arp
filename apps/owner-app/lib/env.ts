import { z } from 'zod';

/**
 * Server-side env accessor. Throws loudly on misconfig so we never ship a
 * build that talks to the wrong runtime or leaks the admin token.
 */
const EnvSchema = z.object({
  ARP_RUNTIME_URL: z.string().url().default('http://127.0.0.1:9000'),
  ARP_ADMIN_TOKEN: z.string().min(1),
  ARP_AGENT_DID: z.string().min(1).default('did:web:samantha.agent'),
  ARP_PRINCIPAL_DID: z.string().min(1).default('did:web:ian.example.agent'),
  ARP_SESSION_SECRET: z.string().min(16).default('dev-session-secret-change-me-000000'),
  ARP_OWNER_APP_BASE_URL: z.string().url().default('http://127.0.0.1:3000'),
  ARP_SCOPE_CATALOG_VERSION: z.string().default('v1'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `owner-app env misconfig: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  cached = parsed.data;
  return cached;
}
