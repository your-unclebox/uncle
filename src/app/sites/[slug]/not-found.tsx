// LP-16 / AC-LP-01.2–01.3: slug tidak ada atau Draft → "Event tidak ditemukan".
export default function EventNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
      <p className="text-sm font-semibold text-subtle">Uncle</p>
      <h1 className="text-xl font-semibold text-ink">Event tidak ditemukan</h1>
      <p className="text-subtle">Periksa kembali alamat yang kamu buka.</p>
    </main>
  );
}
