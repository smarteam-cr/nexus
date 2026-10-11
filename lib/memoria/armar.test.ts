/**
 * lib/memoria/armar.test.ts — el armador de la memoria (puro): qué entra según el alcance, el orden, los topes y el
 * bloque vacío. La frontera con centinelas está en frontera.test.ts.
 */
import { describe, expect, it } from "vitest";
import { fichaVacia, valoresVacios, type FichaGuardada } from "@/lib/clients/ficha";
import type { ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import {
  acuerdosYDecisiones,
  armarLoEsencial,
  armarMemoriaDeLaCuenta,
  armarMemoriaDelProyecto,
  diaDeCostaRica,
  recortarAlTope,
  resumirMapa,
  ROTULO_DE_LA_MEMORIA,
  TOPES_DE_LA_MEMORIA,
} from "./armar";
import type { DatosDeLaCuenta, DatosDelProyecto, ReunionDeLaMemoria } from "./tipos";

const ficha = (valores: Partial<ReturnType<typeof valoresVacios>> = {}): FichaGuardada => ({
  ...fichaVacia(),
  valores: { ...valoresVacios(), ...valores },
  confirmadaAt: "2026-09-27T12:00:00.000Z",
  confirmadaPor: "Ana",
});

const cuenta = (o: Partial<DatosDeLaCuenta> = {}): DatosDeLaCuenta => ({
  cliente: { nombre: "FUNDAUNA" },
  ficha: ficha({ aQueSeDedica: "Fundación universitaria" }),
  procesos: [
    { nombre: "Admisiones", estado: "validado", queResuelve: "Cómo entra un estudiante", dolores: ["Se pierden leads"] },
    { nombre: "Cobros", estado: "borrador", queResuelve: "Cómo se cobra", dolores: [] },
  ],
  proyectos: [
    { id: "p2", nombre: "Service Hub", tipo: null, estado: "active", desde: "2026-09-01T12:00:00.000Z", tratoId: "999" },
    { id: "p1", nombre: "Sales Hub", tipo: "proyecto_temporal", estado: "completed", desde: "2026-03-01T12:00:00.000Z", tratoId: "888" },
  ],
  entrega: { proyecto: "Sales Hub", texto: "Se dejó funcionando el pipeline de admisiones." },
  fueraDeAlcance: [{ pedido: "Un portal de egresados", estado: "CONFIRMADO", proyecto: "Service Hub", quienLoPidio: "Ana", fecha: "2026-10-01T12:00:00.000Z" }],
  preventa: { fecha: "2026-08-01T12:00:00.000Z", archivada: true, texto: "### Presupuesto (INTERNO — nunca se cita al cliente)\n- US$20k" },
  auditoria: {
    nombre: "Auditoría de septiembre",
    fecha: "2026-09-15T12:00:00.000Z",
    estado: "El portal está a medias",
    hallazgos: [{ seccion: "Workflows", titulo: "Workflows sin dueño", hallazgo: "8 de 12 avisan a nadie", decision: "Corregir" }],
  },
  ...o,
});

const reunion = (o: Partial<ReunionDeLaMemoria> = {}): ReunionDeLaMemoria => ({
  id: o.id ?? "s1",
  titulo: "Seguimiento",
  fecha: "2026-10-01T15:00:00.000Z",
  sala: "CON EL CLIENTE",
  resumen: "Se habló del pipeline. Riesgo: el cliente no tiene datos.",
  minuta: { resumen: "Resumen de la minuta", acuerdos: ["Enviar la base"], decisiones: ["Usar Sales Hub"], riesgos: ["Sin datos"], revisada: true },
  ...o,
});

const resultado = (o: Partial<ResultadoMedible>): ResultadoMedible =>
  ({ id: "R1", resultado: "Vender más", metrica: "", lineaBase: "", meta: "20%", plazo: "", quienLoNecesita: "", retos: [], ...o }) as ResultadoMedible;

const proyecto = (o: Partial<DatosDelProyecto> = {}): DatosDelProyecto => ({
  proyecto: { nombre: "Service Hub" },
  reuniones: [reunion()],
  compromisos: [{ titulo: "Enviar la base de contactos", venceEl: "2026-10-15", estado: "pendiente", lado: "cliente" }],
  desviaciones: [
    { tipo: "ATRASO", titulo: "Se atrasó la migración", detalle: "Faltó la base", semanas: 2, fecha: "2026-10-02T12:00:00.000Z", visibleAlCliente: true, sinConfirmar: false, cerrada: false, quien: "CLIENTE" },
  ],
  resultados: [resultado({ id: "R1", resultado: "Confirmado", confirmadoAt: "2026-10-01T00:00:00.000Z" } as Partial<ResultadoMedible>), resultado({ id: "R2", resultado: "Sin confirmar" })],
  ...o,
});

describe("la memoria de la cuenta", () => {
  it("interno: el rótulo fijo y las partes en orden", () => {
    const m = armarMemoriaDeLaCuenta(cuenta(), { alcance: "interno" });
    expect(m.texto.startsWith(`=== ${ROTULO_DE_LA_MEMORIA} ===\nDe la cuenta «FUNDAUNA».`)).toBe(true);
    expect(m.partes.map((p) => p.clave)).toEqual(["ficha", "procesos", "historia", "fueraDeAlcance", "auditoria", "preventa"]);
    expect(m.partes.filter((p) => p.interno).map((p) => p.clave)).toEqual(["fueraDeAlcance", "auditoria", "preventa"]);
    expect(m.texto).toContain("trato 999");
    expect(m.texto).toContain("Cobros (borrador del agente; el cliente todavía no lo validó)");
    expect(m.texto).toContain("8 de 12 avisan a nadie → Corregir");
  });

  it("cliente: sin lo fuera de alcance, la preventa ni la auditoría; solo los procesos validados; sin ids de trato", () => {
    const m = armarMemoriaDeLaCuenta(cuenta(), { alcance: "cliente", proyectoActualId: "p2" });
    expect(m.partes.map((p) => p.clave)).toEqual(["ficha", "procesos", "historia"]);
    expect(m.texto).toContain("Admisiones (validado con el cliente): Cómo entra un estudiante");
    expect(m.texto).toContain("⚠ Dolor de hoy: Se pierden leads");
    expect(m.texto).not.toContain("Cobros");
    expect(m.texto).not.toContain("trato");
    expect(m.texto).toContain("Service Hub · en curso · desde 2026-09-01 · este proyecto");
    expect(m.texto).toContain("Lo que se entregó en «Sales Hub»");
    expect(m.texto).toContain("⛔ Va a un documento que lee el cliente");
  });

  it("sin-lo-interno: los procesos sin validar sí, lo interno no", () => {
    const m = armarMemoriaDeLaCuenta(cuenta(), { alcance: "sin-lo-interno" });
    expect(m.partes.map((p) => p.clave)).toEqual(["ficha", "procesos", "historia"]);
    expect(m.texto).toContain("Cobros (borrador del agente");
    expect(m.texto).not.toContain("trato 999");
  });

  it("sinPartes: el lector que ya tiene una parte por otro lado no la recibe", () => {
    const m = armarMemoriaDeLaCuenta(cuenta(), { alcance: "interno", sinPartes: ["preventa"] });
    expect(m.partes.map((p) => p.clave)).not.toContain("preventa");
  });

  it("la historia con un solo proyecto (el propio) y sin entrega no se manda", () => {
    const m = armarMemoriaDeLaCuenta(cuenta({ proyectos: [cuenta().proyectos[0]], entrega: null }), { alcance: "cliente", proyectoActualId: "p2" });
    expect(m.partes.map((p) => p.clave)).not.toContain("historia");
  });

  it("sin nada que decir devuelve \"\" (un bloque vacío no se manda)", () => {
    const vacia = cuenta({ ficha: fichaVacia(), procesos: [], proyectos: [], entrega: null, fueraDeAlcance: [], preventa: null, auditoria: null });
    expect(armarMemoriaDeLaCuenta(vacia, { alcance: "interno" })).toEqual({ texto: "", partes: [] });
  });

  it("los topes: cada parte con el suyo y el total no pasa del de la cuenta", () => {
    const larga = cuenta({ ficha: ficha({ aQueSeDedica: "x ".repeat(5000), dolorPrincipal: "y\n".repeat(2000) }) });
    const m = armarMemoriaDeLaCuenta(larga, { alcance: "interno" });
    const parteFicha = m.partes.find((p) => p.clave === "ficha")!;
    expect(parteFicha.caracteres).toBeLessThanOrEqual(TOPES_DE_LA_MEMORIA.partes.ficha + 40);
    expect(m.texto).toContain("(…recortado)");
    expect(m.partes.reduce((s, p) => s + p.caracteres, 0)).toBeLessThanOrEqual(TOPES_DE_LA_MEMORIA.cuenta);
  });
});

describe("la memoria del proyecto", () => {
  it("interno: lo que dejó cada reunión (también puertas adentro), los compromisos, las desviaciones con quién y todos los resultados", () => {
    const m = armarMemoriaDelProyecto(
      proyecto({ reuniones: [reunion(), reunion({ id: "s2", sala: "PUERTAS ADENTRO", resumen: "Lo dijimos entre nosotros" })] }),
      { alcance: "interno" },
    );
    expect(m.partes.map((p) => p.clave)).toEqual(["minutas", "compromisos", "desviaciones", "resultados"]);
    expect(m.texto).toContain("[CON EL CLIENTE] Seguimiento\nSe habló del pipeline.");
    expect(m.texto).toContain("[PUERTAS ADENTRO] Seguimiento\nLo dijimos entre nosotros");
    expect(m.texto).toContain("[vence 2026-10-15] Enviar la base de contactos (lo prometió el cliente · pendiente)");
    expect(m.texto).toContain("la causó: CLIENTE");
    expect(m.texto).toContain("R2 · Sin confirmar");
  });

  it("cliente: solo las reuniones CON EL CLIENTE, solo acuerdos y decisiones, sin compromisos, sin quién causó y solo lo confirmado", () => {
    const m = armarMemoriaDelProyecto(
      proyecto({
        reuniones: [reunion(), reunion({ id: "s2", sala: "PUERTAS ADENTRO" }), reunion({ id: "s3", sala: null })],
        desviaciones: [
          ...proyecto().desviaciones,
          { tipo: "COMPROMISO", titulo: "Algo que el cliente no ve", detalle: null, semanas: null, fecha: "2026-10-03T12:00:00.000Z", visibleAlCliente: false, sinConfirmar: false, cerrada: false, quien: "SMARTEAM" },
          { tipo: "ATRASO", titulo: "Propuesta sin confirmar", detalle: null, semanas: 1, fecha: "2026-10-03T12:00:00.000Z", visibleAlCliente: true, sinConfirmar: true, cerrada: false, quien: "SMARTEAM" },
        ],
      }),
      { alcance: "cliente" },
    );
    expect(m.partes.map((p) => p.clave)).toEqual(["minutas", "desviaciones", "resultados"]);
    expect(m.texto).toContain("- Decisión: Usar Sales Hub\n- Acuerdo: Enviar la base");
    expect(m.texto.match(/#### /g)).toHaveLength(1);
    expect(m.texto).not.toContain("Riesgo");
    expect(m.texto).not.toContain("Se habló del pipeline");
    expect(m.texto).toContain("Se atrasó: Se atrasó la migración (2 semanas)");
    expect(m.texto).not.toContain("la causó");
    expect(m.texto).not.toContain("Faltó la base");
    expect(m.texto).not.toContain("Algo que el cliente no ve");
    expect(m.texto).not.toContain("Propuesta sin confirmar");
    expect(m.texto).toContain("R1 · Confirmado");
    expect(m.texto).not.toContain("R2 · Sin confirmar");
  });

  it("yaLeidas: lo que el lector ya lee en su material no se repite", () => {
    const m = armarMemoriaDelProyecto(proyecto({ reuniones: [reunion({ id: "s1" }), reunion({ id: "s2", titulo: "Kickoff" })] }), {
      alcance: "interno",
      yaLeidas: ["s1"],
    });
    expect(m.texto).toContain("Kickoff");
    expect(m.texto.match(/#### /g)).toHaveLength(1);
  });

  it("como mucho las últimas 8 reuniones con contenido, cada una recortada", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => reunion({ id: `s${i}`, titulo: `R${i}`, resumen: i === 0 ? "" : "z".repeat(2000), minuta: null }));
    const m = armarMemoriaDelProyecto(proyecto({ reuniones: muchas, compromisos: [], desviaciones: [], resultados: [] }), { alcance: "interno" });
    expect(m.texto).not.toContain("· [CON EL CLIENTE] R0\n");
    // El tope de la parte puede cortar antes de 8; nunca pasa de 8.
    expect((m.texto.match(/#### /g) ?? []).length).toBeLessThanOrEqual(TOPES_DE_LA_MEMORIA.reuniones);
    expect(m.partes[0].caracteres).toBeLessThanOrEqual(TOPES_DE_LA_MEMORIA.partes.minutas + 40);
  });

  it("sin nada que decir devuelve \"\"", () => {
    expect(armarMemoriaDelProyecto(proyecto({ reuniones: [], compromisos: [], desviaciones: [], resultados: [] }), { alcance: "interno" })).toEqual({
      texto: "",
      partes: [],
    });
  });
});

describe("ayudantes", () => {
  it("acuerdosYDecisiones deja afuera los montos (salvo para lo interno)", () => {
    const m = { resumen: null, acuerdos: ["El precio queda en US$18.000", "Enviar la base"], decisiones: [], riesgos: [], revisada: false };
    expect(acuerdosYDecisiones(m)).toBe("- Acuerdo: Enviar la base");
    expect(acuerdosYDecisiones(m, { sinMontos: false })).toContain("US$18.000");
    expect(acuerdosYDecisiones(null)).toBe("");
  });

  it("recortarAlTope corta en un salto de línea y lo dice", () => {
    expect(recortarAlTope("corto", 100)).toBe("corto");
    const r = recortarAlTope("uno\ndos\ntres\ncuatro\ncinco\nseis\nsiete", 30);
    expect(r).toBe("uno\ndos\ntres\n(…recortado)");
    expect(r.length).toBeLessThanOrEqual(30);
  });

  it("diaDeCostaRica: las 5:00 UTC del 10 son el 9 en Costa Rica", () => {
    expect(diaDeCostaRica("2026-10-10T05:00:00.000Z")).toBe("2026-10-09");
  });

  it("resumirMapa: nombre, estado, qué resuelve y hasta 3 dolores de hoy", () => {
    const paso = (dolor: string) => ({ id: dolor || "x", carril: "c", texto: "t", tipo: "paso", herramienta: "", origen: "dicho", citas: [], dolor, cambio: "", reemplaza: [], enHubspot: "" });
    const mapa = {
      formato: "carriles-v1",
      id: "m",
      nombre: "Admisiones",
      area: "ventas",
      queResuelve: "Cómo entra",
      hoy: { carriles: [], pasos: [paso("a"), paso(""), paso("b"), paso("c"), paso("d")], flechas: [] },
      despues: { carriles: [], pasos: [], flechas: [], seVa: [] },
      cambios: [],
      preguntas: [],
      estado: "revisado",
      generadoEn: "",
    } as unknown as Parameters<typeof resumirMapa>[0];
    expect(resumirMapa(mapa)).toEqual({ nombre: "Admisiones", estado: "revisado", queResuelve: "Cómo entra", dolores: ["a", "b", "c"] });
  });
});

describe("lo esencial de la cuenta (el pase de cuenta)", () => {
  const f = ficha({
    aQueSeDedica: "Fundación universitaria\nCon tres sedes",
    stakeholders: "- Ana — directora — sponsor — escéptica\n- Luis — TI — usuario — a favor",
    aperturaAsesoria: "media",
    motivacionCompra: "Se lo pidió la rectoría",
  });
  const compromisos = [{ titulo: "Enviar la base", venceEl: "2026-10-15", estado: "pendiente", lado: "cliente" as const, proyecto: "Service Hub" }];
  const pedidos = [
    { pedido: "Un portal de egresados", estado: "CONFIRMADO", proyecto: null, quienLoPidio: null, fecha: "2026-10-01T00:00:00.000Z" },
    { pedido: "Ya cerrado", estado: "APROBADO", proyecto: null, quienLoPidio: null, fecha: "2026-10-01T00:00:00.000Z" },
  ];

  it("interno: la ficha en una línea por campo (lo interno marcado), las personas con su postura, los compromisos y lo abierto", () => {
    const s = armarLoEsencial({ ficha: f, compromisos, pedidos }, "interno");
    expect(s.map((x) => x.titulo)).toEqual(["Información del cliente (confirmada)", "Las personas", "Compromisos abiertos", "Pedidos fuera de alcance abiertos"]);
    expect(s[0].lineas).toEqual(["A qué se dedica: Fundación universitaria", "Apertura a la asesoría (interno): Media", "Motivación de compra (interno): Se lo pidió la rectoría"]);
    expect(s[1].lineas).toEqual(["Ana — directora — sponsor — escéptica", "Luis — TI — usuario — a favor"]);
    expect(s[2].lineas).toEqual(["Enviar la base (vence 2026-10-15) · lo prometió el cliente · Service Hub"]);
    expect(s[3].lineas).toEqual(["[Confirmada] Un portal de egresados"]);
  });

  it("fuera del alcance interno: sin campos internos, sin la postura, sin compromisos ni pedidos", () => {
    const s = armarLoEsencial({ ficha: f, compromisos, pedidos }, "cliente");
    expect(s.map((x) => x.titulo)).toEqual(["Información del cliente", "Las personas"]);
    expect(JSON.stringify(s)).not.toMatch(/rectoría|escéptica|Media|Enviar la base|portal/);
  });

  it("sin nada, sin secciones", () => {
    expect(armarLoEsencial({ ficha: fichaVacia(), compromisos: [], pedidos: [] }, "interno")).toEqual([]);
  });
});
