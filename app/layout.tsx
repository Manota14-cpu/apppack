import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { Providers } from "./providers";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "AppPack — Control de stock",
  description: "Panel interno de Pack Distribuidora para gestionar el catálogo y el stock.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={montserrat.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}