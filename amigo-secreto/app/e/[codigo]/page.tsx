export default async function Edicion({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return (
    <main style={{ color: "#F2ECDD", fontFamily: "system-ui", padding: 30 }}>
      <p>Edición <b>{codigo}</b> — acá va el flujo del participante.</p>
    </main>
  );
}
