export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">ParaOU</h1>
      <p className="mt-2 text-gray-600">
        Inteligencia de contrataciones públicas de Paraguay. La interfaz pública se construye en la
        Fase 3 (ver <code>plan/PHASE-3-frontend.md</code>).
      </p>
      <p className="mt-4 text-sm text-gray-500">
        Estado de ingesta:{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}
