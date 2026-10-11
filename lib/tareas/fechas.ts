/**
 * lib/tareas/fechas.ts — la fecha límite que dice una línea de la reunión. CLIENT-SAFE y puro.
 *
 * «Entregar el reporte el miércoles», «para mañana», «a fin de mes»: lo calcula el CÓDIGO desde la hora de la
 * reunión, en hora de Costa Rica. La IA, si opina, elige de una lista cerrada (`ClaveDeVencimiento`) y esto la
 * traduce: nunca escribe una fecha.
 */
import { horaDeCostaRica, sumarDias, lunesDe, sumarSemanas, viernesDe } from "./semana";

export const CLAVES_DE_VENCIMIENTO = [
  "hoy",
  "manana",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "esta_semana",
  "proxima_semana",
] as const;
export type ClaveDeVencimiento = (typeof CLAVES_DE_VENCIMIENTO)[number];

const DIAS: Record<string, number> = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4 };

const TILDES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");
const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(TILDES, "");

/** La fecha `AAAA-MM-DD` de una clave, contada desde el instante de la reunión. */
export function venceDesdeClave(clave: ClaveDeVencimiento | null | undefined, reunion: Date | string): string | null {
  if (!clave) return null;
  const { fecha, diaDeLaSemana } = horaDeCostaRica(reunion);
  const lunes = lunesDe(reunion);
  switch (clave) {
    case "hoy":
      return fecha;
    case "manana":
      return sumarDias(fecha, 1);
    case "esta_semana":
      return diaDeLaSemana >= 4 ? viernesDe(sumarSemanas(lunes, 1)) : viernesDe(lunes);
    case "proxima_semana":
      return viernesDe(sumarSemanas(lunes, 1));
    default: {
      const objetivo = DIAS[clave];
      if (objetivo === undefined) return null;
      // El próximo día con ese nombre; si es hoy mismo, hoy («para el lunes», dicho el lunes temprano, es hoy).
      const delta = (objetivo - diaDeLaSemana + 7) % 7;
      return sumarDias(fecha, delta);
    }
  }
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** El último día del mes de una fecha `AAAA-MM-DD`. */
function finDeMes(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * La fecha límite que dice un texto, contada desde la reunión. Reconoce: hoy, mañana, lunes a viernes, esta semana,
 * la próxima semana, fin de mes, `AAAA-MM-DD`, `dd/mm` y «15 de octubre». Si no dice ninguna, `null`: nunca adivina.
 */
export function fechaDesdeLaReunion(texto: string, reunion: Date | string): string | null {
  const t = sinTildes(texto);
  const { fecha } = horaDeCostaRica(reunion);
  const anio = Number(fecha.slice(0, 4));

  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const conMes = t.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/);
  if (conMes) {
    const dia = Number(conMes[1]);
    const mes = MESES[conMes[2]];
    let candidato = `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
    if (candidato < fecha) candidato = `${anio + 1}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
    return dia >= 1 && dia <= 31 ? candidato : null;
  }

  const barra = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (barra) {
    const dia = Number(barra[1]);
    const mes = Number(barra[2]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      const a = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : anio;
      let candidato = `${a}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
      if (!barra[3] && candidato < fecha) candidato = `${a + 1}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
      return candidato;
    }
  }

  if (/\bfin(al)? de(l)? mes\b/.test(t)) return finDeMes(fecha);
  if (/\b(la )?(proxima|siguiente) semana\b/.test(t)) return venceDesdeClave("proxima_semana", reunion);
  if (/\besta semana\b/.test(t)) return venceDesdeClave("esta_semana", reunion);
  if (/\bpasado manana\b/.test(t)) return sumarDias(fecha, 2);
  if (/\bmanana\b/.test(t)) return venceDesdeClave("manana", reunion);
  if (/\bhoy\b/.test(t)) return venceDesdeClave("hoy", reunion);
  const dia = t.match(/\b(el |este |para el |antes del )?(lunes|martes|miercoles|jueves|viernes)\b/);
  if (dia) return venceDesdeClave(dia[2] as ClaveDeVencimiento, reunion);
  return null;
}
