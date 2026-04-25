import Link from 'next/link';

export const dynamic = 'force-static';

export default function NotFound() {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-arp-muted">
        E.404 · NOT FOUND
      </div>
      <h1 className="mb-4 text-2xl font-semibold">
        This page wasn&apos;t found.
      </h1>
      <p className="mb-6 max-w-xl text-sm text-arp-muted">
        The URL you tried to open doesn&apos;t resolve to anything on your ARP
        owner app. If you followed a link, it may be stale — check the source
        and try again.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary no-underline">
          Back to connections
        </Link>
        <Link
          href="https://cloud.arp.run/support"
          className="text-sm no-underline"
        >
          Contact support →
        </Link>
      </div>
    </div>
  );
}
