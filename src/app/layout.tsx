import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CommOS — communications control plane",
  description:
    "Self-hosted communications control plane: iMessage, SMS, voice, and email through connectors and a policy engine. Not a finished customer product.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0e1a] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
