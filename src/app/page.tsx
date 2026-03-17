export default function HomePage() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Squash Reservas</h1>
      <p>NEXT_PUBLIC_SUPABASE_URL:</p>
      <pre>{process.env.NEXT_PUBLIC_SUPABASE_URL || "VACIA"}</pre>
      <p>NEXT_PUBLIC_SUPABASE_ANON_KEY:</p>
      <pre>{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "CARGADA" : "VACIA"}</pre>
    </div>
  );
}