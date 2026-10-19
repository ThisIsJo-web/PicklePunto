import type { Metadata, Viewport } from 'next';
import './globals.css';
import SfxProvider from '@/components/sfx/SfxProvider';

export const metadata: Metadata = {
  title: { default: 'PicklePunto', template: '%s | PicklePunto' },
  description: 'Book pickleball courts, join the fun, and run your facility — PicklePunto.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PicklePunto',
  },
  applicationName: 'PicklePunto',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SfxProvider />
      </body>
    </html>
  );
}
