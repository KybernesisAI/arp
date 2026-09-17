'use client';

import type * as React from 'react';
import { useState } from 'react';
import { Button, FieldError, Pre } from '@/components/ui';

/**
 * "Export key" (AgentID S2 / T9): moves a name's key from the cloud to the
 * owner. Shown once; download it, and the cloud keeps no copy.
 */
export function ExportKeyButton({ agentDid, domain }: { agentDid: string; domain: string }): React.JSX.Element {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'working' | 'done' | 'error'>('idle');
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setStage('working');
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentDid)}/export-key`, { method: 'POST' });
      const body = (await res.json()) as Record<string, unknown> & { message?: string };
      if (!res.ok) {
        setError(body.message ?? 'The key could not be exported.');
        setStage('error');
        return;
      }
      setPayload(body);
      setStage('done');
    } catch {
      setError('The key could not be exported.');
      setStage('error');
    }
  }

  function download(): void {
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${domain}.arp-handoff.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (stage === 'done' && payload) {
    return (
      <div className="col-span-12 border-t border-rule pt-4 mt-2">
        <p className="text-body-sm text-ink-2 mb-3">
          This is the only time the key is shown. Download it now and keep it private. The name stays
          yours; the cloud no longer holds a copy.
        </p>
        <div className="flex gap-3 mb-3">
          <Button type="button" variant="primary" size="sm" onClick={download}>
            Download {domain}.arp-handoff.json
          </Button>
        </div>
        <Pre className="max-h-48 overflow-auto text-[11px]">{JSON.stringify(payload, null, 2)}</Pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {stage === 'confirm' ? (
        <div className="flex gap-2">
          <Button type="button" variant="default" size="sm" onClick={() => setStage('idle')}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => void run()}>
            Yes, export
          </Button>
        </div>
      ) : (
        <Button type="button" variant="default" size="sm" onClick={() => setStage('confirm')} disabled={stage === 'working'}>
          {stage === 'working' ? 'Exporting…' : 'Export key'}
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
