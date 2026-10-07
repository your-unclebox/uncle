// BR-TRX-04: total dihitung di server dari harga jenis tiket; Rupiah utuh (bigint).
export interface PricedLine {
  readonly unitPrice: bigint;
  readonly quantity: number;
}

export function computeOrderTotal(lines: readonly PricedLine[]): bigint {
  return lines.reduce((total, line) => total + line.unitPrice * BigInt(line.quantity), 0n);
}
