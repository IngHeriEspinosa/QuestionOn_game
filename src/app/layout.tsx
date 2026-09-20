import type { Metadata, Viewport } from "next";
import { appUrlForMetadata } from "@/lib/appUrl";
import "./globals.css";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  // metadataBase hace que las URL relativas de openGraph y canonical se
  // resuelvan bien. Sin ella, Next avisa y las imagenes sociales no cargan.
  metadataBase: new URL(appUrlForMetadata()),
  title: {
    default: "QuestionON · Cuestionarios en vivo para el aula",
    template: "%s · QuestionON",
  },
  description:
    "Crea cuestionarios y juégalos en directo con tu clase. El alumnado entra con un código, sin crear cuenta ni dar datos personales.",
  applicationName: "QuestionON",
  authors: [{ name: "QuestionON" }],
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // themeColor va en `viewport`, no en `metadata`: en metadata esta deprecado
  // desde Next 14.
  themeColor: "#0b1228",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)] font-sans">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
