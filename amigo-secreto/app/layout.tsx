import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Amigo secreto",
  description: "Sorteo de amigo secreto",
  themeColor: "#0B2620",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <div className="halo a" />
        <div className="halo b" />
        <div className="halo c" />
        <div className="hilo" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i * 0.21).toFixed(2)}s` }} />
          ))}
        </div>
        {children}
      </body>
    </html>
  );
}