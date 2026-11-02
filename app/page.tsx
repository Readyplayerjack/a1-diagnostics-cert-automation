import { brand } from "@/config/brand";

export default function HomePage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <div className="w-full rounded-lg border-2 border-racing-green bg-slip px-6 py-10 shadow-sm">
          <h1 className="font-serif text-5xl font-bold tracking-wide text-racing-green">
            {brand.name}
          </h1>
          <p className="mt-4 text-xl text-ink">{brand.tagline}</p>
        </div>
        <p className="text-sm font-medium text-oxblood">{brand.strings.disclaimer}</p>
      </main>
      <footer className="px-6 py-6 text-center text-sm text-muted-ink">
        {brand.strings.footer}
      </footer>
    </>
  );
}
