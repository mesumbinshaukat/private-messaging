import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Private Messaging - Secure Communication',
  description: 'End-to-end encrypted messaging application with superadmin dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="admin-dark">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
