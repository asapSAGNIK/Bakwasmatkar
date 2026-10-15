import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Argument Translator — English ↔ Bengali",
  description: "Heated live voice argument with streaming translation. Each speaks their own language.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
