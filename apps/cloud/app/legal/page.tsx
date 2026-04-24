// LEGAL-REVIEW-PENDING — index page for the /legal tree. Draft.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function LegalIndex(): never {
  redirect('/legal/terms');
}
