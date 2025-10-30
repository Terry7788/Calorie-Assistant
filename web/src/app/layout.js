import './globals.css';
import { NextUIProvider } from '@nextui-org/react';

export const metadata = {
  title: 'Calorie Assistant',
  description: 'Simple calorie and protein tracker',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NextUIProvider>
          {children}
        </NextUIProvider>
      </body>
    </html>
  );
}


