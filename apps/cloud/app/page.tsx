import { redirect } from 'next/navigation';

/**
 * app.arp.run root — the authenticated surface has no marketing landing.
 * Send visitors straight to the dashboard; dashboard redirects to
 * `/onboarding` for users without a tenant.
 *
 * Requests to the marketing hostnames (`arp.run`, `cloud.arp.run`) never
 * hit this component — the middleware rewrites them to `/project` /
 * `/cloud` first.
 */
export default function RootPage(): never {
  redirect('/dashboard');
}
