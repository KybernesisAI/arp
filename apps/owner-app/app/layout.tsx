import type { ReactNode } from 'react';
import '../styles/globals.css';

export const metadata = {
  title: 'ARP Owner',
  description: 'Manage your agent relationships.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-5xl px-4 py-8 font-mono">
          {children}
        </main>
      </body>
    </html>
  );
}
