import './globals.css';
import { NextUIProvider } from '@nextui-org/react';
import SidebarWrapper from '../components/SidebarWrapper';

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
          <SidebarWrapper>
            {children}
          </SidebarWrapper>
        </NextUIProvider>
      </body>
    </html>
  );
}


