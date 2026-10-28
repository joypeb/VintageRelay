// Must stay first: globals.css holds the `@layer` order statement, which has to precede any
// Astryx component CSS pulled in by later imports (docs/rules/dev/frontend/styling.md §1).
import '@/styles/globals.css';

import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Vintage Relay',
  description: 'A clothing exchange corner for local events',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="bg-body">
      <body className="mx-auto min-h-dvh max-w-md">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
