import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';
import type * as React from 'react';

/**
 * Next.js App Router hook — returns the component map used to render MDX
 * in every `/spec/*` and `/docs/*` route. We route internal links through
 * `next/link` so prefetch works; external links open in a new tab with
 * `rel="noreferrer"`.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    a: ({ href = '', children, ...props }) => {
      const external = /^https?:\/\//.test(href);
      if (external) {
        return (
          <a href={href} target="_blank" rel="noreferrer" {...props}>
            {children}
          </a>
        );
      }
      const { className, title } = props as {
        className?: string;
        title?: string;
      };
      return (
        <Link href={href} className={className} title={title}>
          {children}
        </Link>
      );
    },
  };
}
