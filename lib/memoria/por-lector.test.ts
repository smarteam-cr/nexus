/**
 * lib/memoria/por-lector.test.ts — LA MEMORIA COMO LA RECIBE CADA LECTOR (memoria de la cuenta, etapa 3, segunda parte).
 *
 * Con las opciones REALES del registro (alcance, orígenes que no lee, partes que ya tiene por otro lado) y la memoria que
 * pide cada uno (la cuenta, el proyecto o las dos), dos cosas:
 *   1. ⛔ ningún lector que escribe algo que ve el cliente recibe un centinela de lo interno, ni el handoff los campos
 *      internos, la postura ni la preventa;
 *   2. el LARGO que suma cada lector, con una cuenta llena hasta el tope: es la medida del prompt «después» que pide el
 *      plan, sin llamar a la IA. Con `MEDIR=<archivo>` la escribe en ese archivo
 *      (`MEDIR=medidas.json npx vitest run --project unit lib/memoria/por-lector.test.ts`).
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { fichaVacia, valoresVacios, type FichaGuardada } from "@/lib/clients/ficha";
import type { ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import { armarMemoriaDeLaCuenta, armarMemoriaDelProyecto, TOPES_DE_LA_MEMORIA } from "./armar";
import { CONSUMIDORES_DE_LA_MEMORIA, type LectorDeMemoria } from "./consumidores";
import type { DatosDeLaCuenta, DatosDelProyecto } from "./tipos";

const S = (que: string) => `SECRETO-${que}`;
const largo = (n: number, que: string) => `${que} `.repeat(Math.ceil(n / (que.length + 1))).slice(0, n).trim();

const ficha: FichaGuardada = {
  ...fichaVacia(),
  valores: {
    ...valoresVacios(),
    aQueSeDedica: largo(260, "Fundación universitaria con sedes en todo el país"),
    herramientasActuales: largo(160, "Excel y WhatsApp para admisiones"),
    retosEstrategicos: largo(200, "Crecer la matrícula sin crecer el equipo"),
    dolorPrincipal: largo(160, "Se pierden los interesados después de la feria"),
    stakeholders: `- Ana — directora — sponsor — ${S("postura")}\n- Luis — TI — usuario — ${S("postura-2")}`,
    aperturaAsesoria: "baja",
    porQueApertura: S("porque-apertura"),
    motivacionCompra: S("motivacion"),
    oportunidadesFuturas: S("oportunidades"),
  },
  confirmadaAt: "2026-09-27T12:00:00.000Z",
  confirmadaPor: "Ana",
  propuesta: {
    valores: { dolorPrincipal: S("propuesto-por-sesion"), retosEstrategicos: S("propuesto-por-handoff"), motivacionCompra: S("propuesto-por-preventa") },
    fuentes: [],
    fuentesPorCampo: { dolorPrincipal: ["Sesión «Kickoff» del 1 oct 2026"], retosEstrategicos: ["Handoff de «Impl»"], motivacionCompra: ["Preventa · Preparación · Por qué ahora (interno de la preventa)"] },
    origenPorCampo: { dolorPrincipal: ["Sesiones"], retosEstrategicos: ["Handoff"], motivacionCompra: ["Preventa"] },
    at: "2026-10-01T12:00:00.000Z",
    origen: "Varias fuentes",
  },
};

const cuenta: DatosDeLaCuenta = {
  cliente: { nombre: "FUNDAUNA" },
  ficha,
  procesos: Array.from({ length: 8 }, (_, i) => ({
    nombre: `Proceso ${i + 1}`,
    estado: i % 2 ? ("validado" as const) : ("borrador" as const),
    queResuelve: largo(120, "Cómo entra un estudiante"),
    dolores: ["Se pierden leads", "Nadie da seguimiento"],
  })),
  proyectos: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nombre: `Proyecto ${i}`, tipo: "proyecto_temporal", estado: "completed", desde: "2026-03-01T12:00:00.000Z", tratoId: S("trato") })),
  entrega: { proyecto: "Sales Hub", texto: largo(1800, "Se dejó funcionando el pipeline de admisiones") },
  fueraDeAlcance: Array.from({ length: 10 }, (_, i) => ({ pedido: S(`fuera-de-alcance-${i}`), estado: "CONFIRMADO", proyecto: null, quienLoPidio: "Ana", fecha: "2026-10-01T12:00:00.000Z" })),
  preventa: { fecha: "2026-08-01T12:00:00.000Z", archivada: false, texto: `${S("preventa-interna")} ${largo(2900, "lo que dijo el cliente en la venta")}` },
  auditoria: { nombre: "Auditoría", fecha: "2026-09-15T12:00:00.000Z", estado: S("auditoria-estado"), hallazgos: Array.from({ length: 8 }, (_, i) => ({ seccion: "Workflows", titulo: S(`hallazgo-${i}`), hallazgo: largo(100, "workflow viejo"), decision: "Corregir" })) },
};

const proyecto: DatosDelProyecto = {
  proyecto: { nombre: "Service Hub" },
  reuniones: Array.from({ length: 16 }, (_, i) => ({
    id: `s${i}`,
    titulo: `Seguimiento ${i}`,
    fecha: `2026-10-${String(1 + i).padStart(2, "0")}T15:00:00.000Z`,
    sala: i % 3 === 2 ? ("PUERTAS ADENTRO" as const) : ("CON EL CLIENTE" as const),
    resumen: `${S("notas-de-la-reunion")} ${largo(900, "se habló del pipeline")}`,
    minuta: {
      resumen: S("resumen-de-la-minuta"),
      acuerdos: [largo(150, "Enviar la base de contactos"), "El precio queda en US$18.000"],
      decisiones: [largo(150, "Usar Sales Hub para admisiones")],
      riesgos: [S("riesgo")],
      revisada: true,
    },
  })),
  compromisos: Array.from({ length: 12 }, (_, i) => ({ titulo: S(`compromiso-${i}`), venceEl: "2026-10-15", estado: "pendiente", lado: "cliente" as const })),
  desviaciones: Array.from({ length: 8 }, (_, i) => ({
    tipo: "ATRASO",
    titulo: i % 2 ? "Se atrasó la migración" : S("desviacion-no-visible"),
    detalle: S("detalle-desviacion"),
    semanas: 2,
    fecha: "2026-10-02T12:00:00.000Z",
    visibleAlCliente: i % 2 === 1,
    sinConfirmar: false,
    cerrada: false,
    quien: S("party"),
  })),
  resultados: [{ id: "R1", resultado: S("resultado-sin-confirmar"), metrica: "", lineaBase: "", meta: "", plazo: "", quienLoNecesita: "", retos: [] } as unknown as ResultadoMedible],
};

/** Qué memoria pide cada lector (como en su archivo): la cuenta, el proyecto o las dos. El pase de cuenta no arma prompt. */
const PIDE: Record<Exclude<LectorDeMemoria, "pase-de-cuenta" | "lo-que-sabe-la-ia">, { cuenta: boolean; proyecto: boolean }> = {
  handoff: { cuenta: true, proyecto: false },
  kickoff: { cuenta: true, proyecto: true },
  diagnosis: { cuenta: true, proyecto: true },
  planning: { cuenta: true, proyecto: true },
  "tech-requirements": { cuenta: true, proyecto: true },
  implementation: { cuenta: true, proyecto: true },
  delivery: { cuenta: true, proyecto: true },
  "business-case": { cuenta: true, proyecto: false },
  avance: { cuenta: false, proyecto: true },
  "resumen-del-proyecto": { cuenta: true, proyecto: false },
  "exploracion-del-proyecto": { cuenta: true, proyecto: false },
  preventa: { cuenta: true, proyecto: false },
  correo: { cuenta: true, proyecto: false },
  vigia: { cuenta: true, proyecto: true },
};

function memoriaDe(lector: keyof typeof PIDE, yaLeidas: string[] = []): string {
  const c = CONSUMIDORES_DE_LA_MEMORIA[lector];
  const pide = PIDE[lector];
  const partes = [
    pide.cuenta ? armarMemoriaDeLaCuenta(cuenta, { alcance: c.alcance, excluirOrigenes: c.excluirOrigenes, sinPartes: c.sinPartes, proyectoActualId: "p0" }).texto : "",
    pide.proyecto ? armarMemoriaDelProyecto(proyecto, { alcance: c.alcance, yaLeidas, sinPartes: c.sinPartes }).texto : "",
  ];
  return partes.filter(Boolean).join("\n\n");
}

const LECTORES = Object.keys(PIDE) as (keyof typeof PIDE)[];

describe("⛔ la frontera, lector por lector (con las opciones del registro)", () => {
  it("lo que ve el cliente no recibe NINGÚN centinela, ni el monto de un acuerdo", () => {
    for (const lector of LECTORES.filter((l) => CONSUMIDORES_DE_LA_MEMORIA[l].alcance === "cliente")) {
      const t = memoriaDe(lector);
      expect(t.match(/SECRETO-[\w-]+/g) ?? [], lector).toEqual([]);
      expect(t, lector).not.toContain("US$18.000");
    }
  });

  it("el handoff no recibe los campos internos, la postura, la preventa ni lo que él mismo propuso", () => {
    const t = memoriaDe("handoff");
    for (const s of ["postura", "porque-apertura", "motivacion", "oportunidades", "preventa-interna", "fuera-de-alcance-0", "auditoria-estado", "propuesto-por-handoff", "propuesto-por-preventa", "trato"]) {
      expect(t, s).not.toContain(S(s));
    }
    expect(t).toContain(S("propuesto-por-sesion"));
  });

  it("la preventa no se lee a sí misma: ni su parte ni lo que ella propuso a la ficha", () => {
    const t = memoriaDe("preventa");
    expect(t).not.toContain(S("preventa-interna"));
    expect(t).not.toContain(S("propuesto-por-preventa"));
    expect(t).toContain(S("motivacion"));
  });

  it("el vigía no repite lo que ya lee por su lado (reuniones, compromisos, resultados), y sí recibe lo interno de la cuenta", () => {
    /* La edición que la pone en rojo: sacarle `sinPartes` al vigía (le llegarían dos veces las minutas y los compromisos,
       en cada corrida diaria) o darle un alcance que no es el interno (perdería lo fuera de alcance y la auditoría). */
    const t = memoriaDe("vigia");
    for (const s of ["notas-de-la-reunion", "compromiso-0", "resultado-sin-confirmar"]) expect(t, s).not.toContain(S(s));
    for (const s of ["fuera-de-alcance-0", "preventa-interna", "desviacion-no-visible", "postura"]) expect(t, s).toContain(S(s));
  });

  it("el avance no repite las reuniones que ya lee (yaLeidas)", () => {
    const t = memoriaDe("avance", proyecto.reuniones.map((r) => r.id));
    expect(t).not.toContain(S("notas-de-la-reunion"));
    expect(t).toContain(S("compromiso-0"));
  });
});

describe("el largo que suma cada lector (la medida «después», sin IA)", () => {
  const medidas = Object.fromEntries(LECTORES.map((l) => [l, memoriaDe(l).length])) as Record<keyof typeof PIDE, number>;
  it("con MEDIR=<archivo> se escribe la tabla (vitest no muestra la consola de una prueba que pasa)", () => {
    if (process.env.MEDIR) fs.writeFileSync(process.env.MEDIR, JSON.stringify(medidas, null, 2));
    expect(Object.keys(medidas)).toHaveLength(LECTORES.length);
  });

  it("nadie pasa del tope: la cuenta (6.900) más el proyecto (8.900), con sus encabezados", () => {
    for (const l of LECTORES) expect(medidas[l], l).toBeLessThanOrEqual(TOPES_DE_LA_MEMORIA.cuenta + TOPES_DE_LA_MEMORIA.proyecto + 400);
  });

  it("lo que ve el cliente suma menos que lo interno (lo recortado se nota en el largo)", () => {
    expect(medidas.kickoff).toBeLessThan(medidas.implementation);
    expect(medidas.correo).toBeLessThan(medidas["exploracion-del-proyecto"]);
  });
});
