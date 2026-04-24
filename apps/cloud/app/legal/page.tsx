// Index of the /legal tree — redirects to Terms so deep-link shares land
// on the primary document.
import { redirect } from 'next/navigation';

export default function LegalIndex(): never {
  redirect('/legal/terms');
}
