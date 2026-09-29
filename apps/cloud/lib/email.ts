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

/* ---------------- Billing + product emails (lander model, 2026-09-29) ---------------- */

const WRAP = (inner: string) => `<div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;color:#09090b;max-width:520px;line-height:1.5">${inner}<p style="font-size:12px;color:#a1a1aa;margin:24px 0 0">AgentID · by Kybernesis</p></div>`;
const P = (t: string) => `<p style="font-size:15px;color:#3f3f46;margin:0 0 12px">${t}</p>`;
const H = (t: string) => `<p style="font-size:20px;font-weight:600;color:#09090b;margin:0 0 12px">${t}</p>`;
const A = (href: string, t: string) => `<a href="${href}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:500">${t}</a>`;

export interface EmailMessage { subject: string; text: string; html: string }

export function mdyDate(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

export function nameClaimedEmail(input: { domain: string; renewsOn: Date | null; nameUrl: string; profileUrl: string }): EmailMessage {
  const when = input.renewsOn ? mdyDate(input.renewsOn) : 'in one year';
  return {
    subject: `${input.domain} is yours`,
    text: `${input.domain} is registered to your account.\n\nIt renews on ${when} from the card on file, $29 a year, and you can turn that off any time on the Billing page.\n\nNext: give it a description and picture, then connect your agent: ${input.nameUrl}\nIts public page: ${input.profileUrl}`,
    html: WRAP(H(`${input.domain} is yours.`) + P(`It is registered to your account and renews on <strong>${when}</strong> from the card on file, $29 a year. You can turn that off any time on the Billing page.`) + P('Next: give it a description and a picture, then connect your agent.') + A(input.nameUrl, 'Open the name') + P(`<br>Its public page: <a href="${input.profileUrl}">${input.profileUrl}</a>`)),
  };
}

export function renewalReminderEmail(input: { domain: string; days: number; renewsOn: Date; autoRenew: boolean; billingUrl: string }): EmailMessage {
  const when = mdyDate(input.renewsOn);
  const soon = input.days === 1 ? 'tomorrow' : `in ${input.days} days`;
  if (input.autoRenew) {
    return {
      subject: `${input.domain} renews ${soon}`,
      text: `${input.domain} renews on ${when} ($29 for another year), charged to the card on file. Nothing to do.\n\nTo change the card or stop the renewal: ${input.billingUrl}`,
      html: WRAP(H(`${input.domain} renews ${soon}.`) + P(`On <strong>${when}</strong> we charge $29 to the card on file for another year. Nothing to do.`) + P('To change the card or stop the renewal, open Billing.') + A(input.billingUrl, 'Billing')),
    };
  }
  return {
    subject: `${input.domain} expires ${soon}`,
    text: `Auto-renew is off for ${input.domain}, so it expires on ${when}. After a short grace period it becomes available to anyone.\n\nTo keep it, turn auto-renew back on: ${input.billingUrl}`,
    html: WRAP(H(`${input.domain} expires ${soon}.`) + P(`Auto-renew is off, so it expires on <strong>${when}</strong>. After a short grace period it becomes available to anyone.`) + P('To keep it, turn auto-renew back on.') + A(input.billingUrl, 'Keep my name')),
  };
}

export function nameRenewedEmail(input: { domain: string; renewsOn: Date | null; billingUrl: string }): EmailMessage {
  const when = input.renewsOn ? mdyDate(input.renewsOn) : 'next year';
  return {
    subject: `${input.domain} renewed for another year`,
    text: `Thanks — ${input.domain} is renewed. The next renewal is on ${when}. Your receipt is on the Billing page: ${input.billingUrl}`,
    html: WRAP(H(`${input.domain} is renewed.`) + P(`Thanks. The next renewal is on <strong>${when}</strong>. Your receipt is on the Billing page.`) + A(input.billingUrl, 'Billing')),
  };
}

export function paymentFailedEmail(input: { what: string; billingUrl: string }): EmailMessage {
  return {
    subject: `Payment for ${input.what} did not go through`,
    text: `We could not charge the card on file for ${input.what}. Update the card on the Billing page and we retry automatically: ${input.billingUrl}`,
    html: WRAP(H('A payment did not go through.') + P(`We could not charge the card on file for <strong>${input.what}</strong>. Update the card and we retry automatically.`) + A(input.billingUrl, 'Update card')),
  };
}

export function connectChangedEmail(input: { active: boolean; billingUrl: string; pairUrl: string }): EmailMessage {
  return input.active
    ? { subject: 'Connect is on', text: `Connect is active on your account: pair your agents with others, decide what each may do, pause or end at any time. Start a pairing: ${input.pairUrl}`, html: WRAP(H('Connect is on.') + P('Pair your agents with others, decide what each may do, pause or end at any time.') + A(input.pairUrl, 'Pair two agents')) }
    : { subject: 'Connect has ended', text: `Connect has ended on your account. Existing connections keep working; new pairings need Connect again: ${input.billingUrl}`, html: WRAP(H('Connect has ended.') + P('Existing connections keep working. New pairings need Connect again.') + A(input.billingUrl, 'Billing')) };
}

/** Operational mail to us: a customer paid a renewal; the supplier side is manual today. */
export function opsUpstreamRenewalEmail(input: { domain: string; tenantId: string; periodEnd: Date | null }): EmailMessage {
  const when = input.periodEnd ? mdyDate(input.periodEnd) : '?';
  return {
    subject: `[ops] Renew ${input.domain} at the registrar`,
    text: `Customer renewal paid for ${input.domain} (tenant ${input.tenantId}). Renew it at the supplier (1 year) before ${when}; the reconcile cron picks up the new expiry.`,
    html: WRAP(H(`Renew ${input.domain} at the registrar.`) + P(`Customer renewal paid (tenant ${input.tenantId}). Renew 1 year at the supplier before <strong>${when}</strong>; the reconcile cron picks up the new expiry.`)),
  };
}
