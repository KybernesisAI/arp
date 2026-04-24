import type * as React from 'react';

export default function PostsLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="border-t border-rule">
      <div className="mx-auto w-full max-w-page px-8 py-16">
        <article className="arp-prose mx-auto max-w-3xl">{children}</article>
      </div>
    </div>
  );
}
