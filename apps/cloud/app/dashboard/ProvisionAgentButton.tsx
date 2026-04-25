'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, ButtonLink, FieldError, Label, Pre, Textarea } from '@/components/ui';

/**
 * "Provision agent" button on a .agent domain row. Opens a small
 * inline form for agent name + description, POSTs to
 * /api/agents/provision-cloud, then shows the returned handoff bundle
 * + private key + WS URL ONCE so the user can copy them into the
 * arp-cloud-client config on their local machine.
 *
 * No modal — keeps the flow inline + scrollable. The private key is
 * shown in a textarea + a "Copy" / "Download" pair. We never re-fetch
 * the private key after the page reloads (cloud doesn't persist it).
 */
type Stage = 'idle' | 'form' | 'submitting' | 'success' | 'error' | 'already_provisioned';

interface ProvisionResponse {
  ok: true;
  agent_did: string;
  principal_did: string;
  public_key_multibase: string;
  agent_private_key_multibase: string;
  gateway_ws_url: string;
  handoff: {
    agent_did: string;
    principal_did: string;
    public_key_multibase: string;
    well_known_urls: { did: string; agent_card: string; arp: string };
    dns_records_published: string[];
    cert_expires_at: string;
    bootstrap_token: string;
  };
}

export function ProvisionAgentButton({
  domain,
  defaultName,
}: {
  domain: string;
  defaultName?: string;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [agentName, setAgentName] = useState(defaultName ?? '');
  const [agentDescription, setAgentDescription] = useState('');
  const [response, setResponse] = useState<ProvisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(force = false): Promise<void> {
    setError(null);
    setStage('submitting');
    try {
      const res = await fetch('/api/agents/provision-cloud', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain,
          agentName: agentName.trim(),
          agentDescription: agentDescription.trim(),
          ...(force ? { force: true } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 409) {
        setError(`Already provisioned: ${body['agent_did'] ?? '(unknown)'}`);
        setStage('already_provisioned');
        return;
      }
      if (!res.ok) {
        setError((body['error'] as string) ?? `provision_failed_${res.status}`);
        setStage('error');
        return;
      }
      setResponse(body as unknown as ProvisionResponse);
      setStage('success');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
    }
  }

  function downloadHandoff(): void {
    if (!response) return;
    const payload = {
      agent_did: response.agent_did,
      principal_did: response.principal_did,
      agent_private_key_multibase: response.agent_private_key_multibase,
      public_key_multibase: response.public_key_multibase,
      gateway_ws_url: response.gateway_ws_url,
      handoff: response.handoff,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain}.arp-handoff.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (stage === 'idle') {
    return (
      <Button variant="default" size="sm" onClick={() => setStage('form')}>
        Provision agent
      </Button>
    );
  }

  if (stage === 'form' || stage === 'submitting') {
    return (
      <div className="border border-rule bg-paper p-4 mt-2">
        <p className="font-mono text-kicker uppercase text-muted mb-3">
          PROVISIONING AGENT FOR · {domain.toUpperCase()}
        </p>
        <Label>Agent name</Label>
        <input
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="Atlas"
          className="w-full border border-rule bg-paper px-3 py-2 text-sm"
          disabled={stage === 'submitting'}
        />
        <Label className="mt-3 block">Description (optional)</Label>
        <Textarea
          value={agentDescription}
          onChange={(e) => setAgentDescription(e.target.value)}
          placeholder="Personal agent on KyberBot."
          rows={2}
          disabled={stage === 'submitting'}
        />
        <div className="mt-4 flex gap-3">
          <Button
            variant="primary"
            arrow
            onClick={() => void handleSubmit(false)}
            disabled={stage === 'submitting' || !agentName.trim()}
          >
            {stage === 'submitting' ? 'Provisioning…' : 'Provision'}
          </Button>
          <ButtonLink
            href="#"
            variant="default"
            size="md"
            onClick={(e) => {
              e.preventDefault();
              setStage('idle');
            }}
          >
            Cancel
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (stage === 'success' && response) {
    return (
      <div className="border border-rule bg-paper p-4 mt-2">
        <p className="font-mono text-kicker uppercase text-muted mb-3">
          PROVISIONED · COPY OR DOWNLOAD ONCE — PRIVATE KEY IS NOT RECOVERABLE
        </p>
        <p className="text-body-sm text-ink-2 mb-3">
          <strong>Agent DID:</strong> <code className="font-mono">{response.agent_did}</code>
          <br />
          <strong>Gateway WS:</strong> <code className="font-mono">{response.gateway_ws_url}</code>
        </p>
        <p className="text-body-sm text-ink-2 mb-2">
          Save this JSON — it contains the agent&apos;s private key.{' '}
          <strong>Cloud does not store it</strong>, so download or copy now.
        </p>
        <div className="flex gap-3 mb-3">
          <Button variant="primary" onClick={downloadHandoff}>
            Download {domain}.arp-handoff.json
          </Button>
          <Button
            variant="default"
            onClick={() =>
              void navigator.clipboard.writeText(JSON.stringify(response, null, 2))
            }
          >
            Copy to clipboard
          </Button>
        </div>
        <details className="text-body-sm">
          <summary className="cursor-pointer font-mono text-kicker uppercase text-muted">
            ▸ NEXT STEP — WIRE LOCAL KYBERBOT
          </summary>
          <Pre className="mt-3 text-xs leading-snug">
{`# 1. install the cloud-client + KyberBot adapter
pnpm add @kybernesis/arp-cloud-client @kybernesis/arp-adapter-kyberbot

# 2. save the downloaded JSON next to your KyberBot config
mv ~/Downloads/${domain}.arp-handoff.json ./atlas-handoff.json

# 3. wire your KyberBot instance:
import { KyberBot } from 'kyberbot';
import { withArp } from '@kybernesis/arp-adapter-kyberbot';

const bot = withArp(new KyberBot({ /* your config */ }), {
  handoff: './atlas-handoff.json',
  dataDir: './.arp-data',
});
await bot.start();
# bot now connects to ${response.gateway_ws_url} and is reachable
# at ${response.agent_did} for inbound DIDComm.`}
          </Pre>
        </details>
        <div className="mt-4">
          <Button variant="default" size="sm" onClick={() => window.location.reload()}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'already_provisioned') {
    return (
      <div className="border border-rule bg-paper p-4 mt-2">
        <p className="font-mono text-kicker uppercase text-muted mb-3">
          ALREADY PROVISIONED · {domain.toUpperCase()}
        </p>
        <p className="text-body-sm text-ink-2 mb-3">{error}</p>
        <p className="text-body-sm text-ink-2 mb-3">
          Lost the handoff JSON? Re-provisioning issues a fresh keypair under
          the same DID. The previous private key is invalidated and any
          local agent still using it can no longer authenticate to the
          cloud-gateway.
        </p>
        <div className="flex gap-3">
          <Button
            variant="primary"
            arrow
            onClick={() => {
              if (
                window.confirm(
                  `Re-provision ${domain}?\n\nThis deletes the existing agent record and generates a new private key. Any running agent that uses the old handoff will stop working.`,
                )
              ) {
                void handleSubmit(true);
              }
            }}
          >
            Re-provision (replaces existing key)
          </Button>
          <Button variant="default" size="sm" onClick={() => setStage('idle')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-rule bg-paper p-4 mt-2">
      <FieldError className="mb-3">Error: {error}</FieldError>
      <Button variant="default" size="sm" onClick={() => setStage('idle')}>
        Try again
      </Button>
    </div>
  );
}
