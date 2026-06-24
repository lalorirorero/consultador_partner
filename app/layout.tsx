import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buscador de RUTs | GeoVictoria",
  description:
    "Consulta si una empresa está disponible o en negociación con GeoVictoria por RUT o nombre.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
