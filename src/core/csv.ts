// Minimal RFC-4180 CSV builder for the transaction export.

function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}
