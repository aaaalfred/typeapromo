export const runtime = 'nodejs'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Typeapromo</h1>
      <p className="text-base opacity-80">
        Formularios conversacionales para equipos. Base del proyecto lista; el panel y el editor
        llegan en fases posteriores.
      </p>
      <p className="text-sm opacity-60">
        Estado del servicio:{' '}
        <a className="underline underline-offset-4" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  )
}
