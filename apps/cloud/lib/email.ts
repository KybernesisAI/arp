/**
 * Outbound email (owner account, S6d). Resend over plain fetch — no SDK.
 *
 * `RESEND_API_KEY` is set on Vercel (never in the repo). `EMAIL_FROM` is the
 * verified sender. Without a key (local dev, tests) `sendEmail` logs the
 * message and resolves, so flows can be exercised end to end.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function emailFrom(): string {
  return process.env['EMAIL_FROM'] ?? 'AgentID <sign-in@notifications.kybernesis.ai>';
}

export async function sendEmail(msg: OutboundEmail, fetchImpl: typeof fetch = globalThis.fetch): Promise<{ id: string | null; delivered: boolean }> {
  const key = process.env['RESEND_API_KEY'];
  if (!key) {
    // eslint-disable-next-line no-console
    console.info('[email] (no RESEND_API_KEY) would send', { to: msg.to, subject: msg.subject });
    return { id: null, delivered: false };
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: emailFrom(), to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`email send failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { id: body.id ?? null, delivered: true };
}

/** The one-time code message. Plain, short, no links to click. */
export function codeEmail(code: string, purpose: 'sign_in' | 'verify_email'): { subject: string; text: string; html: string } {
  const what = purpose === 'sign_in' ? 'sign in to AgentID' : 'confirm this email for your AgentID account';
  const subject = purpose === 'sign_in' ? `${code} is your AgentID sign-in code` : `${code} confirms your email for AgentID`;
  const text = `Your code is ${code}\n\nEnter it to ${what}. It works for 10 minutes and only once.\n\nIf you did not ask for this, ignore this email.`;
  const html = `<div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#09090b;max-width:480px">
  <p style="font-size:14px;color:#52525b;margin:0 0 12px">Your code to ${what}</p>
  <p style="font-family:ui-monospace,Menlo,monospace;font-size:34px;letter-spacing:0.18em;margin:0 0 20px">${code}</p>
  <p style="font-size:14px;color:#52525b;margin:0">It works for 10 minutes and only once. If you did not ask for this, ignore this email.</p>
</div>`;
  return { subject, text, html };
}
