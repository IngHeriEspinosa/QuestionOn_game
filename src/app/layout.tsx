import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = {
  title: "QuestionON | Trivia familiar estilo Kahoot",
  description: "Crea partidas en vivo con preguntas de respuesta simple o compuesta.",
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
