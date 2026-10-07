// BR-TRX-02: no HP Indonesia diawali 08 / 628 / +628, 10–14 digit (bentuk 08…).
// Disimpan dalam E.164 (+628…), DRD §Database 3.4.
const NATIONAL_MOBILE = /^08\d{8,12}$/;

export function normalizeIndonesianPhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  let national: string;
  if (compact.startsWith("+62")) national = `0${compact.slice(3)}`;
  else if (compact.startsWith("62")) national = `0${compact.slice(2)}`;
  else national = compact;
  return NATIONAL_MOBILE.test(national) ? `+62${national.slice(1)}` : null;
}

// Tampilan no HP tersamar di halaman pembeli, mis. +6281234567890 → 0812****7890.
export function maskPhone(e164: string): string {
  const national = e164.startsWith("+62") ? `0${e164.slice(3)}` : e164;
  if (national.length < 8) return national;
  return `${national.slice(0, 4)}****${national.slice(-4)}`;
}

// Tampilan no HP lengkap (Detail Transaksi admin), mis. +6281234567890 → 081234567890.
export function formatPhoneNational(e164: string): string {
  return e164.startsWith("+62") ? `0${e164.slice(3)}` : e164;
}
