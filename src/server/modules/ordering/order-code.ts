import { randomInt } from "node:crypto";

// DRD §Database 3.4: `UNC-` + karakter Crockford Base32 acak (mis. UNC-7K3P9Q).
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

export function generateOrderCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CROCKFORD_BASE32[randomInt(32)];
  return `UNC-${code}`;
}
