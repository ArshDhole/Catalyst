import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Catalyst — Migrate entire codebases, not files',
  description: 'AI-powered code migration across 41 paths and 15 ecosystems. Upload a repo, get back modern, tested code.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
