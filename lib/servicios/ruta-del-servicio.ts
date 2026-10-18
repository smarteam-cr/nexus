/**
 * lib/servicios/ruta-del-servicio.ts — la RUTA DEL SERVICIO que ve el cliente: los ciclos de su servicio recurrente y
 * sus casos de uso como Gantt (docs/smartloop-plan.md, etapa 7). PURO y CLIENT-SAFE.
 *
 * Es la previsibilidad que busca el cliente: dónde estuvo cada ciclo, dónde está el de hoy y qué casos de uso tiene cada
 * uno, con sus fechas. Se arma al «Subir al cliente» y se guarda CONGELADA en `Project.ciclosPublicados` (como la
 * Entrega): lo que el cliente abre es lo que se le mostró, no lo último que alguien editó.
 *
 * ⛔ Lo que NUNCA cruza: el porqué de cada caso (es razonamiento interno), su criterio medido, la meta evaluada, la
 * propuesta del siguiente ciclo, las notas de las fases, las citas de reuniones, quién aprobó y cualquier monto. Cruzan
 * solo: el ciclo (número, tramo, fechas, meta, etapa, si cerró y cómo quedó la meta) y cada caso (título, resultado que
 * persigue, fechas, estado y lo que debe el cliente, con su título y para cuándo). Un texto con un monto se saca entero
 * (`sinMontos`); el lector `leerRuta` valida la forma y falla CERRADO: una foto que no se entiende no se muestra.
 */
import { ETIQUETA_DE_ETAPA, esEtapaDelCiclo } from "./ciclo";

export type EstadoDelCasoEnLaRuta = "sin_fechas" | "pendiente" | "en_curso" | "hecho" | "cumplido" | "no_cumplido";

export interface DependenciaEnLaRuta {
  titulo: string;
  /** AAAA-MM-DD o null. */
  vence: string | null;
  hecha: boolean;
}

export interface CasoEnLaRuta {
  titulo: string;
  /** El resultado que persigue, en palabras del cliente. */
  resultado: string | null;
  /** AAAA-MM-DD (null = todavía sin fechas). */
  desde: string | null;
  hasta: string | null;
  estado: EstadoDelCasoEnLaRuta;
  /** Lo que debe el cliente para destrabarlo (sin las suspendidas). */
  delCliente: DependenciaEnLaRuta[];
}

export interface CicloEnLaRuta {
  numero: number;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  meta: string | null;
  /** «Diagnóstico», «Implementación»… */
  etapa: string | null;
  cerrado: boolean;
  /** Cómo quedó la meta al cerrar. */
  resultado: "cumplida" | "parcial" | "no_cumplida" | null;
  casos: CasoEnLaRuta[];
}

export interface RutaDelServicio {
  formato: 1;
  servicio: string;
  /** ISO: cuándo se subió. */
  publicadaEl: string;
  ciclos: CicloEnLaRuta[];
}

// ── Lo que se saca ───────────────────────────────────────────────────────────

/** Un monto escrito: «US$ 1.200», «$500», «₡250 000», «3.000 dólares», «USD 900». */
const MONTO = /(?:US\$|USD|CRC|₡|\$)\s?\d|\d[\d.,\s]*\s?(?:US\$|USD|CRC|d[oó]lares|colones)\b/i;

/** El texto, o null si trae un monto o está vacío. Lo que menciona plata no le llega al cliente. */
export function sinMontos(texto: string | null | undefined): string | null {
  const t = texto?.trim();
  if (!t) return null;
  return MONTO.test(t) ? null : t;
}

// ── Armar la foto ────────────────────────────────────────────────────────────

export interface CasoParaLaRuta {
  titulo: string;
  resultado: string | null;
  /** sugerido | en_plan | en_ciclo | cumplido | no_cumplido | descartado */
  estadoDelCaso: string;
  /** Del cronograma del ciclo (lib/timeline/ciclo.ts): sin_fase | pendiente | en_curso | hecha. */
  estadoEnElCronograma: string;
  desde: string | null;
  hasta: string | null;
  dependencias: { titulo: string; vence: string | null; hecha: boolean }[];
}

export interface CicloParaLaRuta {
  numero: number;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
  meta: string | null;
  etapa: string;
  estado: string;
  metaResultado: string | null;
  casos: CasoParaLaRuta[];
}

function estadoDelCaso(c: CasoParaLaRuta): EstadoDelCasoEnLaRuta {
  if (c.estadoDelCaso === "cumplido") return "cumplido";
  if (c.estadoDelCaso === "no_cumplido") return "no_cumplido";
  if (c.estadoEnElCronograma === "hecha") return "hecho";
  if (c.estadoEnElCronograma === "en_curso") return "en_curso";
  if (!c.desde || !c.hasta) return "sin_fechas";
  return "pendiente";
}

const RESULTADOS = new Set(["cumplida", "parcial", "no_cumplida"]);
const dia = (f: string | null) => (f && /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null);

/** La foto que se congela al «Subir al cliente». Los casos descartados no van. */
export function rutaDelServicio(o: { servicio: string; ciclos: readonly CicloParaLaRuta[]; ahora: Date }): RutaDelServicio {
  return {
    formato: 1,
    servicio: o.servicio,
    publicadaEl: o.ahora.toISOString(),
    ciclos: [...o.ciclos]
      .sort((a, b) => a.numero - b.numero)
      .map((c) => ({
        numero: c.numero,
        nombre: sinMontos(c.nombre),
        desde: dia(c.desde),
        hasta: dia(c.hasta),
        meta: sinMontos(c.meta),
        etapa: c.estado === "cerrado" ? null : esEtapaDelCiclo(c.etapa) ? ETIQUETA_DE_ETAPA[c.etapa] : null,
        cerrado: c.estado === "cerrado",
        resultado: c.metaResultado && RESULTADOS.has(c.metaResultado) ? (c.metaResultado as CicloEnLaRuta["resultado"]) : null,
        casos: c.casos
          .filter((x) => x.estadoDelCaso !== "descartado" && x.estadoDelCaso !== "sugerido" && x.estadoDelCaso !== "en_plan")
          .map((x) => ({
            titulo: sinMontos(x.titulo) ?? "Caso de uso",
            resultado: sinMontos(x.resultado),
            desde: dia(x.desde),
            hasta: dia(x.hasta),
            estado: estadoDelCaso(x),
            delCliente: x.dependencias
              .map((d) => ({ titulo: sinMontos(d.titulo), vence: dia(d.vence), hecha: d.hecha }))
              .filter((d): d is DependenciaEnLaRuta => !!d.titulo)
              .slice(0, 6),
          })),
      })),
  };
}

/** ¿Hay algo que mostrar? Una ruta sin ciclos no se publica (el cliente abriría una página vacía). */
export function rutaConContenido(r: RutaDelServicio): boolean {
  return r.ciclos.length > 0;
}

// ── Leer la foto (fail-closed) ───────────────────────────────────────────────

const esTexto = (v: unknown): v is string => typeof v === "string";
const textoONull = (v: unknown): string | null => (esTexto(v) ? v : null);
const ESTADOS = new Set<EstadoDelCasoEnLaRuta>(["sin_fechas", "pendiente", "en_curso", "hecho", "cumplido", "no_cumplido"]);

/** La foto guardada, validada campo por campo. null = no se entiende (y entonces no se muestra nada). */
export function leerRuta(v: unknown): RutaDelServicio | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.formato !== 1 || !esTexto(r.servicio) || !esTexto(r.publicadaEl) || !Array.isArray(r.ciclos)) return null;
  const ciclos: CicloEnLaRuta[] = [];
  for (const cv of r.ciclos) {
    if (!cv || typeof cv !== "object") return null;
    const c = cv as Record<string, unknown>;
    if (typeof c.numero !== "number" || !Array.isArray(c.casos)) return null;
    const casos: CasoEnLaRuta[] = [];
    for (const xv of c.casos) {
      if (!xv || typeof xv !== "object") return null;
      const x = xv as Record<string, unknown>;
      if (!esTexto(x.titulo) || !ESTADOS.has(x.estado as EstadoDelCasoEnLaRuta)) return null;
      casos.push({
        titulo: x.titulo,
        resultado: sinMontos(textoONull(x.resultado)),
        desde: dia(textoONull(x.desde)),
        hasta: dia(textoONull(x.hasta)),
        estado: x.estado as EstadoDelCasoEnLaRuta,
        delCliente: (Array.isArray(x.delCliente) ? x.delCliente : [])
          .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && esTexto((d as Record<string, unknown>).titulo))
          .map((d) => ({ titulo: d.titulo as string, vence: dia(textoONull(d.vence)), hecha: d.hecha === true })),
      });
    }
    ciclos.push({
      numero: c.numero,
      nombre: textoONull(c.nombre),
      desde: dia(textoONull(c.desde)),
      hasta: dia(textoONull(c.hasta)),
      meta: sinMontos(textoONull(c.meta)),
      etapa: textoONull(c.etapa),
      cerrado: c.cerrado === true,
      resultado: RESULTADOS.has(String(c.resultado)) ? (c.resultado as CicloEnLaRuta["resultado"]) : null,
      casos,
    });
  }
  return { formato: 1, servicio: r.servicio, publicadaEl: r.publicadaEl, ciclos };
}

// ── El eje del Gantt ─────────────────────────────────────────────────────────

export interface EjeDeLaRuta {
  /** AAAA-MM-DD del primer y el último día del eje. */
  desde: string;
  hasta: string;
  dias: number;
  /** Los meses que cruza, con dónde empieza cada uno (0..1). */
  meses: { etiqueta: string; inicio: number }[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** El eje: del primer día al último que aparezca en la ruta. null = no hay ninguna fecha. */
export function ejeDeLaRuta(r: RutaDelServicio): EjeDeLaRuta | null {
  const fechas: string[] = [];
  for (const c of r.ciclos) {
    if (c.desde) fechas.push(c.desde);
    if (c.hasta) fechas.push(c.hasta);
    for (const x of c.casos) {
      if (x.desde) fechas.push(x.desde);
      if (x.hasta) fechas.push(x.hasta);
    }
  }
  if (!fechas.length) return null;
  fechas.sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const dias = Math.max(1, Math.round((t(hasta) - t(desde)) / 86_400_000) + 1);
  const meses: EjeDeLaRuta["meses"] = [];
  const [a0, m0] = desde.split("-").map(Number);
  let anio = a0;
  let mes = m0;
  for (;;) {
    const primero = `${anio}-${String(mes).padStart(2, "0")}-01`;
    if (primero > hasta) break;
    const inicio = Math.max(0, (t(primero) - t(desde)) / 86_400_000 / dias);
    meses.push({ etiqueta: `${MESES[mes - 1]}${mes === 1 || meses.length === 0 ? ` ${anio}` : ""}`, inicio });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return { desde, hasta, dias, meses };
}

/** Dónde cae un tramo en el eje, en fracción (0..1). null sin fechas. */
export function posicionEnElEje(eje: EjeDeLaRuta, desde: string | null, hasta: string | null): { izquierda: number; ancho: number } | null {
  if (!desde || !hasta) return null;
  const izquierda = Math.max(0, (t(desde) - t(eje.desde)) / 86_400_000 / eje.dias);
  const fin = Math.min(1, ((t(hasta) - t(eje.desde)) / 86_400_000 + 1) / eje.dias);
  return { izquierda, ancho: Math.max(0.01, fin - izquierda) };
}

/** Dónde cae hoy en el eje (0..1), o null si hoy queda afuera. */
export function hoyEnElEje(eje: EjeDeLaRuta, hoyISO: string): number | null {
  const x = (t(hoyISO.slice(0, 10)) - t(eje.desde)) / 86_400_000 / eje.dias;
  return x >= 0 && x <= 1 ? x : null;
}

export const ROTULO_DEL_ESTADO: Record<EstadoDelCasoEnLaRuta, string> = {
  sin_fechas: "Por agendar",
  pendiente: "Por empezar",
  en_curso: "En curso",
  hecho: "Hecho",
  cumplido: "Cumplido",
  no_cumplido: "No se cumplió",
};
