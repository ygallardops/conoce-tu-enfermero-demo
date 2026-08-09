import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conoce a tu Enfermero — Demo",
  description:
    "Prototipo público para consultar colegiatura y habilidad con datos sintéticos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}
