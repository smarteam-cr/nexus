/**
 * lib/procesos/respuesta.ts — LEER LO QUE DEVUELVE EL MODELO Y DEJARLO EN LA FORMA DEL MAPA.
 *
 * Puro. Tolerante con lo que escribe el modelo (un campo raro no tumba la lectura) y estricto con lo
 * que queda: ids únicos, flechas entre pasos que existen y nada que no sea de esa versión. Vive
 * aparte de `mapa.ts` porque usa zod y la pantalla importa `mapa.ts`.
 */
import { z } from "zod";
import { CAMBIOS, ORIGENES, TIPOS_DE_CARRIL, TIPOS_DE_PASO, type CambioDelPaso, type CarrilDelMapa, type FlechaDelMapa, type PasoDelMapa, type VersionDelMapa, type CitaSinUbicar } from "./mapa";

const texto = (max: number) => z.string().catch("").transform((s) => s.trim().slice(0, max));
const enumO = <T extends readonly [string, ...string[]]>(valores: T, porDefecto: T[number]) =>
  z.string().catch(porDefecto).transform((s) => ((valores as readonly string[]).includes(s.trim()) ? (s.trim() as T[number]) : porDefecto));

const citaCruda = z.object({ sesion: texto(20), cita: texto(400) }).passthrough();
const pasoCrudo = z
  .object({
    id: texto(40),
    carril: texto(60),
    texto: texto(120),
    tipo: enumO(TIPOS_DE_PASO, "paso"),
    herramienta: texto(80),
    origen: enumO(ORIGENES, "supuesto"),
    citas: z.array(citaCruda).catch([]),
    dolor: texto(140),
    cambio: z.string().catch("").transform((s) => ((CAMBIOS as readonly string[]).includes(s.trim()) ? (s.trim() as CambioDelPaso) : "")),
    reemplaza: z.array(z.string()).catch([]),
    enHubspot: texto(160),
  })
  .passthrough();
const carrilCrudo = z.object({ id: texto(60), nombre: texto(80), tipo: enumO(TIPOS_DE_CARRIL, "equipo") }).passthrough();
const flechaCruda = z.object({ de: texto(40), a: texto(40), etiqueta: texto(40) }).passthrough();
const versionCruda = z
  .object({
    carriles: z.array(carrilCrudo).catch([]),
    pasos: z.array(pasoCrudo).catch([]),
    flechas: z.array(flechaCruda).catch([]),
    seVa: z.array(z.object({ id: texto(40), porque: texto(240) })).catch([]),
  })
  .catch({ carriles: [], pasos: [], flechas: [], seVa: [] });

/** La respuesta del paso 2b para UN proceso, tal como la pide `prompts.ts`. */
export const respuestaDelMapaSchema = z.object({
  hoy: versionCruda,
  despues: versionCruda,
  cambios: z.array(z.object({ texto: texto(240), hoy: z.array(z.string()).catch([]), despues: z.array(z.string()).catch([]) })).catch([]),
  preguntas: z.array(z.string()).catch([]),
});
export type RespuestaDelMapa = z.infer<typeof respuestaDelMapaSchema>;

type VersionNormalizada = Omit<VersionDelMapa, "pasos"> & { pasos: (Omit<PasoDelMapa, "citas"> & { citas: CitaSinUbicar[] })[] };

/**
 * Limpia una versión: ids únicos, carriles que existen, flechas entre pasos que existen y sin
 * repetirse, y nada de los campos que no son de esa versión (el dolor es de hoy; el cambio, de
 * después). No inventa nada: lo que no se puede arreglar, se descarta.
 */
export function normalizarVersion(cruda: z.infer<typeof versionCruda>, cual: "hoy" | "despues"): VersionNormalizada {
  const carriles: CarrilDelMapa[] = [];
  const idsCarril = new Set<string>();
  for (const c of cruda.carriles) {
    const id = c.id || c.nombre;
    if (!id || idsCarril.has(id)) continue;
    idsCarril.add(id);
    carriles.push({ id, nombre: c.nombre || id, tipo: c.tipo });
  }
  const pasos: VersionNormalizada["pasos"] = [];
  const idsPaso = new Set<string>();
  for (const p of cruda.pasos.slice(0, 14)) {
    if (!p.id || !p.texto || idsPaso.has(p.id)) continue;
    idsPaso.add(p.id);
    const carril = p.carril || carriles[0]?.id || "otros";
    if (!idsCarril.has(carril)) {
      idsCarril.add(carril);
      carriles.push({ id: carril, nombre: carril, tipo: "equipo" });
    }
    pasos.push({
      id: p.id,
      carril,
      texto: p.texto,
      tipo: p.tipo,
      herramienta: p.herramienta,
      origen: cual === "hoy" ? (p.origen === "acordado" ? "dicho" : p.origen === "propuesto" ? "supuesto" : p.origen) : p.origen === "dicho" ? "acordado" : p.origen,
      citas: p.citas.filter((c) => c.sesion && c.cita).slice(0, 2).map((c) => ({ sesion: c.sesion, cita: c.cita })),
      dolor: cual === "hoy" ? p.dolor : "",
      cambio: cual === "despues" ? p.cambio || "igual" : "",
      reemplaza: cual === "despues" ? p.reemplaza.map((r) => r.trim()).filter(Boolean) : [],
      enHubspot: cual === "despues" ? p.enHubspot : "",
    });
  }
  const vistas = new Set<string>();
  const flechas: FlechaDelMapa[] = [];
  for (const f of cruda.flechas) {
    const k = `${f.de}>${f.a}`;
    if (!idsPaso.has(f.de) || !idsPaso.has(f.a) || f.de === f.a || vistas.has(k)) continue;
    vistas.add(k);
    flechas.push({ de: f.de, a: f.a, etiqueta: f.etiqueta });
  }
  // Solo los carriles que alguien usa.
  const usados = new Set(pasos.map((p) => p.carril));
  return { carriles: carriles.filter((c) => usados.has(c.id)), pasos, flechas };
}

/** Normaliza la respuesta entera del paso 2b; `reemplaza`, `seVa` y `cambios` solo apuntan a pasos que existen. */
export function normalizarRespuesta(r: RespuestaDelMapa) {
  const hoy = normalizarVersion(r.hoy, "hoy");
  const despues = normalizarVersion(r.despues, "despues");
  const idsHoy = new Set(hoy.pasos.map((p) => p.id));
  const idsDespues = new Set(despues.pasos.map((p) => p.id));
  for (const p of despues.pasos) p.reemplaza = p.reemplaza.filter((id) => idsHoy.has(id));
  const seVa = r.despues.seVa.filter((v) => idsHoy.has(v.id) && v.porque);
  const cambios = r.cambios
    .filter((c) => c.texto)
    .slice(0, 6)
    .map((c) => ({ texto: c.texto, hoy: c.hoy.filter((id) => idsHoy.has(id)), despues: c.despues.filter((id) => idsDespues.has(id)) }));
  const preguntas = r.preguntas.map((p) => p.trim()).filter(Boolean).slice(0, 4);
  return { hoy, despues: { ...despues, seVa }, cambios, preguntas };
}
