'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Badge, Button, FieldError, Input, Label, Pre, Textarea } from '@/components/ui';

type Kind = 'nostr' | 'kybernesis' | 'runtime' | 'web';
type Link = {
  id: string;
  kind: Kind;
  value: string;
  display: string;
  label: string | null;
  status: 'pending' | 'verified' | 'revoked';
  challenge: string | null;
  challenge_string: string | null;
  verified_at: string | null;
};

const KIND_META: Record<Kind, { label: string; placeholder: string; hint: string; needsProof: boolean }> = {
  nostr: {
    label: 'Buzz / nostr',
    placeholder: 'npub1…',
    hint: 'Sign the challenge with the linked key (any nostr signer). Paste the signed event JSON below.',
    needsProof: true,
  },
  kybernesis: {
    label: 'Kybernesis control plane',
    placeholder: 'agent:<org>/<name>',
    hint: 'In the Kybernesis admin, open the agent and choose "Link .agent name". Paste the signed statement below.',
    needsProof: true,
  },
  runtime: {
    label: 'Runtime endpoint',
    placeholder: 'https://your-agent.example/eve/v1',
    hint: 'Serve GET <url>/.well-known/agentid-verification returning {"did": "…", "challenge": "…"} with this challenge, then verify.',
    needsProof: false,
  },
  web: {
    label: 'Website',
    placeholder: 'https://example.com',
    hint: 'Serve the verification document at /.well-known/agentid-verification, or add <meta name="agentid" content="<id>:<challenge>"> to the home page, then verify.',
    needsProof: false,
  },
};

/**
 * Identities panel (AgentID S3 / L5): attach other identities to a name and
 * verify each with a two-way proof. Customer vocabulary only.
 */
export function LinksPanel({ sld, agentDid }: { sld: string; agentDid: string }): React.JSX.Element {
  const [links, setLinks] = useState<Link[]>([]);
  const [kind, setKind] = useState<Kind>('nostr');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofs, setProofs] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    const res = await fetch(`/api/names/${encodeURIComponent(sld)}/links`);
    if (res.ok) setLinks(((await res.json()) as { links: Link[] }).links);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy('add');
    setError(null);
    try {
      const res = await fetch(`/api/names/${encodeURIComponent(sld)}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'The link could not be added.');
        return;
      }
      setValue('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function verify(link: Link): Promise<void> {
    setBusy(link.id);
    setError(null);
    try {
      const needsProof = KIND_META[link.kind].needsProof;
      let proof: unknown = undefined;
      if (needsProof) {
        const raw = (proofs[link.id] ?? '').trim();
        try {
          proof = link.kind === 'nostr' ? JSON.parse(raw) : raw;
        } catch {
          proof = raw;
        }
      }
      const res = await fetch(`/api/names/${encodeURIComponent(sld)}/links/${link.id}/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(needsProof ? { proof } : {}),
      });
      const body = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'Verification failed.');
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(link: Link): Promise<void> {
    setBusy(link.id);
    setError(null);
    try {
      await fetch(`/api/names/${encodeURIComponent(sld)}/links/${link.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <form onSubmit={(e) => void add(e)} className="p-5 grid grid-cols-12 gap-3 items-end border-b border-rule">
        <div className="col-span-12 md:col-span-3">
          <Label htmlFor="link-kind">Identity type</Label>
          <select
            id="link-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="w-full border border-rule bg-paper px-3 py-2 font-mono text-[13px]"
          >
            {(Object.keys(KIND_META) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-12 md:col-span-7">
          <Label htmlFor="link-value">Identifier</Label>
          <Input id="link-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={KIND_META[kind].placeholder} autoComplete="off" spellCheck={false} />
        </div>
        <div className="col-span-12 md:col-span-2">
          <Button type="submit" variant="primary" disabled={busy !== null || value.trim().length === 0} className="w-full">
            {busy === 'add' ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {error && <FieldError className="col-span-12">{error}</FieldError>}
      </form>

      {links.length === 0 ? (
        <p className="p-5 text-body-sm text-ink-2 m-0">No linked identities yet. Add one above; each link is verified from both sides before it shows on your profile.</p>
      ) : (
        <ul className="list-none p-0 m-0">
          {links.map((l, i) => (
            <li key={l.id} className={'p-5 ' + (i < links.length - 1 ? 'border-b border-rule' : '')}>
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-12 md:col-span-3 font-mono text-[10.5px] tracking-[0.12em] uppercase text-muted">{KIND_META[l.kind].label}</div>
                <div className="col-span-12 md:col-span-5 font-mono text-[12px] break-all">{l.display}</div>
                <div className="col-span-6 md:col-span-2">
                  <Badge tone={l.status === 'verified' ? 'blue' : 'yellow'} className="text-[9px] px-2 py-0.5">
                    {l.status === 'verified' ? '✓ VERIFIED' : 'PENDING'}
                  </Badge>
                </div>
                <div className="col-span-6 md:col-span-2 flex justify-end gap-2">
                  {l.status === 'pending' && !KIND_META[l.kind].needsProof && (
                    <Button type="button" size="sm" variant="primary" onClick={() => void verify(l)} disabled={busy !== null}>
                      {busy === l.id ? 'Checking…' : 'Verify'}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="default" onClick={() => void remove(l)} disabled={busy !== null}>
                    Remove
                  </Button>
                </div>
                {l.status === 'pending' && (
                  <div className="col-span-12 border-t border-rule pt-3 mt-1">
                    <p className="text-body-sm text-ink-2 m-0 mb-2">{KIND_META[l.kind].hint}</p>
                    <div className="font-mono text-kicker uppercase text-muted mb-1">CHALLENGE</div>
                    <Pre className="text-[11px] mb-3">{KIND_META[l.kind].needsProof ? l.challenge_string : JSON.stringify({ did: agentDid, challenge: l.challenge })}</Pre>
                    {KIND_META[l.kind].needsProof && (
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-12 md:col-span-10">
                          <Label htmlFor={`proof-${l.id}`}>{l.kind === 'nostr' ? 'Signed event (JSON)' : 'Signed statement'}</Label>
                          <Textarea id={`proof-${l.id}`} rows={3} value={proofs[l.id] ?? ''} onChange={(e) => setProofs({ ...proofs, [l.id]: e.target.value })} spellCheck={false} />
                        </div>
                        <div className="col-span-12 md:col-span-2">
                          <Button type="button" variant="primary" className="w-full" onClick={() => void verify(l)} disabled={busy !== null || (proofs[l.id] ?? '').trim().length === 0}>
                            {busy === l.id ? 'Verifying…' : 'Verify'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
