import type { ReactNode } from 'react';
import '../styles/globals.css';

export const metadata = {
  title: 'ARP Owner',
  description: 'Manage your agent relationships.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
