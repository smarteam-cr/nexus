/**
 * El catálogo de casos de uso contra la escala publicada: cada criterio citado existe, cae en una dimensión que el
 * caso dice mover y en un nivel entre el de partida y el de llegada; cada caso habla de resultados y en tuteo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { leerArchivoDeLaEscala } from "@/lib/escala/documento/archivos";
import { parsearEscala, todasLasDimensiones, todosLosCriterios } from "@/lib/escala/documento/parsear";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { avisoDelCaso, todosLosAvisos } from "./avisos-server";
import { CATALOGO_DE_CASOS, NOMBRES_ANTERIORES, SERVICIOS, tituloVigente, type CasoDelCatalogo } from "./catalogo";

vi.mock("server-only", () => ({}));

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const criterios = new Map(todosLosCriterios(escala).map((c) => [c.id, c]));
const dimensiones = new Set(todasLasDimensiones(escala).map((d) => d.id));
const orden = (l: string) => LETRAS.indexOf(l as (typeof LETRAS)[number]);

/** Los verbos con que empieza la descripción de un trabajo, no la de un resultado. */
const VERBOS_DE_TRABAJO = /^(implementa|implementamos|configura|configuramos|diseña|diseñamos|instala|instalamos|construye|construimos|activa|activamos|documenta|documentamos|establece|creamos|crea|montamos|monta)\b/i;

function textos(c: CasoDelCatalogo): string[] {
  return [c.titulo, c.promesa, c.descripcion, ...c.sintomas, ...c.obtienes, c.cuandoConviene ?? "", avisoDelCaso(c.id) ?? ""];
}

describe("el catálogo de casos de uso", () => {
  it("cada caso tiene una descripción de dos frases que cabe en la tarjeta", () => {
    for (const c of CATALOGO_DE_CASOS) {
      expect(c.descripcion.length, c.id).toBeLessThanOrEqual(300);
      expect(c.descripcion.split(/(?<=\.)\s+/).length, c.id).toBe(2);
    }
  });

  it("cada caso tiene un id único en kebab-case y un título único", () => {
    const ids = CATALOGO_DE_CASOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const titulos = CATALOGO_DE_CASOS.map((c) => c.titulo.toLowerCase());
    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it.each(CATALOGO_DE_CASOS.map((c) => [c.id, c] as const))("%s: cada criterio existe en la escala y calza con lo que mueve", (_, c) => {
    for (const m of c.mueve) {
      expect(dimensiones.has(m.dimension), `${c.id}: la dimensión ${m.dimension} no existe`).toBe(true);
      expect(orden(m.desde), `${c.id}: ${m.dimension} no sube`).toBeLessThan(orden(m.hasta));
      expect(c.areas, `${c.id}: ${m.dimension} es de un área que no declara`).toContain(m.dimension.split(".")[0]);
    }
    expect(new Set(c.mueve.map((m) => m.dimension)).size).toBe(c.mueve.length);
    for (const id of c.criterios) {
      expect(criterios.has(id), `${c.id}: el criterio ${id} no existe en la escala`).toBe(true);
      const dim = id.split(".").slice(0, 2).join(".");
      const letra = id.split(".")[2][0];
      const m = c.mueve.find((x) => x.dimension === dim);
      expect(m, `${c.id}: cita ${id}, pero no dice que mueve ${dim}`).toBeDefined();
      expect(orden(letra) > orden(m!.desde) && orden(letra) <= orden(m!.hasta), `${c.id}: ${id} queda fuera de ${m!.desde}→${m!.hasta}`).toBe(true);
    }
    // Toda dimensión que dice mover tiene al menos un criterio que lo respalde.
    for (const m of c.mueve) expect(c.criterios.some((id) => id.startsWith(`${m.dimension}.`)), `${c.id}: mueve ${m.dimension} sin citar un criterio`).toBe(true);
    // Y lleva la dimensión hasta el nivel más alto que cita, no más: un caso que promete Óptimo sin un criterio de Óptimo
    // no le suma nada a quien ya está en Eficiente (pasó al reapuntar a la 9.0).
    for (const m of c.mueve) {
      const tope = Math.max(...c.criterios.filter((id) => id.startsWith(`${m.dimension}.`)).map((id) => orden(id.split(".")[2][0])));
      expect(orden(m.hasta), `${c.id}: ${m.dimension} llega hasta ${m.hasta}, pero lo más alto que cita es de otro nivel`).toBe(tope);
    }
  });

  it("el tipo calza con lo que mueve", () => {
    for (const c of CATALOGO_DE_CASOS) {
      if (c.tipo === "complementario") {
        expect(c.criterios, c.id).toEqual([]);
        expect(c.mueve, c.id).toEqual([]);
        continue;
      }
      expect(c.criterios.length, c.id).toBeGreaterThan(0);
      if (c.tipo === "aterrizar" || c.tipo === "reactivar") for (const m of c.mueve) expect(m.hasta, `${c.id} ${m.dimension}`).toBe("F");
      if (c.tipo === "reactivar") for (const m of c.mueve) expect(m.desde, `${c.id} ${m.dimension}`).toBe("I");
      if (c.tipo === "expandir") expect(c.mueve.some((m) => m.hasta === "E" || m.hasta === "O"), c.id).toBe(true);
    }
  });

  it("los casos que nombra uno existen, y ninguno se nombra a sí mismo", () => {
    const ids = new Set(CATALOGO_DE_CASOS.map((c) => c.id));
    for (const c of CATALOGO_DE_CASOS) {
      for (const r of [...(c.requiere ?? []), ...(c.requiereUnoDe ?? []), ...(c.dentroDe ? [c.dentroDe] : [])]) {
        expect(ids.has(r), `${c.id} nombra a ${r}`).toBe(true);
        expect(r).not.toBe(c.id);
      }
    }
  });

  it("los servicios son los del catálogo de Smarteam", () => {
    for (const c of CATALOGO_DE_CASOS) {
      expect(c.servicios.length, c.id).toBeGreaterThan(0);
      for (const s of c.servicios) expect(SERVICIOS, c.id).toContain(s);
    }
  });

  it("cada caso dice lo que obtiene el cliente, no el trabajo que se hace", () => {
    for (const c of CATALOGO_DE_CASOS) {
      expect(c.sintomas.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.obtienes.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.obtienes.length, c.id).toBeLessThanOrEqual(4);
      for (const o of c.obtienes) expect(o, c.id).not.toMatch(VERBOS_DE_TRABAJO);
      expect(c.promesa, c.id).not.toMatch(VERBOS_DE_TRABAJO);
    }
  });

  it("todo está en tuteo y sin frases largas de más", () => {
    for (const c of CATALOGO_DE_CASOS) {
      for (const t of textos(c)) expect(voseoEnProsa(t), `${c.id}: «${t}»`).toEqual([]);
      expect(c.titulo.length, c.id).toBeLessThanOrEqual(90);
      expect(c.promesa.length, c.id).toBeLessThanOrEqual(160);
    }
  });
});

describe("lo interno del catálogo", () => {
  it("cada nombre anterior lleva al nombre de hoy de su caso, y un título que no es de ninguno vuelve igual", () => {
    for (const [id, viejos] of Object.entries(NOMBRES_ANTERIORES)) {
      const caso = CATALOGO_DE_CASOS.find((c) => c.id === id);
      expect(caso, id).toBeDefined();
      for (const v of viejos) {
        expect(v).not.toBe(caso!.titulo);
        expect(tituloVigente(v)).toBe(caso!.titulo);
        expect(tituloVigente(` ${v.toUpperCase()} `)).toBe(caso!.titulo);
      }
    }
    expect(tituloVigente("Un caso libre de la preventa")).toBe("Un caso libre de la preventa");
    expect(tituloVigente(CATALOGO_DE_CASOS[0].titulo)).toBe(CATALOGO_DE_CASOS[0].titulo);
  });

  it("ningún aviso trae horas: las horas viven en actividades y se calculan", () => {
    for (const c of CATALOGO_DE_CASOS) expect(avisoDelCaso(c.id) ?? "", c.id).not.toMatch(/\d+(,\d+)? h\b/);
  });

  it("la nota para quien vende no vive en el catálogo, que llega al navegador y a la propuesta pública", () => {
    const catalogo = readFileSync(join(process.cwd(), "lib/casos-de-uso/catalogo.ts"), "utf8");
    expect(catalogo).not.toMatch(/^\s+aviso\??:/m);
    for (const c of CATALOGO_DE_CASOS) expect(Object.keys(c), c.id).not.toContain("aviso");
    const avisos = readFileSync(join(process.cwd(), "lib/casos-de-uso/avisos-server.ts"), "utf8");
    expect(avisos).toContain('import "server-only";');
    for (const id of Object.keys(todosLosAvisos())) expect(CATALOGO_DE_CASOS.some((c) => c.id === id), id).toBe(true);
  });
});
