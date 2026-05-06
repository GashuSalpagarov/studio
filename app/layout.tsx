import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GlobalCanvas } from "@/r3f/GlobalCanvas";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Studio",
  description: "Развитие на стыке инженерии и продукта",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={inter.variable}>
      <body>
        <Providers>
          <GlobalCanvas />
          {children}
        </Providers>
      </body>
    </html>
  );
}
