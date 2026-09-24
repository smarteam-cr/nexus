import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FRONTERA_DEL_MATERIAL,
  MARCA_DE_RECORTE,
  MAX_REUNIONES_A_LEER,
  PESO_DE_LAS_FUENTES,
  PISO_POR_REUNION,
  TECHO_POR_REUNION,
  TOPE_NOTAS_CRONOGRAMA,
  TOPE_REUNIONES_CRONOGRAMA,
  UMBRAL_RESUMEN_FLACO,
  bloqueDeNotasDelCronograma,
  bloqueDeReunionesDelCronograma,
  calendarioDelCronograma,
  contenidoDeReunion,
  fechaEnCostaRica,
  notasPasanElTope,
  ordenarNotasDeGemini,
  planDelMaterial,
  recortarReunion,
  repartirEspacio,
  resumenDeReunion,
  resumenDelInforme,
  ubicarEnElCronograma,
  type FotoDelCronograma,
  type ReunionElegida,
  type ReunionParaElCronograma,
  type ReunionParaRepartir,
} from "./material-cronograma";

/**
 * lib/contexto/material-cronograma.test.ts — EL MATERIAL DEL «CONTEXTO DEL CRONOGRAMA».
 *
 * Tres cosas que, si se rompen, no fallan en ningún lado:
 *  · un bloque vacío que igual lleva rótulo — el prompt de un proyecto sin material deja de ser
 *    idéntico al de antes y el modelo cree que le falta algo;
 *  · la FRONTERA fuera del rótulo — las transcripciones son internas y los títulos de tarea los lee
 *    el cliente;
 *  · un tope que la pantalla y el servidor cuentan distinto — el CSE cree que el agente leyó una
 *    nota que se cortó.
 *
 * Desde el 2026-09-23 (validación del Contexto del cronograma) también el MOTOR: qué se lee de
 * cada reunión, el reparto justo, el recorte, el calendario, la fecha y el informe que ve el CSE.
 */

const R = (over: Partial<ReunionParaElCronograma> = {}): ReunionParaElCronograma => ({
  title: "Semanal de implementación",
  date: Date.UTC(2026, 8, 10),
  prefijoDeSala: "[CON EL CLIENTE] ",
  contenido: "Se acordó mover la migración a la fase 3.",
  ...over,
});

describe("las reuniones", () => {
  it("sin reuniones con contenido, el bloque es VACÍO — sin rótulo huérfano", () => {
    expect(bloqueDeReunionesDelCronograma([])).toBe("");
    expect(bloqueDeReunionesDelCronograma([R({ contenido: null }), R({ contenido: "   " })])).toBe("");
  });

  it("lleva rótulo, la sala y la fecha de cada reunión", () => {
    const b = bloqueDeReunionesDelCronograma([R()]);
    expect(b.startsWith("=== ")).toBe(true);
    expect(b).toContain("[CON EL CLIENTE] Semanal de implementación");
    expect(b).toContain("Se acordó mover la migración a la fase 3.");
  });

  it("⭐ la FRONTERA viaja adentro del rótulo", () => {
    /* Los tres agentes que leen esto la reciben igual sin re-sembrar ningún prompt. */
    const b = bloqueDeReunionesDelCronograma([R()]);
    expect(b).toContain("material INTERNO");
    expect(b).toContain("NUNCA copies a un título de tarea");
  });

  it("el rótulo dice que las ELIGIÓ el CSE — todas, sin marca por reunión", () => {
    /* Desde el 2026-09-23 el cronograma lee SOLO lo elegido: una marca «agregada a mano» por
       reunión quedaría en todas y dejaría de decir algo. */
    const b = bloqueDeReunionesDelCronograma([R(), R({ title: "Otra" })]);
    expect(b.split("\n")[0]).toContain("QUE EL CSE ELIGIÓ PARA EL CRONOGRAMA");
    expect(b).not.toContain("a mano");
  });
});

describe("las notas", () => {
  it("sin notas, el bloque es VACÍO", () => {
    expect(bloqueDeNotasDelCronograma([])).toBe("");
    expect(bloqueDeNotasDelCronograma([{ title: "x", content: "  " }])).toBe("");
  });

  it("lleva rótulo, título y la frontera", () => {
    const b = bloqueDeNotasDelCronograma([{ title: "Cambio de prioridad", content: "Primero Service." }]);
    expect(b.startsWith("=== ")).toBe(true);
    expect(b).toContain("### Nota: Cambio de prioridad");
    expect(b).toContain("NUNCA copies a un título de tarea");
  });

  it("se recortan al tope TOTAL, y la pantalla avisa con el MISMO número", () => {
    const largas = [{ title: null, content: "x".repeat(TOPE_NOTAS_CRONOGRAMA + 500) }];
    const b = bloqueDeNotasDelCronograma(largas);
    const cuerpo = b.slice(b.indexOf("### Nota"));
    expect(cuerpo.length).toBeLessThanOrEqual(TOPE_NOTAS_CRONOGRAMA);
    expect(notasPasanElTope(largas)).toBe(true);
    expect(notasPasanElTope([{ title: "a", content: "corta" }])).toBe(false);
  });

  it("la pantalla y la ruta importan la MISMA constante, no un número escrito a mano", () => {
    /* Si alguien escribe 12000 a mano en el componente, el día que cambie el tope la pantalla
       avisa tarde (o nunca) y el CSE cree que el agente leyó lo que se cortó. */
    const raiz = process.cwd();
    for (const rel of [
      "components/canvas/CronogramaContextSection.tsx",
      "app/api/projects/[projectId]/timeline/sources/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(raiz, rel), "utf8");
      expect(src, `${rel} no usa la constante del tope`).toContain("TOPE_NOTAS_CRONOGRAMA");
      expect(src, `${rel} tiene el tope escrito a mano`).not.toMatch(/12[_.]?000/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── EL MOTOR (2026-09-23) ────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
const AHORA = Date.UTC(2026, 8, 23, 18);
const rep = (id: string, diasAtras: number, largo: number, esencial = largo): ReunionParaRepartir => ({
  id,
  date: AHORA - diasAtras * DIA,
  largo,
  esencial,
});
const suma = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** PRNG con semilla (mulberry32): el test al azar da lo mismo en cada corrida. */
function azar(semilla: number) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("⭐ el reparto JUSTO", () => {
  it("8 elegidas de 6.000: todas entran con 4.000, y la vieja NO baja a 400", () => {
    /* La escala del handoff le daba 4.000 a la más reciente y 400 a las de hace meses: el kickoff
       que el CSE eligió a propósito llegaba en dos líneas. */
    const ocho = Array.from({ length: 8 }, (_, i) => rep(`r${i}`, i === 7 ? 90 : i + 1, 6_000, 2_500));
    const espacio = repartirEspacio(ocho);
    for (const r of ocho) expect(espacio.get(r.id), r.id).toBe(4_000);
  });

  it("lo PRINCIPAL primero: la larga con poco esencial no le quita a las cortas", () => {
    const espacio = repartirEspacio([rep("A", 1, 12_000, 2_000), rep("B", 2, 5_000), rep("C", 3, 5_000)], {
      tope: 12_000,
      piso: PISO_POR_REUNION,
      techo: TECHO_POR_REUNION,
    });
    expect(espacio.get("A")).toBe(2_000);
    expect(espacio.get("B")).toBe(5_000);
    expect(espacio.get("C")).toBe(5_000);
  });

  it("lo que sobra va a las largas, no en partes iguales fijas", () => {
    const espacio = repartirEspacio([
      rep("chica", 1, 500),
      ...[2, 3, 4].map((d) => rep(`larga${d}`, d, 30_000, 2_000)),
    ]);
    expect(espacio.get("chica")).toBe(500);
    for (const d of [2, 3, 4]) expect(espacio.get(`larga${d}`)).toBe(10_500);
    expect(suma(espacio)).toBe(TOPE_REUNIONES_CRONOGRAMA);
  });

  it("nunca pasa el tope, ni el techo, ni el largo — con 200 repartos al azar (y uno de 120)", () => {
    const r = azar(20260923);
    for (let t = 0; t < 200; t++) {
      const n = t === 0 ? 120 : 1 + Math.floor(r() * 40);
      const tope = [8_000, 16_000, 32_000][Math.floor(r() * 3)];
      const reuniones = Array.from({ length: n }, (_, i) => {
        const largo = 1 + Math.floor(r() * 30_000);
        return rep(`r${i}`, Math.floor(r() * 200), largo, Math.floor(r() * largo));
      });
      const espacio = repartirEspacio(reuniones, { tope, piso: PISO_POR_REUNION, techo: TECHO_POR_REUNION });
      expect(suma(espacio)).toBeLessThanOrEqual(tope);
      for (const x of reuniones) {
        const cota = espacio.get(x.id);
        if (cota === undefined) continue;
        expect(cota).toBeLessThanOrEqual(TECHO_POR_REUNION);
        expect(cota).toBeLessThanOrEqual(x.largo);
      }
    }
  });

  it("el PISO: con 40 de 5.000 entran 32 y las 8 más viejas quedan afuera (no 40 de 800)", () => {
    const cuarenta = Array.from({ length: 40 }, (_, i) =>
      rep(`r${String(i).padStart(2, "0")}`, i + 1, 5_000, 2_000),
    );
    const espacio = repartirEspacio(cuarenta);
    expect(espacio.size).toBe(32);
    for (const x of cuarenta.slice(0, 32)) expect(espacio.get(x.id)).toBe(PISO_POR_REUNION);
    for (const x of cuarenta.slice(32)) expect(espacio.has(x.id), `${x.id} es de las más viejas`).toBe(false);
    // Y el límite de lectura alcanza para llenar el tope con el piso: leer más no suma nada.
    expect(MAX_REUNIONES_A_LEER * PISO_POR_REUNION).toBeGreaterThanOrEqual(TOPE_REUNIONES_CRONOGRAMA);
  });

  it("a la misma hora, el empate se rompe por id (el mismo material, el mismo texto)", () => {
    const topes = { tope: 1_500, piso: 1_000, techo: 12_000 };
    const a = repartirEspacio([rep("b", 1, 5_000), rep("a", 1, 5_000)], topes);
    const b = repartirEspacio([rep("a", 1, 5_000), rep("b", 1, 5_000)], topes);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    expect(a.get("a")).toBe(1_500);
    expect(a.has("b")).toBe(false);
  });
});

/** Notas de Gemini con el formato REAL (medido en las reuniones de CAV), con contenido de mentira. */
const TITULO = "Semanal de implementación";
const GEMINI = [
  TITULO,
  "Invitado      ",
  "Archivos adjuntos ",
  "Registros de la reunión  (Algunas grabaciones no están disponibles)",
  "",
  "",
  "Resumen",
  "La reunión revisó el avance de la configuración y los accesos pendientes.",
  "",
  "",
  "Decisiones",
  "Acordada",
  "La migración de contactos se hace en dos tandas.",
  "",
  "Actualizamos la sección Decisiones con tus comentarios.",
  "Danos tu opinión: Útil o Poco útil",
  "",
  "",
  "Próximos pasos",
  "[Equipo] Configurar el pipeline de ventas y compartir los accesos.",
  "",
  "",
  "Detalles",
  `Contexto del avance: ${"se conversó en detalle sobre el estado de cada integración. ".repeat(40)}`,
  "",
  "",
  "Revisa las notas de Gemini para asegurarte de que sean precisas. Obtén sugerencias y descubre cómo Gemini toma notas",
  "Cómo es la calidad de estas notas específicas? Responde una breve encuesta para darnos tu opinión; por ejemplo, cuán útiles te resultaron las notas.",
].join("\n");

describe("⭐ qué se lee de cada reunión", () => {
  it("el resumen entra ENTERO: unos «Próximos pasos» después del carácter 5.000 siguen adentro", () => {
    /* El lector del handoff cortaba el resumen en 1.500: lo accionable, al final, no llegaba nunca. */
    const overview = `${"Relleno del resumen de la reunión. ".repeat(150)}Próximos pasos: CENTINELA-PASOS.`;
    expect(overview.indexOf("CENTINELA-PASOS")).toBeGreaterThan(5_000);
    const c = resumenDeReunion({ title: "Fireflies", summary: { overview }, minuta: null });
    expect(c.texto).toContain("CENTINELA-PASOS");
    expect(c.texto.length).toBeGreaterThanOrEqual(overview.length);
  });

  it("Gemini: Decisiones y Próximos pasos PRIMERO; al recortar a lo esencial se van los Detalles", () => {
    const c = resumenDeReunion({ title: TITULO, summary: { overview: GEMINI }, minuta: null });
    const principal = c.texto.slice(0, c.esencial);
    expect(principal).toContain("**Próximos pasos:**\n[Equipo] Configurar el pipeline de ventas");
    expect(principal).toContain("**Decisiones:**");
    expect(principal, "los Detalles son la cola, no lo principal").not.toContain("Detalles");
    expect(principal.indexOf("**Decisiones:**")).toBeLessThan(principal.indexOf("**Próximos pasos:**"));
    expect(principal.indexOf("**Próximos pasos:**")).toBeLessThan(principal.indexOf("**Resumen:**"));
    // Recortado a lo esencial, conserva los pasos y pierde los Detalles.
    const recortado = recortarReunion(c.texto, c.esencial + MARCA_DE_RECORTE.length + 5);
    expect(recortado).toContain("Configurar el pipeline de ventas");
    expect(recortado).not.toContain("Contexto del avance");
    // Y los Detalles no se pierden: van al final.
    expect(c.texto).toContain("**Detalles:**");
  });

  it("sin título duplicado ni relleno de Gemini", () => {
    const c = resumenDeReunion({ title: TITULO, summary: { overview: GEMINI }, minuta: null });
    const b = bloqueDeReunionesDelCronograma([R({ title: TITULO, contenido: c.texto })]);
    expect(b.split(TITULO).length - 1, "el título tiene que aparecer una sola vez").toBe(1);
    for (const relleno of [
      "### Sesión:",
      "Invitado",
      "Archivos adjuntos",
      "Registros de la reunión",
      "Actualizamos la sección",
      "Danos tu opinión",
      "Revisa las notas de Gemini",
      "Cómo es la calidad de estas notas",
    ]) {
      expect(b, relleno).not.toContain(relleno);
    }
  });

  it("un formato que no reconoce pasa LIMPIO y entero, sin reordenar", () => {
    const g = ordenarNotasDeGemini("Primera idea.\nSegunda idea.\nTercera idea.", "Otra reunión");
    expect(g).toEqual({ principal: "Primera idea.\nSegunda idea.\nTercera idea.", detalle: "", conPasos: false });
  });

  it("los compromisos de Gemini no se duplican con sus Próximos pasos; los de Fireflies sí entran", () => {
    const gemini = resumenDeReunion({
      title: TITULO,
      summary: { overview: GEMINI, action_items: ["CENTINELA-COMPROMISO"] },
      minuta: null,
    });
    expect(gemini.texto).not.toContain("CENTINELA-COMPROMISO");
    const fireflies = resumenDeReunion({
      title: "Llamada",
      summary: { overview: "Se habló del alcance.", action_items: "CENTINELA-COMPROMISO", keywords: ["alcance"] },
      minuta: null,
    });
    expect(fireflies.texto).toContain("**Compromisos:**\nCENTINELA-COMPROMISO");
    // Los temas clave son cola: fuera de lo principal.
    expect(fireflies.texto.slice(0, fireflies.esencial)).not.toContain("Temas clave");
    expect(fireflies.texto).toContain("**Temas clave:** alcance");
  });

  it("la MINUTA cuenta: sola da contenido, y la revisada va antes que Gemini", () => {
    const minuta = {
      summary: "CENTINELA-MINUTA: se cerró el alcance.",
      decisions: [{ text: "Arrancar por marketing" }],
      agreements: ["El cliente comparte accesos"],
      risks: null,
      status: "REVIEWED",
    };
    const sola = resumenDeReunion({ title: "x", summary: null, minuta });
    expect(sola.texto).toContain("CENTINELA-MINUTA");
    expect(sola.texto).toContain("- Arrancar por marketing");
    expect(sola.texto).toContain("- El cliente comparte accesos");
    expect(sola.esencial).toBe(sola.texto.length);

    const conGemini = resumenDeReunion({ title: TITULO, summary: { overview: GEMINI }, minuta });
    expect(conGemini.texto.indexOf("CENTINELA-MINUTA")).toBeLessThan(conGemini.texto.indexOf("**Decisiones:**"));
    // En borrador vale menos que las notas de la reunión: va después.
    const borrador = resumenDeReunion({
      title: TITULO,
      summary: { overview: GEMINI },
      minuta: { ...minuta, status: "DRAFT" },
    });
    expect(borrador.texto.indexOf("CENTINELA-MINUTA")).toBeGreaterThan(borrador.texto.indexOf("**Decisiones:**"));
  });

  it("el transcript entra SOLO si el resumen es flaco", () => {
    const TRANSCRIPT = "CENTINELA-TRANSCRIPT hola a todos";
    const gordo = resumenDeReunion({ title: "x", summary: { overview: "a".repeat(3_000) }, minuta: null });
    expect(contenidoDeReunion(gordo, TRANSCRIPT).texto).not.toContain("Transcripción (extracto)");
    const flaco = resumenDeReunion({ title: "x", summary: { overview: "b".repeat(200) }, minuta: null });
    const conT = contenidoDeReunion(flaco, TRANSCRIPT);
    expect(conT.texto).toContain("**Transcripción (extracto):**\nCENTINELA-TRANSCRIPT");
    expect(conT.esencial).toBeGreaterThan(flaco.esencial);
    // Sin resumen, el transcript es todo lo que hay.
    const nada = contenidoDeReunion({ texto: "", esencial: 0 }, TRANSCRIPT);
    expect(nada.texto).toContain("CENTINELA-TRANSCRIPT");
    expect(nada.esencial).toBe(nada.texto.length);
    expect(UMBRAL_RESUMEN_FLACO).toBe(1_500);
  });

  it("el recorte lleva su marca ADENTRO de la cota y corta en un salto de línea", () => {
    const largo = Array.from({ length: 200 }, (_, i) => `Línea ${i} del contenido de la reunión.`).join("\n");
    const r = recortarReunion(largo, 1_000);
    expect(r.length).toBeLessThanOrEqual(1_000);
    expect(r.endsWith("[… sigue, recortado por espacio]")).toBe(true);
    expect(r.slice(0, -MARCA_DE_RECORTE.length).endsWith("reunión.")).toBe(true);
    expect(recortarReunion("corto", 1_000)).toBe("corto");
  });
});

describe("⭐ la fecha es la de Costa Rica, aunque el servidor corra en UTC", () => {
  it("un instante de las 10 p. m. en Costa Rica es de ESE día", () => {
    const antes = process.env.TZ;
    process.env.TZ = "UTC"; // el VPS
    try {
      const noche = Date.UTC(2026, 8, 23, 4); // martes 22 sep, 10 p. m. en Costa Rica
      expect(fechaEnCostaRica(noche)).toBe("22 sep 2026");
      expect(fechaEnCostaRica(noche, "larga")).toBe("martes 22 de septiembre de 2026");
      expect(bloqueDeReunionesDelCronograma([R({ date: noche })])).toContain(
        "Semanal de implementación — 22 sep 2026",
      );
    } finally {
      if (antes === undefined) delete process.env.TZ;
      else process.env.TZ = antes;
    }
  });
});

describe("⭐ el calendario: uno solo, con el weekIndex dicho explícito", () => {
  // A(1) · B(2) · C(2) · D(2) fijada en la semana 2 del proyecto, en paralelo con B.
  const FOTO: FotoDelCronograma = {
    anchorStartDate: "2026-09-21T00:00:00.000Z",
    phases: [
      { id: "fA", name: "A", durationWeeks: 1, startWeek: null, status: "DONE", hechas: 3, total: 3 },
      { id: "fB", name: "B", durationWeeks: 2, startWeek: null, status: "IN_PROGRESS", hechas: 2, total: 6 },
      { id: "fC", name: "C", durationWeeks: 2, startWeek: null },
      { id: "fD", name: "D", durationWeeks: 2, startWeek: 1 },
    ],
  };
  const ubicar = (ms: number) => ubicarEnElCronograma(FOTO, ms);

  it("ubica una reunión en su fase y semana, con las fases en paralelo", () => {
    const u = ubicar(Date.UTC(2026, 8, 30, 15)); // miércoles 30 sep
    expect(u.startsWith("semana 2 del proyecto: ")).toBe(true);
    expect(u).toContain("«B», su semana 1 de 2 (weekIndex 0)");
    expect(u, "la fase fijada con startWeek corre en paralelo").toContain("«D», su semana 1 de 2 (weekIndex 0)");
  });

  it("antes del arranque, después del cierre, y el día en Costa Rica", () => {
    expect(ubicar(Date.UTC(2026, 8, 15, 15))).toBe("antes del arranque del plan");
    // Cierre = semana 5 (C termina ahí; D, en paralelo, antes). Sumando duraciones sería la semana 7.
    expect(ubicar(Date.UTC(2026, 9, 26, 15))).toBe("después del cierre planificado");
    // Domingo 27 sep a las 9 p. m. en Costa Rica (ya lunes en UTC): sigue siendo la semana 1.
    expect(ubicar(Date.UTC(2026, 8, 28, 3))).toBe("semana 1 del proyecto: «A», su semana 1 de 1 (weekIndex 0)");
  });

  it("sin ancla no hay dónde ubicar: bloque vacío (salvo con ids, y sin fechas) y ubicar vacío", () => {
    const sinAncla = { ...FOTO, anchorStartDate: null };
    expect(calendarioDelCronograma(sinAncla, AHORA)).toBe("");
    expect(ubicarEnElCronograma(sinAncla, AHORA)).toBe("");
    const conIds = calendarioDelCronograma(sinAncla, AHORA, { conIds: true });
    expect(conIds).toContain("Sin fecha de arranque");
    expect(conIds).toContain("[id: fB]");
    expect(conIds, "sin ancla no se inventan fechas").not.toMatch(/, desde el \d/);
    expect(calendarioDelCronograma({ ...FOTO, phases: [] }, AHORA)).toBe("");
  });

  it("cada semana dice su weekIndex, su semana del proyecto y su fecha — sin «Hoy» por defecto", () => {
    const cal = calendarioDelCronograma(FOTO, AHORA);
    expect(cal.startsWith("=== CALENDARIO DEL CRONOGRAMA ACTUAL")).toBe(true);
    expect(cal).toContain("2. B — semanas 2–3 del proyecto");
    expect(cal).toContain("   · semana 1 de la fase (weekIndex 0) = semana 2 del proyecto, desde el 28 sep");
    expect(cal).toContain("   · semana 2 de la fase (weekIndex 1) = semana 3 del proyecto, desde el 5 oct");
    expect(cal).toContain("Arranque del plan: 21 sep 2026 · cierre planificado: 26 oct 2026 (5 semanas).");
    expect(cal).toContain("⛔ No escribas fechas ni plazos en ningún título, nota ni nombre de fase");
    expect(cal, "el detalle va SIN hoy").not.toContain("Hoy:");
    expect(cal, "sin conIds no hay ids").not.toContain("[id:");
  });

  it("con opciones suma Hoy, ids y estado (lo que usa quien revisa fases)", () => {
    const cal = calendarioDelCronograma(FOTO, AHORA, { conIds: true, conEstado: true, conHoy: true });
    expect(cal).toContain("Hoy: 23 sep 2026 — semana 1 del proyecto: «A», su semana 1 de 1 (weekIndex 0).");
    expect(cal).toContain("Que una semana ya haya pasado no quiere decir que su trabajo esté hecho.");
    expect(cal).toContain(
      "2. B [id: fB] — semanas 2–3 del proyecto · arranca tras la anterior · en curso · 2/6 tareas hechas",
    );
    expect(cal).toContain("4. D [id: fD] — semanas 2–3 del proyecto · fijada en la semana 2 del proyecto");
  });
});

describe("⭐ la frontera y el peso de las fuentes van en los rótulos", () => {
  it("los dos rótulos llevan LA frontera, que nombra títulos, notas y nombres de fase", () => {
    for (const b of [
      bloqueDeReunionesDelCronograma([R()]),
      bloqueDeNotasDelCronograma([{ title: "n", content: "x" }]),
    ]) {
      expect(b).toContain(FRONTERA_DEL_MATERIAL);
    }
    for (const trozo of ["NUNCA copies a un título de tarea", "sus notas", "nombre de una fase", "fechas", "de dónde salió"]) {
      expect(FRONTERA_DEL_MATERIAL, trozo).toContain(trozo);
    }
  });

  it("el rótulo de reuniones es NEUTRAL y lleva el orden de peso", () => {
    /* Lo leen agentes con trabajos distintos: uno arma tareas, otro revisa fases, el chat conversa.
       Un rótulo que habla de tareas le dice al revisor de fases que proponga tareas. */
    const b = bloqueDeReunionesDelCronograma([R()]);
    expect(b).toContain(PESO_DE_LAS_FUENTES);
    expect(b).not.toContain("qué tareas hay");
    expect(b).not.toContain("cuáles son reuniones con el cliente");
    expect(PESO_DE_LAS_FUENTES).toContain("las instrucciones del CSE mandan sobre todo");
    expect(PESO_DE_LAS_FUENTES).toContain("gana lo más reciente");
  });

  it("la ubicación en el plan va en el encabezado; sin ella, el encabezado es el de siempre", () => {
    const mediodia = Date.UTC(2026, 8, 10, 18);
    const con = bloqueDeReunionesDelCronograma([
      R({ date: mediodia, ubicacion: "semana 2 del proyecto: «B», su semana 1 de 2 (weekIndex 0)" }),
    ]);
    expect(con).toContain("— 10 sep 2026 · semana 2 del proyecto: «B»");
    expect(bloqueDeReunionesDelCronograma([R({ date: mediodia })])).toContain(
      "[CON EL CLIENTE] Semanal de implementación — 10 sep 2026\n",
    );
  });
});

describe("⭐ el plan: el informe que ve el CSE sale del MISMO plan que arma el bloque", () => {
  /** Renglones de 99 caracteres, sin blanco al final: el recorte tiene saltos de línea donde cortar. */
  const renglones = (n: number) =>
    Array.from({ length: Math.ceil(n / 100) }, () => "p".repeat(99))
      .join("\n")
      .slice(0, n)
      .replace(/\n$/, "p");
  /** Lo principal, un fin de párrafo y la cola: como lo arma `resumenDeReunion`. */
  const leida = (id: string, diasAtras: number, largo: number, esencial = largo): ReunionElegida => {
    const principal = `${id} ${renglones(esencial - id.length - 1)}`;
    const texto = esencial < largo ? `${principal}\n\n${"c".repeat(largo - esencial - 2)}` : principal;
    return {
      id,
      title: `Reunión ${id}`,
      date: AHORA - diasAtras * DIA,
      prefijoDeSala: "",
      lectura: { tipo: "leida", texto, esencial },
    };
  };
  const elegidas: ReunionElegida[] = [
    leida("chica", 1, 800),
    leida("mediana", 2, 6_000, 1_000),
    leida("grande", 3, 9_000, 8_000),
    leida("vieja", 30, 2_000),
    { id: "vacia", title: "Reunión vacia", date: AHORA - 4 * DIA, prefijoDeSala: "", lectura: { tipo: "leida", texto: "  ", esencial: 0 } },
    { id: "agendada", title: "Reunión agendada", date: AHORA + 2 * DIA, prefijoDeSala: "", lectura: { tipo: "futura" } },
    { id: "sinleer", title: "Reunión sinleer", date: AHORA - 90 * DIA, prefijoDeSala: "", lectura: { tipo: "sin-leer" } },
  ];
  const plan = planDelMaterial({
    elegidas,
    notas: [{ title: "Nota", content: "Una nota del CSE." }],
    topeReuniones: 9_500,
  });
  const bloque = bloqueDeReunionesDelCronograma(plan.reuniones);
  const por = (id: string) => plan.informe.reuniones.find((r) => r.sessionId === id)!;

  it("cada completa o recortada está en el bloque con `entran` = su largo; las demás, no", () => {
    // La grande se corta en un salto de línea, por DEBAJO de su cota: `entran` no es la cota.
    expect(por("grande").entran).toBeLessThan(por("grande").caracteres);
    for (const inf of plan.informe.reuniones) {
      const enElBloque = plan.reuniones.find((r) => r.title === inf.title);
      if (inf.estado === "completa" || inf.estado === "recortada") {
        expect(enElBloque, inf.sessionId).toBeDefined();
        expect(enElBloque!.contenido!.length, inf.sessionId).toBe(inf.entran);
        expect(bloque).toContain(enElBloque!.contenido!);
      } else {
        expect(enElBloque, inf.sessionId).toBeUndefined();
        expect(bloque, inf.sessionId).not.toContain(inf.title);
        expect(inf.entran).toBe(0);
      }
    }
    expect([...plan.sesionesUsadas].sort()).toEqual(
      plan.informe.reuniones
        .filter((r) => r.estado === "completa" || r.estado === "recortada")
        .map((r) => r.sessionId)
        .sort(),
    );
  });

  it("las que no entran por espacio salen «afuera» en el informe y su título no llega al bloque", () => {
    const cuarenta = Array.from({ length: 40 }, (_, i) => leida(`r${String(i).padStart(2, "0")}`, i + 1, 5_000, 2_000));
    const p = planDelMaterial({ elegidas: cuarenta });
    const b = bloqueDeReunionesDelCronograma(p.reuniones);
    const afuera = p.informe.reuniones.filter((r) => r.estado === "afuera");
    expect(afuera.map((r) => r.sessionId)).toEqual(["r32", "r33", "r34", "r35", "r36", "r37", "r38", "r39"]);
    for (const r of afuera) {
      expect(r.caracteres).toBe(5_000);
      expect(b).not.toContain(`${r.title} —`);
    }
    expect(p.sesionesUsadas).toHaveLength(32);
  });

  it("cada estado sale donde corresponde", () => {
    expect(por("vieja").estado).toBe("completa");
    expect(por("chica").estado).toBe("completa");
    expect(por("mediana").estado).toBe("recortada");
    expect(por("mediana").cortaLoEsencial, "entra lo principal").toBe(false);
    expect(por("grande").estado).toBe("recortada");
    expect(por("grande").cortaLoEsencial).toBe(true);
    expect(por("vacia").estado).toBe("sin-contenido");
    expect(por("agendada").estado).toBe("futura");
    expect(por("sinleer").estado).toBe("afuera");
    // El informe va de la más reciente a la más vieja; el bloque, en orden cronológico.
    expect(plan.informe.reuniones[0].sessionId).toBe("agendada");
    expect(plan.reuniones.map((r) => r.title)).toEqual(
      [...plan.reuniones].sort((a, b) => a.date - b.date).map((r) => r.title),
    );
  });

  it("el material interno es lo que entró (reuniones recortadas + notas), y los conteos salen del informe", () => {
    expect(plan.materialInterno).toEqual([
      ...plan.reuniones.map((r) => r.contenido),
      "### Nota: Nota\nUna nota del CSE.",
    ]);
    expect(resumenDelInforme(plan.informe)).toEqual({
      elegidas: 7,
      entran: 4,
      completas: 2,
      recortadas: 2,
      cortanLoEsencial: 1,
      afuera: 1,
      sinContenido: 1,
      futuras: 1,
      notas: 1,
      notasRecortadas: false,
    });
    expect(resumenDelInforme(null).elegidas).toBe(0);
  });
});
