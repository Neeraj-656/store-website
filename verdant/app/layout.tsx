import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: { default: "Verdant Market — Pure Natural Groceries", template: "%s | Verdant Market" },
  description: "Farm-fresh, 100% organic groceries delivered to your door. Verdant Market — where nature meets your kitchen.",
  keywords: ["organic", "natural", "groceries", "farm fresh", "healthy food"],
  openGraph: {
    title: "Verdant Market",
    description: "100% Natural. Farm-fresh groceries.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-body antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
