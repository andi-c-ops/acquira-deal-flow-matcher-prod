import "./globals.css";

import type { ReactNode } from "react";

export const metadata = {
  title: "Deal Flow Matcher",
  description: "Internal operator surfaces for Acquira Deal Flow Matcher",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
