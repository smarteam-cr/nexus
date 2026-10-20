/**
 * lib/kickoff/datos-de-la-portada.test.ts — la fila de datos clave de la portada del kickoff
 * («8 semanas · 26 oct 2026 · 5 fases»), editable como las etiquetas (2026-10-20, Valentina).
 *
 * Correr: `npx vitest run lib/kickoff/datos-de-la-portada.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import {
  cronogramaParaLaFila,
  cronogramaVacio,
  datosEfectivos,
  datosParaLeer,
  DATOS_POR_DEFECTO,
  idDeDatoNuevo,
  normalizarDatos,
  normalizarPortadaCongelada,
  plegarMetricas,
  resolverDatos,
  type CronogramaParaLaFila,
  type DatoDeLaPortada,
} from "./datos-de-la-portada";
import { fmtFull } from "@/lib/timeline/weeks";
import { normalizeHero } from "@/components/canvas/kickoff-sections/types";
import { preserveNonSchemaKeys } from "@/lib/ai/section-schema";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";

const ROTULOS = {
  duracion: "Duración total",
  arranque: "Arranque",
  fases: "Hoja de ruta",
  semanas: "semanas",
  fase: "fase",
  fasesPlural: "fases",
  porDefinir: "Por definir",
};

// Cayalá - WhatsApp Nativo, como está en producción el 2026-10-20: 5 fases, 8 semanas, arranque 26 oct.
const CAYALA: CronogramaParaLaFila = cronogramaParaLaFila({
  anchorStartDate: "2026-10-26T06:00:00.000Z",
  phases: [
    { durationWeeks: 1, startWeek: 0 },
    { durationWeeks: 3, startWeek: 1 },
    { durationWeeks: 2, startWeek: 3 },
    { durationWeeks: 1, startWeek: 5 },
    { durationWeeks: 2, startWeek: 7 },
  ],
});
const SIN_CRONOGRAMA: CronogramaParaLaFila = { semanas: null, fases: null, arranqueISO: null };

const resolver = (datos: DatoDeLaPortada[], crono = CAYALA) => resolverDatos(datos, crono, ROTULOS, fmtFull);

describe("los tres de siempre salen del cronograma mientras nadie los toque", () => {
  it("sin `datos`, la fila es duración · arranque · fases, con los números de Cayalá", () => {
    const r = resolver(datosEfectivos({}));
    expect(r.map((x) => [x.valor, x.unidad ?? "", x.etiqueta])).toEqual([
      ["9", "semanas", "Duración total"],
      ["26 oct 2026", "", "Arranque"],
      ["5", "fases", "Hoja de ruta"],
    ]);
    expect(r.every((x) => x.derivado)).toBe(true);
  });

  it("si el cronograma cambia, el número cambia solo (no quedó guardado como texto)", () => {
    const datos = datosEfectivos({ datos: plegarMetricas(datosEfectivos({})).datos });
    const otro = cronogramaParaLaFila({ anchorStartDate: "2026-11-02T00:00:00.000Z", phases: [{ durationWeeks: 4 }] });
    expect(resolver(datos, otro).map((x) => x.valor)).toEqual(["4", "2 nov 2026", "1"]);
    expect(resolver(datos, otro)[2].unidad).toBe("fase");
  });

  it("un valor escrito pisa al derivado entero (sin la unidad), y vaciarlo devuelve el número vivo", () => {
    const escrito = resolver([{ id: "duracion", fuente: "duracion", valor: "2 meses" }]);
    expect(escrito[0]).toMatchObject({ valor: "2 meses", derivado: false });
    expect(escrito[0].unidad).toBeUndefined();
    expect(resolver([{ id: "duracion", fuente: "duracion", valor: "  " }])[0]).toMatchObject({ valor: "9", derivado: true });
  });

  it("sin fecha de arranque dice «Por definir»; sin fases, duración y fases quedan vacías", () => {
    const r = resolver(datosEfectivos({}), SIN_CRONOGRAMA);
    expect(r.map((x) => x.valor)).toEqual(["", "Por definir", ""]);
    expect(r[1].porDefinir).toBe(true);
  });
});

describe("el consultor agrega, quita, edita y reordena", () => {
  const base = datosEfectivos({});

  it("agrega «3 integraciones» al final y se pinta con su etiqueta", () => {
    const nuevo = { id: idDeDatoNuevo(base, () => "a1"), valor: "3 integraciones", etiqueta: "Alcance" };
    const r = resolver([...base, nuevo]);
    expect(r[3]).toMatchObject({ valor: "3 integraciones", etiqueta: "Alcance", derivado: false });
    expect(nuevo.id).toBe("dato-a1");
  });

  it("borra el que no aplica y reordena: la fila sale en el orden guardado", () => {
    const sinFases = base.filter((d) => d.fuente !== "fases");
    const reordenada = [sinFases[1], sinFases[0], { id: "dato-x", valor: "Go-live: diciembre", etiqueta: "Meta" }];
    expect(resolver(reordenada).map((x) => x.valor)).toEqual(["26 oct 2026", "9", "Go-live: diciembre"]);
  });

  it("la etiqueta de un derivado se puede cambiar y vaciarla vuelve a la de siempre", () => {
    expect(resolver([{ id: "fases", fuente: "fases", etiqueta: "Etapas" }])[0].etiqueta).toBe("Etapas");
    expect(resolver([{ id: "fases", fuente: "fases", etiqueta: "" }])[0].etiqueta).toBe("Hoja de ruta");
  });

  it("borrar los tres deja la fila vacía (no vuelven los de siempre: [] ≠ ausente)", () => {
    expect(datosEfectivos({ datos: [] })).toEqual([]);
    expect(normalizarDatos([])).toEqual([]);
    expect(normalizarDatos(undefined)).toBeUndefined();
  });

  it("un id nuevo no choca con los que ya hay", () => {
    let n = 0;
    const id = idDeDatoNuevo([{ id: "dato-0" }, { id: "dato-1" }], () => String(n++));
    expect(id).toBe("dato-2");
  });
});

describe("lo que escribe el chat (`metrica*`) no queda escondido", () => {
  it("una métrica escrita gana sobre el valor del dato", () => {
    const datos = datosEfectivos({ datos: [{ id: "duracion", fuente: "duracion", valor: "8 semanas" }], metricaDuracion: "14 semanas" });
    expect(resolver(datos)[0].valor).toBe("14 semanas");
  });

  it("una edición de la fila las pliega en los datos y las borra (gana la última escritura)", () => {
    const datos = datosEfectivos({ metricaDuracion: "8 semanas", metricaFases: "5 fases" });
    const guardado = plegarMetricas(datos);
    expect(guardado.metricaDuracion).toBeUndefined();
    expect(guardado.metricaFases).toBeUndefined();
    expect(guardado.datos.map((d) => d.valor ?? "")).toEqual(["8 semanas", "", "5 fases"]);
  });

  it("los datos de Cayalá en producción (metricaDuracion «8 semanas», metricaFases «5 fases») se ven igual", () => {
    const hero = normalizeHero({ metricaDuracion: "8 semanas", metricaFases: "5 fases", tags: [] });
    expect(resolver(datosEfectivos(hero)).map((x) => x.valor)).toEqual(["8 semanas", "26 oct 2026", "5 fases"]);
  });
});

describe("la fila sobrevive a tipear el título y a regenerar con IA", () => {
  it("`normalizeHero` re-emite `datos` (sin eso, el siguiente tipeo del título la borraba)", () => {
    const datos = [{ id: "dato-a", valor: "3 integraciones", etiqueta: "Alcance" }];
    expect(normalizeHero({ datos }).datos).toEqual(datos);
  });

  it("`datos` está FUERA del esquema del agente y `preserveNonSchemaKeys` la conserva", () => {
    const def = KICKOFF_SECTION_DEFS.find((d) => d.key === "bienvenida")!;
    const props = Object.keys((def.schema as { properties: Record<string, unknown> }).properties);
    expect(props).not.toContain("datos");
    const prev = { headline: "viejo", datos: [{ id: "dato-a", valor: "3 integraciones" }] };
    const regenerado = preserveNonSchemaKeys(def.schema, prev, { headline: "nuevo", subhead: "", tags: [] });
    expect(regenerado.datos).toEqual(prev.datos);
    expect(regenerado.headline).toBe("nuevo");
  });

  it("basura en `datos` se descarta sin romper (ids repetidos, fuentes inventadas)", () => {
    expect(
      normalizarDatos([{ id: "a", valor: "x" }, { id: "a", valor: "y" }, { valor: "sin id" }, { id: "b", fuente: "otra" }, null]),
    ).toEqual([{ id: "a", valor: "x" }, { id: "b" }]);
  });
});

describe("lo que se lee (cliente y PDF) es lo que se ve al editar", () => {
  it("la vista de lectura quita los vacíos, y una fila que solo diría «Por definir» no se pinta", () => {
    expect(datosParaLeer(resolver(datosEfectivos({}), SIN_CRONOGRAMA))).toEqual([]);
    const conUno = resolver([...DATOS_POR_DEFECTO, { id: "dato-a", valor: "3 integraciones" }], SIN_CRONOGRAMA);
    expect(datosParaLeer(conUno).map((x) => x.valor)).toEqual(["Por definir", "3 integraciones"]);
  });

  it("la portada congelada al «Subir» se lee de vuelta igual (y descarta un año de tipeo)", () => {
    expect(normalizarPortadaCongelada(JSON.parse(JSON.stringify(CAYALA)))).toEqual(CAYALA);
    expect(normalizarPortadaCongelada({ semanas: 9, fases: 5, arranqueISO: "0026-10-19T00:00:00.000Z" })?.arranqueISO).toBeNull();
    expect(normalizarPortadaCongelada(null)).toBeNull();
  });

  it("un cronograma sin publicar (vista del cliente) no aporta nada → el hero usa la portada congelada", () => {
    expect(cronogramaVacio(cronogramaParaLaFila({ anchorStartDate: null, phases: [] }))).toBe(true);
    expect(cronogramaVacio(CAYALA)).toBe(false);
  });
});
