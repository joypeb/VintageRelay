import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Vintage Relay',
  description: '행사 현장 의류 교환 코너',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="bg-body">
      <body className="mx-auto min-h-dvh max-w-md">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
