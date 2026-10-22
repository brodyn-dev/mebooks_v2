/** Bersihkan input: buang sempang/ruang, huruf besar. */
export function cleanIsbn(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(s[i]);
  sum += s[9] === 'X' ? 10 : Number(s[9]);
  return sum % 11 === 0;
}

function isValidIsbn13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(s[12]);
}

export function isValidIsbn(input: string): boolean {
  const s = cleanIsbn(input);
  return isValidIsbn10(s) || isValidIsbn13(s);
}

/** Tukar ISBN-10 kepada ISBN-13 (dan kira semak digit). Pulang null jika tak sah. */
export function toIsbn13(input: string): string | null {
  const s = cleanIsbn(input);
  if (isValidIsbn13(s)) return s;
  if (!isValidIsbn10(s)) return null;
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}
