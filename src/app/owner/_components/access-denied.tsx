import { EmptyState } from "@/components/shared/empty-state";

// AC-OWN-01.3: akun Admin membuka area Owner → akses ditolak, tanpa data.
export function AccessDenied() {
  return (
    <EmptyState
      icon="⛔"
      title="Akses ditolak"
      description="Halaman ini khusus Owner. Masuk dengan akun Owner untuk melanjutkan."
    />
  );
}
