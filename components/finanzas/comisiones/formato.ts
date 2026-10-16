// Los números de Comisiones, armados a mano: `Intl` escribe distinto en Node y en el navegador (rompía la hidratación).

export const miles = (x: number) => String(Math.round(Math.abs(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const usd = (x: number) => `${x < 0 ? "−" : ""}US$ ${miles(x)}`;
export const usd2 = (x: number) => `${x < 0 ? "−" : ""}US$ ${Math.abs(x).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
export const pct = (x: number) => `${Math.round(x * 100)} %`;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const nombreDelMes = (n: number) => MESES[n - 1];
/** «16 sep», con el año si no es `anio`. */
export const fechaCorta = (iso: string, anio?: number) =>
  `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}${anio && Number(iso.slice(0, 4)) !== anio ? ` ${iso.slice(0, 4)}` : ""}`;

/** Los colores de las píldoras: un tono, un significado. */
export const PILDORA = {
  info: "border-info-line bg-info-surface text-info-ink",
  atencion: "border-warn-line bg-warn-surface text-warn-ink",
  bien: "border-success-line bg-success-surface text-success-ink",
  neutra: "border-line bg-surface text-fg-secondary",
} as const;

export const CLASE_DE_PILDORA = "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold";
