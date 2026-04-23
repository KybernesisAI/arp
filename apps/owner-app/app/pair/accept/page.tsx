import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { getSession } from '@/lib/session';
import { getScopeCatalog } from '@/lib/catalog';
import { env } from '@/lib/env';
import { parseInvitationUrl, type PairingProposal } from '@kybernesis/arp-pairing';
import { renderProposalConsent } from '@kybernesis/arp-consent-ui';
import { AcceptForm } from './AcceptForm';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  if (!(await getSession())) redirect('/login');
  const params = await searchParams;
  const e = env();

  if (!params.invitation) {
    return (
      <div>
        <Header />
        <h2 className="text-lg font-semibold">Accept invitation</h2>
        <p className="mt-2 text-sm text-arp-muted">
          Open this page via a full invitation URL or the QR scanner.
        </p>
      </div>
    );
  }

  let proposal: PairingProposal;
  try {
    proposal = parseInvitationUrl(params.invitation);
  } catch (err) {
    return (
      <div>
        <Header />
        <h2 className="text-lg font-semibold">Invalid invitation</h2>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-arp-danger">
          {(err as Error).message}
        </pre>
      </div>
    );
  }

  const catalog = getScopeCatalog();
  const view = renderProposalConsent(proposal, catalog);

  return (
    <div>
      <Header />
      <h2 className="mb-4 text-lg font-semibold">Review connection</h2>
      <ConsentPanel view={view} />
      <AcceptForm
        proposal={proposal}
        audiencePrincipalDid={e.ARP_PRINCIPAL_DID}
      />
    </div>
  );
}

function ConsentPanel({
  view,
}: {
  view: ReturnType<typeof renderProposalConsent>;
}) {
  return (
    <section className="card mb-4 space-y-3 text-sm">
      <h3 className="font-semibold">{view.headline}</h3>
      <div>
        <div className="label">Risk</div>
        <div data-testid="consent-risk">{view.risk}</div>
      </div>
      <div>
        <div className="label">Will be able to</div>
        <ul className="list-disc pl-4">
          {view.willBeAbleTo.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      {view.willNotBeAbleTo.length > 0 && (
        <div>
          <div className="label">Will not be able to</div>
          <ul className="list-disc pl-4">
            {view.willNotBeAbleTo.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {view.conditions.length > 0 && (
        <div>
          <div className="label">Conditions</div>
          <ul className="list-disc pl-4">
            {view.conditions.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {view.willProve.length > 0 && (
        <div>
          <div className="label">Must prove</div>
          <ul className="list-disc pl-4">
            {view.willProve.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-xs text-arp-muted">
        Expires {view.expiresAt}
      </div>
    </section>
  );
}
