import type { Metadata, Viewport } from "next";
import { GlobalCanvas } from "@/r3f/GlobalCanvas";
import { Providers } from "./providers";
import "./globals.css";

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
    <html lang="ru">
      <body>
        <Providers>
          <GlobalCanvas />
          {children}
        </Providers>
      </body>
    </html>
  );
}
