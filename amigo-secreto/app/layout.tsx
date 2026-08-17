export const metadata = { title: "Amigo secreto" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0, background: "#0B2620" }}>{children}</body></html>;
}
