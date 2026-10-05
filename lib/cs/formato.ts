/**
 * lib/cs/formato.ts — cómo se dicen los montos y las fechas en Éxito del cliente. PURO.
 *
 * Una sola forma para las dos pantallas y el agente: «US$2.455», «14 nov», «en 41 días».
 * Se calcula sobre días UTC (AAAA-MM-DD) para que el servidor y el navegador digan lo mismo.
 */

/** Miles con punto, a mano: `toLocaleString` depende del ICU de cada lado y rompe la hidratación. */
export function miles(n: number): string {
  return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «US$2.455» · «₡1.250.000» · «COP 4.500.000». Sin decimales: es lectura, no contabilidad. */
export function fmtMonto(n: number, moneda: string | null = "USD"): string {
  const entero = miles(n);
  const signo = n < 0 ? "−" : "";
  const m = (moneda ?? "USD").toUpperCase();
  if (m === "USD") return `${signo}US$${entero}`;
  if (m === "CRC") return `${signo}₡${entero}`;
  return `${signo}${m} ${entero}`;
}

/** «+US$300» / «−US$355»: un cambio, con su signo siempre. */
export function fmtCambio(n: number, moneda: string | null = "USD"): string {
  return n > 0 ? `+${fmtMonto(n, moneda)}` : fmtMonto(n, moneda);
}

function ymd(x: string): string {
  return x.slice(0, 10);
}

/** «14 nov» (y el año si no es el de `hoy`). */
export function fmtDia(fecha: string, hoy?: string): string {
  const [a, m, d] = ymd(fecha).split("-").map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  return hoy && Number(ymd(hoy).slice(0, 4)) !== a ? `${base} ${a}` : base;
}

/** Días de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${ymd(hasta)}T00:00:00Z`) - Date.parse(`${ymd(desde)}T00:00:00Z`)) / 86_400_000);
}

/** «hoy» · «ayer» · «hace 6 días». */
export function haceCuanto(fecha: string, hoy: string): string {
  const d = diasEntre(fecha, hoy);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} días`;
}

/** «hoy» · «mañana» · «en 41 días». */
export function enCuanto(fecha: string, hoy: string): string {
  const d = diasEntre(hoy, fecha);
  if (d <= 0) return "hoy";
  if (d === 1) return "mañana";
  return `en ${d} días`;
}

/** «1 cuenta» / «3 cuentas». */
export function plural(n: number, uno: string, varios: string): string {
  return `${n < 0 ? "−" : ""}${miles(n)} ${n === 1 ? uno : varios}`;
}

/** Iniciales para el avatar: «Andrea Solís» → «AS». */
export function iniciales(nombre: string | null): string {
  if (!nombre) return "?";
  const partes = nombre.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}
