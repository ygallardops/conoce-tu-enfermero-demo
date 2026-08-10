import type { Metadata } from "next";
import "./globals.css";

const shareMetadata: Metadata = {
  metadataBase: new URL("https://enfermeros-demo.yersongallardo.com"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: "/",
    siteName: "Conoce a tu Enfermera(o) — Demo",
    title: "Conoce a tu Enfermera(o)",
    description: "Consulta demostrativa de colegiatura y habilidad con datos sintéticos.",
    images: [{ url: "/og.png", width: 1730, height: 910, alt: "Conoce a tu Enfermera(o): demo con datos sintéticos." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Conoce a tu Enfermera(o)",
    description: "Consulta demostrativa de colegiatura y habilidad con datos sintéticos.",
    images: ["/og.png"],
  },
};

export const metadata: Metadata = {
  ...shareMetadata,
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
