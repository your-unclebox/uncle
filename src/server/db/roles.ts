// Role Postgres untuk akses data tenant; dibuat di migrasi 0000.
// Konstanta (bukan input) karena dipakai sebagai identifier di SET LOCAL ROLE.
export const APP_DB_ROLE = "uncle_app";
