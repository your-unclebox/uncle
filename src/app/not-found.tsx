// 404 umum (path tidak dikenal, subdomain cadangan). Landing page punya
// versinya sendiri ("Event tidak ditemukan") di sites/[slug]/not-found.tsx.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm font-semibold text-subtle">Uncle</p>
      <h1 className="text-xl font-semibold text-ink">Halaman tidak ditemukan</h1>
      <p className="text-subtle">Periksa kembali alamat yang kamu buka.</p>
    </main>
  );
}
