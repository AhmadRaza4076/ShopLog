import type { Metadata } from 'next';
import { NavTabs } from '@/components/NavTabs';
import { VoiceControl } from '@/components/VoiceControl';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopLog — the digital ledger that listens',
  description: 'AI bookkeeper for small shops: type it, say it, or photograph it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <p className="brand">ShopLog</p>
            <NavTabs />
          </aside>
          <main className="main-area">{children}</main>
        </div>
        <VoiceControl />
      </body>
    </html>
  );
}
