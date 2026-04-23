import type * as React from 'react';
import { redirect } from 'next/navigation';

/**
 * Signup entry point on the cloud marketing surface. The actual onboarding
 * flow lives at `/onboarding` on the app surface — redirect through so the
 * signup CTA lands users in the real flow.
 */
export default function SignupPage(): never {
  redirect('/onboarding');
}
