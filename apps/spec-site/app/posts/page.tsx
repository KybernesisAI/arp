import Link from 'next/link';
import type { Metadata } from 'next';
import type * as React from 'react';

export const metadata: Metadata = {
  title: 'Posts',
  description:
    'Long-form writing from the ARP team. Drafts; not yet indexed or promoted.',
  robots: { index: false, follow: false },
};

type Post = {
  slug: string;
  title: string;
  kicker: string;
  summary: string;
  status: 'draft' | 'published';
  date: string;
};

const POSTS: Post[] = [
  {
    slug: 'hello-world',
    title: 'Introducing ARP',
    kicker: '// LAUNCH · v0.1',
    summary:
      'A protocol for how autonomous agents talk, delegate, and get revoked. Open source. MIT licensed. Ready for public review.',
    status: 'draft',
    date: '2026-MM-DD',
  },
];

export default function PostsIndex(): React.JSX.Element {
  return (
    <section className="border-t border-rule">
      <div className="mx-auto grid w-full max-w-page grid-cols-12 gap-4 px-8 py-24">
        <div className="col-span-12 flex items-center gap-3">
          <span className="inline-block h-2 w-2 animate-pulse bg-signal-yellow" />
          <span className="font-mono text-kicker uppercase tracking-[0.14em] text-muted">
            POSTS · DRAFT — FOR PUBLICATION REVIEW
          </span>
        </div>

        <h1 className="col-span-12 mt-8 font-display text-display-lg leading-[1.02] tracking-[-0.02em] text-ink md:col-span-10">
          Notes from the protocol.
        </h1>

        <p className="col-span-12 mt-6 max-w-2xl font-sans text-body-lg text-ink-2 md:col-span-8">
          Long-form writing on where ARP is going and why. Drafts live here
          before they&apos;re promoted + indexed.
        </p>

        <ul className="col-span-12 mt-16 list-none border-t border-rule p-0">
          {POSTS.map((post) => (
            <li
              key={post.slug}
              className="grid grid-cols-12 items-baseline gap-4 border-b border-rule py-6"
            >
              <div className="col-span-12 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-3">
                {post.kicker} · {post.status.toUpperCase()}
              </div>
              <div className="col-span-12 md:col-span-7">
                <Link
                  href={`/posts/${post.slug}`}
                  className="block font-display text-h3 text-ink hover:opacity-70"
                >
                  {post.title}
                </Link>
                <p className="mt-2 font-sans text-body-sm text-ink-2">
                  {post.summary}
                </p>
              </div>
              <div className="col-span-12 font-mono text-kicker uppercase tracking-[0.14em] text-muted md:col-span-2 md:text-right">
                {post.date}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
