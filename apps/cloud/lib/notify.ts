/**
 * Send an email at most once per (kind, ref). The `email_log` row is the
 * receipt; a second call with the same key is a no-op. Used for renewal
 * reminders, receipts and status mails so webhook replays and daily crons
 * never double-send.
 */

import { and, eq } from 'drizzle-orm';
import { emailLog, type CloudDbClient } from '@kybernesis/arp-cloud-db';
import { sendEmail, type EmailMessage } from './email';

export async function sendOnce(
  db: CloudDbClient,
  key: { kind: string; ref: string; to: string | null | undefined; tenantId?: string | null },
  msg: EmailMessage,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<'sent' | 'duplicate' | 'no_address'> {
  if (!key.to) return 'no_address';
  const prior = await db.select({ id: emailLog.id }).from(emailLog).where(and(eq(emailLog.kind, key.kind), eq(emailLog.ref, key.ref))).limit(1);
  if (prior.length > 0) return 'duplicate';
  await db.insert(emailLog).values({ kind: key.kind, ref: key.ref, toEmail: key.to, tenantId: key.tenantId ?? null });
  await sendEmail({ to: key.to, ...msg }, deps.fetchImpl);
  return 'sent';
}
