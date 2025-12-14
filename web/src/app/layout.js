import './globals.css';
import { NextUIProvider } from '@nextui-org/react';
import SidebarWrapper from '../components/SidebarWrapper';

export const metadata = {
  title: 'Calorie Assistant',
  description: 'Simple calorie and protein tracker',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Calorie Assistant',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/AppIcon@3x.png', sizes: '180x180', type: 'image/png' },
      { url: '/AppIcon@2x.png', sizes: '120x120', type: 'image/png' },
      { url: '/AppIcon@2x~ipad.png', sizes: '152x152', type: 'image/png' },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#236a4d',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/AppIcon@3x.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/AppIcon@3x.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/AppIcon@2x~ipad.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/AppIcon@2x.png" />
      </head>
      <body>
        <NextUIProvider>
          <SidebarWrapper>
            {children}
          </SidebarWrapper>
        </NextUIProvider>
      </body>
    </html>
  );
}


