import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import AppProviders from "./AppProviders";
import Nav from "@/components/ui/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hackmarket — AI Tool Marketplace",
  description: "Every hackathon builds tools that die on GitHub. Hackmarket brings them back to life.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <AppProviders>
            <Nav />
            <div style={{ paddingTop: 56 }}>
              {children}
            </div>
          </AppProviders>
        </body>
      </html>
    </ClerkProvider>
  );
}
