import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uncle",
  description: "Platform ticketing event white-label",
};

// Font (Inter self-hosted, UI-UX Design System §3) dipasang di fase UI.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
