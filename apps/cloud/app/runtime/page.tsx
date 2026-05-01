import type * as React from 'react';
import { Container, Dot, Emphasis, Underline } from '@/components/ui';
import './runtime.css';

type Layer = {
  num: string;
  name: string;
  spec: string;
  detail: string;
  critical?: boolean;
};

const LAYERS: Layer[] = [
  {
    num: 'L1',
    name: 'IDENTITY',
    spec: 'DID · SIG',
    detail: 'Resolve sender DID. Verify envelope signature.',
  },
  {
    num: 'L2',
    name: 'TRANSPORT',
    spec: 'DIDCOMM V2',
    detail: 'Decrypt the envelope. Persist to mailbox.',
  },
  {
    num: 'L3',
    name: 'PAIRING',
    spec: 'EDGE · LIVE?',
    detail: 'Load connection token. Check status & expiry.',
  },
  {
    num: 'L4',
    name: 'POLICY',
    spec: 'POLICY ENGINE',
    detail: 'permit · forbid · obligations. Deny-by-default.',
    critical: true,
  },
  {
    num: 'L5',
    name: 'CONTEXT',
    spec: 'ISOLATION',
    detail: 'Per-conn memory + tools. Nothing leaks across edges.',
  },
  {
    num: 'L6',
    name: 'AUDIT',
    spec: 'JCS HASH-CHAIN',
    detail: 'Decision + obligations appended. Tamper-evident.',
  },
  {
    num: 'L7',
    name: 'REPLY',
    spec: 'EGRESS FILTERS',
    detail: 'Obligations applied. Response signed and sent.',
  },
];

export default function ExplainerPage(): React.JSX.Element {
  return (
    <main className="h-screen overflow-hidden bg-paper text-ink flex flex-col">
      <PlateRow />

      {/* MAIN: pipeline + inputs + live trace, distributed in remaining space */}
      <section className="flex-1 min-h-0 flex">
        <Container className="w-full self-stretch flex flex-col justify-evenly py-5">
          <Pipeline />
          <PdpInputs />
          <LiveTrace />
        </Container>
      </section>

      <OutcomeStrip />
    </main>
  );
}

/* ─── TOP BAR ───────────────────────────────────────────────────────── */

function TopBar(): React.JSX.Element {
  return (
    <header className="shrink-0 border-b border-rule">
      <Container className="flex items-center justify-between py-2.5">
        <div className="font-mono text-kicker uppercase tracking-[0.14em] flex items-center gap-3">
          <span className="text-ink font-medium">ARP</span>
          <span className="text-muted">//</span>
          <span className="text-muted">EXPLAINER</span>
          <span className="text-muted">·</span>
          <span className="text-muted">RUNTIME &amp; POLICY</span>
        </div>
        <div className="font-mono text-kicker uppercase tracking-[0.14em] flex items-center gap-2">
          <Dot tone="red" pulse size={6} />
          <span className="text-ink">LIVE · ARP.RUN</span>
        </div>
      </Container>
    </header>
  );
}

/* ─── PLATE HEAD ────────────────────────────────────────────────────── */

function PlateRow(): React.JSX.Element {
  return (
    <section className="shrink-0 border-b border-rule">
      <Container className="py-3">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-1 font-mono text-kicker uppercase text-ink font-medium">
            P.01
          </div>
          <div className="col-span-3 font-mono text-kicker uppercase text-muted">
            HOW ARP WORKS
          </div>
          <h1 className="col-span-8 font-display font-medium text-[clamp(20px,2.0vw,28px)] leading-[1.1] tracking-[-0.02em] m-0">
            Between two agents, every request crosses{' '}
            <Emphasis tone="blue">seven layers</Emphasis>
            <br />
            gated by a <Underline>signed policy</Underline> you control.
          </h1>
        </div>
      </Container>
    </section>
  );
}

/* ─── PIPELINE: track strip + 9-col row (sender + 7 layers + receiver) ─ */

function Pipeline(): React.JSX.Element {
  return (
    <div className="flex flex-col">
      {/* Runtime label band — thin red span arrows flanking centred text,
          aligned to the 7 middle cells (L1–L7). */}
      <div className="shrink-0 grid arp-cells-row gap-0 mb-1.5">
        <div />
        <div className="col-span-7 flex items-center gap-3 px-1">
          <span className="flex-1 flex items-center">
            <span className="block w-px h-2 bg-signal-red" aria-hidden="true" />
            <span className="flex-1 h-px bg-signal-red" />
          </span>
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-ink whitespace-nowrap">
            THE ARP RUNTIME
          </span>
          <span className="flex-1 flex items-center">
            <span className="flex-1 h-px bg-signal-red" />
            <span className="block w-px h-2 bg-signal-red" aria-hidden="true" />
          </span>
        </div>
        <div />
      </div>

      {/* Top track — REQUEST direction (sender → receiver). */}
      <div className="shrink-0 arp-track-strip arp-track-strip--top">
        <div className="arp-track-caption">
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            ▸ REQUEST · ENVELOPE
          </span>
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            7-LAYER GATE ▸
          </span>
        </div>
        <div className="arp-track-line" aria-hidden="true" />
        <div className="arp-track-ticks arp-track-ticks--down" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="arp-tick-cell">
              <span className="arp-tick" />
            </div>
          ))}
        </div>
        <span className="arp-packet arp-packet--allow" aria-hidden="true" />
        <span className="arp-packet arp-packet--deny" aria-hidden="true" />
      </div>

      {/* Cells row */}
      <div className="grid arp-cells-row gap-px bg-rule border border-rule">
        <Endpoint
          align="left"
          tone="blue"
          line1="GHOST"
          line2=".AGENT"
          method="did:web"
          caption="Signs the envelope. Sends through DIDComm."
        />
        {LAYERS.map((l) => (
          <LayerCell key={l.num} layer={l} />
        ))}
        <Endpoint
          align="right"
          tone="red"
          line1="SAMANTHA"
          line2=".AGENT"
          method="did:web"
          caption="Verifies. Replies — or never sees it."
        />
      </div>

      {/* Bottom track — RESPONSE direction (receiver → sender). */}
      <div className="shrink-0 arp-track-strip arp-track-strip--bottom">
        <div className="arp-track-ticks arp-track-ticks--up" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="arp-tick-cell">
              <span className="arp-tick" />
            </div>
          ))}
        </div>
        <div className="arp-track-line" aria-hidden="true" />
        <span className="arp-packet arp-packet--response" aria-hidden="true" />
        <div className="arp-track-caption arp-track-caption--bottom">
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            ◂ RESPONSE · SIGNED &amp; SENT
          </span>
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            ◂ AFTER PERMIT
          </span>
        </div>
      </div>
    </div>
  );
}

function Endpoint({
  align,
  tone,
  line1,
  line2,
  method,
  caption,
}: {
  align: 'left' | 'right';
  tone: 'blue' | 'red';
  line1: string;
  line2: string;
  method: string;
  caption: string;
}): React.JSX.Element {
  const bg = tone === 'blue' ? 'bg-signal-blue' : 'bg-signal-red';
  const isRight = align === 'right';
  return (
    <div
      className={`${bg} text-white p-3 flex flex-col gap-1.5 ${
        isRight ? 'items-end text-right' : ''
      }`}
    >
      <div className="font-mono text-kicker uppercase tracking-[0.14em] text-white/85">
        {isRight ? 'RECIPIENT //' : '// SENDER'}
      </div>
      <div>
        <div className="font-display font-medium text-[clamp(13px,1.2vw,18px)] leading-[1.0] tracking-[-0.015em]">
          {line1}
        </div>
        <div className="font-display font-medium text-[clamp(13px,1.2vw,18px)] leading-[1.0] tracking-[-0.015em]">
          {line2}
        </div>
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/65">
        {method}
      </div>
      <p className="text-[11px] leading-[1.4] m-0 text-white/85 mt-auto">{caption}</p>
    </div>
  );
}

function LayerCell({ layer }: { layer: Layer }): React.JSX.Element {
  const { num, name, spec, detail, critical } = layer;
  const bgCls = critical ? 'bg-ink text-paper' : 'bg-paper text-ink';
  const numCls = critical ? 'text-signal-yellow font-medium' : 'text-ink font-medium';
  const specCls = critical ? 'text-paper/65' : 'text-muted';
  const detailCls = critical ? 'text-paper/90' : 'text-ink-2';
  const nameCls = critical ? 'text-paper' : 'text-ink';

  return (
    <div className={`${bgCls} p-3 flex flex-col gap-1.5 min-h-0`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-kicker uppercase tracking-[0.14em] ${numCls}`}>
          {num}
        </span>
        {critical ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal-yellow flex items-center gap-1">
            <span className="arp-pulse-dot" />
            GATE
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={`block w-1.5 h-1.5 ${critical ? 'bg-signal-yellow' : 'bg-ink/30'}`}
          />
        )}
      </div>
      <div
        className={`font-display font-medium text-[clamp(13px,1.2vw,18px)] leading-[1.0] tracking-[-0.015em] ${nameCls}`}
      >
        {name}
      </div>
      <div className={`font-mono text-[10px] uppercase tracking-[0.14em] ${specCls}`}>
        {spec}
      </div>
      <p className={`text-[11px] leading-[1.4] m-0 ${detailCls}`}>{detail}</p>
    </div>
  );
}

/* ─── PDP INPUTS ────────────────────────────────────────────────────── */

function PdpInputs(): React.JSX.Element {
  const inputs: Array<{
    kicker: string;
    title: string;
    body: string;
    accent: 'blue' | 'yellow' | 'red' | 'paper';
  }> = [
    {
      kicker: 'INPUT 01',
      title: 'Policy',
      body: 'Permit / forbid rules — compiled from the scope catalog at pairing time.',
      accent: 'blue',
    },
    {
      kicker: 'INPUT 02',
      title: 'Context',
      body: 'Live signals — time-of-day, freshness, request count, recent activity.',
      accent: 'paper',
    },
    {
      kicker: 'INPUT 03',
      title: 'Identity',
      body: 'Sender DID, owner DID, attribute VCs, principal binding.',
      accent: 'yellow',
    },
    {
      kicker: 'INPUT 04',
      title: 'Catalog',
      body: '50 reusable scope templates · each compiles to rules + obligations.',
      accent: 'red',
    },
  ];

  return (
    <div className="shrink-0 grid arp-cells-row gap-px">
      <div className="flex flex-col items-start justify-center pr-3">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted leading-[1.4]">
          ▸ FEEDS
          <br />
          THE GATE
        </span>
      </div>
      <div className="col-span-7 grid grid-cols-4 gap-px bg-rule border border-rule">
        {inputs.map((i) => (
          <InputCell key={i.kicker} {...i} />
        ))}
      </div>
      <div className="flex flex-col items-end justify-center pl-3 text-right">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted leading-[1.4]">
          ALL FOUR ·
          <br />
          EVERY REQUEST
        </span>
      </div>
    </div>
  );
}

function InputCell({
  kicker,
  title,
  body,
  accent,
}: {
  kicker: string;
  title: string;
  body: string;
  accent: 'blue' | 'yellow' | 'red' | 'paper';
}): React.JSX.Element {
  const tones: Record<typeof accent, string> = {
    blue: 'bg-signal-blue text-white',
    yellow: 'bg-signal-yellow text-ink',
    red: 'bg-signal-red text-white',
    paper: 'bg-paper text-ink',
  };
  return (
    <div className={`${tones[accent]} px-3.5 py-3 flex flex-col gap-1`}>
      <div
        className={`font-mono text-kicker uppercase tracking-[0.14em] ${
          accent === 'paper' ? 'text-muted' : 'opacity-80'
        }`}
      >
        {kicker}
      </div>
      <div className="font-display font-medium text-[17px] leading-[1.0] tracking-[-0.015em]">
        {title}
      </div>
      <p
        className={`text-[11.5px] leading-[1.4] m-0 ${
          accent === 'paper' ? 'text-ink-2' : 'opacity-90'
        }`}
      >
        {body}
      </p>
    </div>
  );
}

/* ─── LIVE TRACE ────────────────────────────────────────────────────── */

function LiveTrace(): React.JSX.Element {
  return (
    <div className="shrink-0 grid arp-cells-row gap-px">
      <div className="flex items-center justify-end pr-3">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted leading-[1.4] text-right">
          ▸ ANATOMY
          <br />
          OF A DECISION
        </span>
      </div>
      <div className="col-span-7 grid grid-cols-2 gap-px bg-rule border border-ink">
        <TraceColumn
          tone="allow"
          header="TRACE 01 · ALLOW"
          lines={[
            { stage: 'L1 IDENTITY', status: 'ok', body: 'did:web:ghost.agent · sig verified' },
            { stage: 'L2 TRANSPORT', status: 'ok', body: 'envelope decrypted · mailbox seq=4821' },
            { stage: 'L3 PAIRING', status: 'ok', body: 'edge_alpha · live · expires 90d' },
            { stage: 'L4 POLICY', status: 'permit', body: 'rule_27 fired · obligations[redact:client.name]' },
            { stage: 'L5 CONTEXT', status: 'ok', body: 'memory partition: edge_alpha · 14 facts' },
            { stage: 'L6 AUDIT', status: 'ok', body: 'seq=1247 · chain head 9c7e…' },
            { stage: 'L7 REPLY', status: 'ok', body: 'response signed · sent to samantha.agent' },
          ]}
        />
        <TraceColumn
          tone="deny"
          header="TRACE 02 · DENY"
          lines={[
            { stage: 'L1 IDENTITY', status: 'ok', body: 'did:web:stranger.agent · sig verified' },
            { stage: 'L2 TRANSPORT', status: 'ok', body: 'envelope decrypted · mailbox seq=4822' },
            { stage: 'L3 PAIRING', status: 'ok', body: 'edge_beta · live · scope=read.invoice' },
            { stage: 'L4 POLICY', status: 'forbid', body: 'rule_09 fired · resource tagged confidential' },
            { stage: 'L5 CONTEXT', status: '—', body: 'skipped · denied before handler' },
            { stage: 'L6 AUDIT', status: 'ok', body: 'seq=1248 · reason=resource_classification' },
            { stage: 'L7 REPLY', status: 'ok', body: 'forbid response · no resource leaked' },
          ]}
        />
      </div>
      <div className="flex items-center justify-start pl-3">
        <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted leading-[1.4]">
          BOTH WRITTEN
          <br />
          TO AUDIT LOG
        </span>
      </div>
    </div>
  );
}

function TraceColumn({
  tone,
  header,
  lines,
}: {
  tone: 'allow' | 'deny';
  header: string;
  lines: Array<{ stage: string; status: string; body: string }>;
}): React.JSX.Element {
  const accentBg = tone === 'allow' ? 'bg-signal-green' : 'bg-signal-red';
  return (
    <div className="bg-ink text-paper">
      <div
        className={`${accentBg} text-white px-3 py-1.5 font-mono text-kicker uppercase tracking-[0.14em] flex items-center justify-between`}
      >
        <span>{header}</span>
        <span className="opacity-80">→</span>
      </div>
      <div className="px-3 py-2 font-mono text-[10.5px] leading-[1.55]">
        {lines.map((l) => {
          const statusCls =
            l.status === 'permit'
              ? 'text-signal-green'
              : l.status === 'forbid'
                ? 'text-signal-red'
                : l.status === 'ok'
                  ? 'text-signal-yellow'
                  : 'text-paper/40';
          return (
            <div
              key={l.stage}
              className="grid grid-cols-[100px_60px_1fr] gap-2 items-baseline"
            >
              <span className="text-paper/55">{l.stage}</span>
              <span className={`${statusCls} font-medium`}>
                {l.status === 'ok'
                  ? '✓ ok'
                  : l.status === 'permit'
                    ? '✓ permit'
                    : l.status === 'forbid'
                      ? '× forbid'
                      : l.status}
              </span>
              <span className="text-paper/85 truncate">{l.body}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── OUTCOME STRIP ─────────────────────────────────────────────────── */

function OutcomeStrip(): React.JSX.Element {
  return (
    <section className="shrink-0 grid grid-cols-3 border-t border-rule">
      <OutcomeBlock
        tone="green"
        tag="✓ PERMIT"
        label="Allow"
        desc="Obligations applied. Audit written. Reply emitted via DIDComm."
      />
      <OutcomeBlock
        tone="red"
        tag="× FORBID"
        label="Deny"
        desc="Reason returned to sender. Audit written. Zero side-effects."
      />
      <OutcomeBlock
        tone="yellow"
        tag="◊ CONSENT"
        label="Approve"
        desc="Owner countersigns. Token mutually bound. Edge becomes active."
      />
    </section>
  );
}

function OutcomeBlock({
  tone,
  tag,
  label,
  desc,
}: {
  tone: 'green' | 'red' | 'yellow';
  tag: string;
  label: string;
  desc: string;
}): React.JSX.Element {
  const tones: Record<typeof tone, string> = {
    green: 'bg-signal-green text-white border-r border-rule',
    red: 'bg-signal-red text-white border-r border-rule',
    yellow: 'bg-signal-yellow text-ink',
  };
  return (
    <div
      className={`${tones[tone]} px-7 py-4 flex flex-col gap-1 justify-center min-h-[100px]`}
    >
      <div className="font-mono text-kicker uppercase tracking-[0.14em] opacity-85">
        {tag}
      </div>
      <div className="font-display font-medium text-[clamp(24px,2.6vw,36px)] leading-[0.95] tracking-[-0.02em]">
        {label}
      </div>
      <p className="text-[12.5px] leading-[1.4] m-0 max-w-[42ch] opacity-90">{desc}</p>
    </div>
  );
}
