/**
 * lib/cs/adopcion.ts — las lecturas de la pestaña «Adopción» de una cuenta (rediseño del
 * 2026-10-05). PURO y client-safe: todo sale de la lectura de HubSpot Partner (`leerPartner`) y del
 * historial semanal de uso (`PartnerUsageSnapshot`). Nada se estima: lo que HubSpot no mide se dice.
 */
import { UMBRALES, type HubDeLaCuenta, type HubDePartner, type LecturaDePartner } from "./lectura-partner";

// ── Del contrato al uso ─────────────────────────────────────────────────────────────────────────

export interface PasoDeAdopcion {
  clave: "contratado" | "activado" | "sano";
  titulo: string;
  cifra: number;
  /** El total contra el que se lee la cifra; null = la cifra es el total (los contratados). */
  de: number | null;
  detalle: string;
  /** Algo de lo contratado se quedó en este paso. */
  atencion: boolean;
}

const corto = (h: HubDeLaCuenta) => h.nombre.replace(/ Hub$/, "");

/** «Sales» · «Sales y Service» · «Sales, Service y Content». */
function lista(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join("");
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Cuánto de lo que paga ya está prendido y se usa: contratado → activado → con uso sano (el
 * puntaje del hub en el umbral de Smarteam o arriba). Un hub que HubSpot no mide no cuenta como
 * sano ni como bajo: se nombra aparte.
 */
export function delContratoAlUso(hubs: HubDeLaCuenta[]): PasoDeAdopcion[] {
  const total = hubs.length;
  const activados = hubs.filter((h) => h.activado === true);
  const sinActivar = hubs.filter((h) => h.activado === false);
  const sinDatoDeActivacion = hubs.filter((h) => h.activado === null);
  const sanos = hubs.filter((h) => h.uso !== null && h.uso >= UMBRALES.usoBajo);
  const bajos = hubs.filter((h) => h.uso !== null && h.uso < UMBRALES.usoBajo);
  const sinMedir = hubs.filter((h) => h.uso === null);

  const detalleActivado = [
    sinActivar.length ? `Falta activar ${lista(sinActivar.map(corto))}.` : null,
    sinDatoDeActivacion.length ? `HubSpot no dice si ${lista(sinDatoDeActivacion.map(corto))} está activado.` : null,
  ].filter(Boolean);

  const detalleSano = [
    sanos.length ? `${sanos.length === 1 ? "Solo " : ""}${lista(sanos.map((h) => `${corto(h)} (${h.uso})`))}.` : "Ninguno llega al umbral.",
    bajos.length ? `${lista(bajos.map((h) => `${corto(h)} ${h.uso}`))} ${bajos.length === 1 ? "está" : "están"} bajo ${UMBRALES.usoBajo}.` : null,
    sinMedir.length ? `${lista(sinMedir.map(corto))}: HubSpot no lo mide.` : null,
  ].filter(Boolean);

  return [
    {
      clave: "contratado",
      titulo: "Contratado",
      cifra: total,
      de: null,
      detalle: hubs.map((h) => `${corto(h)}${h.plan ? ` ${h.plan}` : ""}`).join(" · ") || "Ningún hub contratado.",
      atencion: false,
    },
    {
      clave: "activado",
      titulo: "Activado",
      cifra: activados.length,
      de: total,
      detalle: detalleActivado.join(" ") || "Todos activados.",
      atencion: sinActivar.length > 0,
    },
    {
      clave: "sano",
      titulo: "Con uso sano",
      cifra: sanos.length,
      de: total,
      detalle: detalleSano.join(" "),
      atencion: bajos.length > 0,
    },
  ];
}

// ── Licencias ───────────────────────────────────────────────────────────────────────────────────

export interface FilaDeLicencias {
  tipo: string;
  nota: string;
  asignadas: number;
  total: number;
  libres: number;
}

/**
 * Una fila por tipo de licencia con límite conocido: las principales de la plataforma y las de cada
 * hub que las tiene. Las pagadas sin asignar son las primeras que se recortan al renovar.
 */
export function licenciasDeLaCuenta(p: LecturaDePartner): FilaDeLicencias[] {
  const filas: FilaDeLicencias[] = [];
  const sumar = (tipo: string, nota: string, l: { asignadas: number | null; libres: number | null; limite: number | null } | null) => {
    if (!l?.limite) return;
    const asignadas = l.asignadas ?? (l.libres !== null ? l.limite - l.libres : null);
    if (asignadas === null) return;
    const a = Math.max(0, Math.min(asignadas, l.limite));
    filas.push({ tipo, nota, asignadas: a, total: l.limite, libres: l.limite - a });
  };
  sumar("Principales", "de toda la plataforma", p.licenciasPrincipales);
  for (const h of p.hubs) {
    const nota = [h.plan, h.activado === false ? "sin activar" : null].filter(Boolean).join(" · ");
    sumar(h.nombre, nota, h.licencias);
  }
  return filas;
}

/** Cuántas licencias pagadas nadie tiene asignadas, sumando todos los tipos. */
export function licenciasSinAsignar(filas: FilaDeLicencias[]): number {
  return filas.reduce((s, f) => s + f.libres, 0);
}

// ── Historial semanal de uso ────────────────────────────────────────────────────────────────────

export interface SemanaDeUso {
  /** «2026-W28», semana ISO. */
  semana: string;
  uso: number | null;
  porHub: Partial<Record<HubDePartner, number | null>>;
}

/** El lunes (AAAA-MM-DD) de una semana ISO «2026-W28». null si la clave no tiene esa forma. */
export function lunesDeLaSemana(clave: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(clave);
  if (!m) return null;
  const anio = Number(m[1]);
  const semana = Number(m[2]);
  // El 4 de enero siempre cae en la semana 1 (ISO 8601).
  const cuatroDeEnero = new Date(Date.UTC(anio, 0, 4));
  const diaSemana = (cuatroDeEnero.getUTCDay() + 6) % 7; // lunes = 0
  const lunes = new Date(cuatroDeEnero.getTime() + ((semana - 1) * 7 - diaSemana) * 86_400_000);
  return lunes.toISOString().slice(0, 10);
}

/**
 * El uso de hace `semanas` semanas (de toda la plataforma o de un hub), contado desde la semana más
 * nueva del historial. null si el historial no llega tan atrás: no se aproxima con otra semana.
 */
export function usoHaceSemanas(historial: SemanaDeUso[], hub: HubDePartner | null, semanas = 4): number | null {
  if (historial.length === 0) return null;
  const ordenado = [...historial].sort((a, b) => a.semana.localeCompare(b.semana));
  const ultima = lunesDeLaSemana(ordenado[ordenado.length - 1].semana);
  if (!ultima) return null;
  const buscada = new Date(Date.parse(`${ultima}T00:00:00Z`) - semanas * 7 * 86_400_000).toISOString().slice(0, 10);
  const fila = ordenado.find((s) => lunesDeLaSemana(s.semana) === buscada);
  if (!fila) return null;
  return hub ? (fila.porHub[hub] ?? null) : fila.uso;
}

/** Cuántas semanas seguidas, contando desde la más nueva, el uso está bajo el umbral. */
export function semanasBajoElUmbral(historial: SemanaDeUso[]): number {
  const ordenado = [...historial].sort((a, b) => b.semana.localeCompare(a.semana));
  let n = 0;
  for (const s of ordenado) {
    if (s.uso === null || s.uso >= UMBRALES.usoBajo) break;
    n++;
  }
  return n;
}
