import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { t } from "@/i18n";

export const metadata: Metadata = {
  title: t("brand"),
  description: t("home.sub"),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
