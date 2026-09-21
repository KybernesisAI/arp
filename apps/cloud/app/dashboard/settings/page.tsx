import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Account settings moved to /account (AgentID S6d). */
export default function SettingsRedirect(): never {
  redirect('/account');
}
