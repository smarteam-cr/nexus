/**
 * lib/analizador-venta/en-la-preventa.test.ts — el análisis de la venta, en la preventa (2026-10-27, la noche 2): S4 (la
 * autoevaluación de cada sesión), S5 (la lectura de conjunto del prospecto), S7 (la tendencia de cada vendedor) y el
 * alcance del juicio de exploración acotado al área de la sesión.
 */
import { describe, expect, it } from "vitest";
import type { Juicio, ResultadoDelAnalisis } from "./analisis";
import { leerElAnalisis } from "./analisis";
import { alcanceDeLaSesion, type AreaParaElAlcance } from "./alcance";
import { lecturaDeConjunto, type SesionParaElConjunto } from "./conjunto";
import type { QuienHablo } from "./quien-hablo";
import { RevisionSchema } from "./schema";
import { continuidadDelSiguientePaso, equipoDeLaDimension, loDeLaSesion, loQueFaltoPorEquipo, siguientePasoConFecha } from "./revision";
import { atribuirLaReunion, delEquipoQueHablo, mesEnCostaRica, tendenciaPorVendedor, vendedoresAtribuidos, type ReunionParaLaTendencia } from "./tendencia";

const cita = { turno: 3, hablante: "Andrés Pinzón", texto: "¿cuánto les cuesta hoy ese reporte?" };
const j = (o: Partial<Juicio> & Pick<Juicio, "punto" | "valor">): Juicio => ({ etapa: null, dimension: null, lectura: "Lectura.", citas: [], porAusencia: false, ...o });

const RESULTADO: ResultadoDelAnalisis = {
  resumen: "Se fue rápido a las licencias.",
  juicios: [
    j({ punto: "consultiva", valor: "poco", citas: [cita] }),
    j({ punto: "posicion", valor: "vendedor_de_licencias", citas: [cita] }),
    j({ punto: "exploracion", valor: "explorado", dimension: "Captación de leads", citas: [cita] }),
    j({ punto: "exploracion", valor: "tocado", dimension: "Seguimiento de oportunidades", citas: [cita] }),
    j({ punto: "exploracion", valor: "sin_explorar", dimension: "Pronóstico de ventas", porAusencia: true }),
    j({ punto: "etapa", valor: "se_salto", etapa: "explorar", porAusencia: true }),
    j({ punto: "etapa", valor: "se_hizo", etapa: "identificar", citas: [cita] }),
    j({ punto: "siguiente_paso", valor: "sin_duenio", citas: [cita] }),
  ],
  recomendaciones: [{ texto: "Pregunta cuánto les cuesta hoy no tener el pronóstico.", citas: [] }],
};

const quien = (cliente: number, personas: QuienHablo["personas"] = []): QuienHablo => ({
  fuente: "transcripcion",
  total: 100,
  smarteam: { palabras: 100 - cliente, porcentaje: 100 - cliente },
  cliente: { palabras: cliente, porcentaje: cliente },
  personas,
});

describe("S4 · la autoevaluación de la sesión", () => {
  it("resume la sesión: lo explorado, lo que solo se tocó (con su cita), lo que no se tocó y la etapa que se saltó", () => {
    const lo = loDeLaSesion(RESULTADO);
    expect(lo.exploradas).toEqual(["Captación de leads"]);
    expect(lo.tocadas).toEqual([{ dimension: "Seguimiento de oportunidades", lectura: "Lectura.", citas: [cita] }]);
    expect(lo.sinExplorar.map((x) => x.dimension)).toEqual(["Pronóstico de ventas"]);
    expect(lo.etapasFlojas.map((e) => [e.etapa, e.valor])).toEqual([["explorar", "se_salto"]]);
    expect(lo.siguientePaso?.valor).toBe("sin_duenio");
    expect(siguientePasoConFecha(lo.siguientePaso)).toBe(true);
    expect(siguientePasoConFecha({ valor: "sin_fecha" })).toBe(false);
  });

  it("lo que faltó explorar va con su equipo y agrupado por equipo; en cada grupo, lo tocado primero", () => {
    const areas = [
      { id: "1", nombre: "Ventas", dimensiones: [{ nombre: "Seguimiento de oportunidades" }, { nombre: "Pronóstico", nombreGeneral: "Pronóstico de ventas" }] },
      { id: "2", nombre: "Marketing", dimensiones: [{ nombre: "Medición de campañas" }] },
      { id: "3", nombre: "Servicio", dimensiones: [{ nombre: "Tiempo de respuesta" }] },
    ];
    expect(equipoDeLaDimension("pronostico de VENTAS", { equipo: null, areas })).toBe("Ventas");
    expect(equipoDeLaDimension("Medición de campañas", { equipo: "ventas", areas })).toBe("Marketing");
    // Un tema del equipo de la sesión es de ese equipo; lo que no se reconoce cae en el equipo de la sesión, o en ninguno.
    expect(equipoDeLaDimension("Cómo está armado", { equipo: "ventas", areas: [] })).toBe("Ventas");
    expect(equipoDeLaDimension("Algo raro", { equipo: null, areas })).toBeNull();
    // El equipo de servicio se nombra como su área de la escala: sus temas y sus dimensiones quedan en el mismo grupo.
    expect(equipoDeLaDimension("Cómo está armado", { equipo: "servicio", areas })).toBe("Servicio");
    expect(equipoDeLaDimension("Tiempo de respuesta", { equipo: "servicio", areas })).toBe("Servicio");
    const lo = {
      tocadas: [
        { dimension: "Medición de campañas", lectura: "Se mencionó.", citas: [cita] },
        { dimension: "Seguimiento de oportunidades", lectura: "Se mencionó.", citas: [] },
      ],
      // Juzgada dos veces: sale una sola, la tocada.
      sinExplorar: [{ dimension: "Pronóstico de ventas", lectura: "No se tocó." }, { dimension: "medicion de campañas", lectura: "Otra vez." }],
    };
    const g = loQueFaltoPorEquipo(lo, (d) => equipoDeLaDimension(d, { equipo: null, areas }));
    expect(g.map((x) => [x.equipo, x.items.map((i) => [i.dimension, i.estado])])).toEqual([
      ["Marketing", [["Medición de campañas", "tocado"]]],
      ["Ventas", [["Seguimiento de oportunidades", "tocado"], ["Pronóstico de ventas", "sin_explorar"]]],
    ]);
    expect(g[0].items[0].cita).toEqual(cita);
    expect(g[1].items[1].cita).toBeNull();
  });

  it("las rutas validan el cuerpo: los comentarios se fueron y confirmar pide el análisis que se leyó", () => {
    // Elías quitó los comentarios del vendedor (27 oct): la acción ya no existe.
    expect(RevisionSchema.safeParse({ accion: "comentar", sessionId: "s1", tipo: "discrepa", texto: "No estoy de acuerdo" }).success).toBe(false);
    const leido = "2026-10-27T15:00:00.000Z";
    expect(RevisionSchema.safeParse({ accion: "confirmar", sessionId: "s1", analizadoAt: leido, nota: "Bien" }).success).toBe(true);
    expect(RevisionSchema.safeParse({ accion: "confirmar", sessionId: "s1", analizadoAt: leido }).success).toBe(true);
    // Sin la fecha del análisis que se leyó no se confirma: podría caer sobre uno que nadie leyó.
    expect(RevisionSchema.safeParse({ accion: "confirmar", sessionId: "s1" }).success).toBe(false);
    expect(RevisionSchema.safeParse({ accion: "confirmar", sessionId: "s1", analizadoAt: leido, nota: "x".repeat(1001) }).success).toBe(false);

    expect(RevisionSchema.safeParse({ accion: "borrar", sessionId: "s1" }).success).toBe(false);
  });

  it("si el siguiente paso tuvo continuidad: otra reunión en los 21 días siguientes, sin IA", () => {
    const fecha = "2026-10-01T15:00:00Z";
    const ahora = new Date("2026-11-30T00:00:00Z");
    const paso = { valor: "con_fecha_y_duenio" };
    expect(continuidadDelSiguientePaso({ siguientePaso: null, fecha, despues: [], ahora }).tipo).toBe("sin_paso");
    expect(continuidadDelSiguientePaso({ siguientePaso: { valor: "ninguno" }, fecha, despues: [], ahora }).tipo).toBe("sin_paso");
    expect(continuidadDelSiguientePaso({ siguientePaso: paso, fecha, despues: ["2026-09-01T00:00:00Z", fecha, "2026-10-08T15:00:00Z"], ahora })).toMatchObject({ tipo: "hubo", dias: 7 });
    expect(continuidadDelSiguientePaso({ siguientePaso: paso, fecha, despues: ["2026-11-10T15:00:00Z"], ahora })).toMatchObject({ tipo: "tarde", dias: 40 });
    expect(continuidadDelSiguientePaso({ siguientePaso: paso, fecha, despues: [], ahora }).tipo).toBe("no_hubo");
    expect(continuidadDelSiguientePaso({ siguientePaso: paso, fecha, despues: [], ahora: new Date("2026-10-10T00:00:00Z") }).tipo).toBe("pendiente");
  });
});

describe("S5 · la lectura de conjunto del prospecto", () => {
  const enJuego = [
    { nombre: "Captación de leads", area: "Ventas", diagnosticada: false },
    { nombre: "Seguimiento de oportunidades", area: "Ventas", diagnosticada: false },
    { nombre: "Pronóstico de ventas", area: "Ventas", diagnosticada: false },
    { nombre: "Reportería", area: "Ventas", diagnosticada: true },
  ];
  const conAndres = (cliente: number) => quien(cliente, [{ nombre: "Andrés Pinzón", correo: "andres@smarteamcr.com", lado: "smarteam", palabras: 100 - cliente, porcentaje: 100 - cliente }]);
  const sesion = (o: Partial<SesionParaElConjunto>): SesionParaElConjunto => ({ conTranscripcion: true, quienHablo: conAndres(30), resultado: RESULTADO, confirmado: false, ...o });

  it("falta lo que ninguna sesión exploró y la escala no tiene confirmado; lo tocado va aparte; lo confirmado con evidencia no falta", () => {
    const c = lecturaDeConjunto([sesion({}), sesion({ resultado: null, conTranscripcion: false, quienHablo: null })], enJuego);
    expect(c.reuniones).toBe(2);
    expect(c.conTranscripcion).toBe(1);
    expect(c.analizadas).toBe(1);
    expect(c.falta.sinTocar.map((d) => d.nombre)).toEqual(["Pronóstico de ventas"]);
    expect(c.falta.soloTocadas.map((d) => d.nombre)).toEqual(["Seguimiento de oportunidades"]);
    // «explorar» se saltó en la única analizada; investigar, conectar y asesorar ni se juzgaron.
    expect(c.falta.etapas.map((e) => e.id)).toEqual(["investigar", "conectar", "explorar", "asesorar"]);
    expect(c.clienteHablo).toBe(30);
    expect(c.frase).toContain("más a la solución que al diagnóstico");
    expect(c.frase).toContain("vendedor de licencias");
    expect(c.frase).toContain("faltan 2 dimensiones");
  });

  it("por nombre, sin tildes ni mayúsculas: el modelo nombra la dimensión como se la pasó el material", () => {
    const c = lecturaDeConjunto([sesion({ resultado: { ...RESULTADO, juicios: [j({ punto: "exploracion", valor: "explorado", dimension: "PRONOSTICO de ventas", citas: [cita] })] } })], enJuego);
    expect(c.falta.sinTocar.map((d) => d.nombre)).not.toContain("Pronóstico de ventas");
  });

  it("quién habló cuenta solo si Nexus reconoció a alguien del equipo (si no, todo saldría «del cliente»)", () => {
    expect(lecturaDeConjunto([sesion({ quienHablo: quien(100) }), sesion({ quienHablo: conAndres(40) })], enJuego).clienteHablo).toBe(40);
  });

  it("sin áreas en juego no dice «no falta nada»", () => {
    const c = lecturaDeConjunto([sesion({})], []);
    expect(c.frase).toContain("no se sabe qué falta diagnosticar");
    expect(c.frase).not.toContain("No quedan dimensiones");
  });

  it("sin reuniones o sin análisis, lo dice en vez de inventar", () => {
    expect(lecturaDeConjunto([], enJuego).frase).toContain("Todavía no hay reuniones");
    const sinAnalisis = lecturaDeConjunto([sesion({ resultado: null })], enJuego);
    expect(sinAnalisis.frase).toContain("ninguna analizada");
    expect(sinAnalisis.falta.etapas).toEqual([]);
  });
});

describe("S7 · la tendencia de cada vendedor", () => {
  const ANDRES = "andres@smarteamcr.com";
  const LIZ = "liz@smarteamcr.com";
  const VENTAS = new Set([ANDRES]);

  it("se atribuye por quién habló; sin transcripción, por la invitación menos quien la rechazó; nunca por la asistencia", () => {
    expect(atribuirLaReunion({ calendario: [ANDRES, LIZ], rechazaron: new Set(), hablaron: [LIZ.toUpperCase()] })).toEqual([LIZ]);
    expect(atribuirLaReunion({ calendario: [ANDRES, LIZ], rechazaron: new Set([LIZ]), hablaron: null })).toEqual([ANDRES]);
    // Con transcripción pero sin nadie del equipo reconocido: vuelve al calendario.
    expect(atribuirLaReunion({ calendario: [ANDRES], rechazaron: new Set(), hablaron: [] })).toEqual([ANDRES]);
    // El vendedor es el de Ventas; sin nadie de Ventas, todos los del equipo.
    expect(vendedoresAtribuidos({ calendario: [ANDRES, LIZ], rechazaron: new Set(), hablaron: [ANDRES, LIZ] }, VENTAS)).toEqual([ANDRES]);
    expect(vendedoresAtribuidos({ calendario: [LIZ], rechazaron: new Set(), hablaron: null }, VENTAS)).toEqual([LIZ]);
    const q = quien(60, [
      { nombre: "Andrés Pinzón", correo: ANDRES, lado: "smarteam", palabras: 40, porcentaje: 40 },
      { nombre: "Pablo", correo: null, lado: "cliente", palabras: 60, porcentaje: 60 },
    ]);
    expect(delEquipoQueHablo(q)).toEqual([ANDRES]);
    expect(delEquipoQueHablo({ ...q, fuente: "nada" })).toBeNull();
  });

  it("lo que juzga el análisis cuenta solo si alguien lo confirmó; quién habló y la transcripción cuentan siempre; mes a mes", () => {
    const habla = quien(70, [{ nombre: "Andrés", correo: ANDRES, lado: "smarteam", palabras: 30, porcentaje: 30 }]);
    const reuniones: ReunionParaLaTendencia[] = [
      { fecha: "2026-09-10T15:00:00Z", vendedores: [ANDRES], conTranscripcion: true, quienHablo: habla, analisis: { resultado: RESULTADO, confirmado: true } },
      { fecha: "2026-10-10T15:00:00Z", vendedores: [ANDRES], conTranscripcion: true, quienHablo: habla, analisis: { resultado: RESULTADO, confirmado: false } },
      { fecha: "2026-10-12T15:00:00Z", vendedores: [ANDRES, LIZ], conTranscripcion: false, quienHablo: null, analisis: null },
    ];
    const [andres, liz] = tendenciaPorVendedor(reuniones);
    expect(andres.correo).toBe(ANDRES);
    expect(andres.reuniones).toBe(3);
    expect(andres.conTranscripcion).toBe(2);
    expect(andres.hablo).toBe(30);
    expect(andres.clienteHablo).toBe(70);
    expect(andres.confirmadas).toBe(1);
    // De la confirmada: 1 de 3 dimensiones exploradas a fondo, y el siguiente paso con fecha.
    expect(andres.exploro).toBe(33);
    expect(andres.conFecha).toEqual({ con: 1, de: 1 });
    expect(andres.porMes.map((m) => [m.mes, m.reuniones, m.confirmadas])).toEqual([
      ["2026-09", 1, 1],
      ["2026-10", 2, 0],
    ]);
    expect(andres.porMes[1].exploro).toBeNull();
    expect(liz.reuniones).toBe(1);
    expect(liz.hablo).toBeNull();
  });

  it("una transcripción sin nadie del equipo reconocido no cuenta para «cuánto habló» (no es un 0 % del vendedor)", () => {
    const [andres] = tendenciaPorVendedor([
      { fecha: "2026-10-10T15:00:00Z", vendedores: [ANDRES], conTranscripcion: true, quienHablo: quien(100), analisis: null },
      { fecha: "2026-10-11T15:00:00Z", vendedores: [ANDRES], conTranscripcion: true, quienHablo: quien(60, [{ nombre: "Andrés", correo: ANDRES, lado: "smarteam", palabras: 40, porcentaje: 40 }]), analisis: null },
    ]);
    expect(andres).toMatchObject({ reuniones: 2, conTranscripcion: 2, hablo: 40, clienteHablo: 60 });
  });


  it("el mes es el de Costa Rica: la reunión de las 9 de la noche del 31 es de ese mes", () => {
    expect(mesEnCostaRica("2026-11-01T03:00:00Z")).toBe("2026-10");
    expect(mesEnCostaRica("2026-11-01T07:00:00Z")).toBe("2026-11");
  });
});

describe("el alcance de la exploración, acotado al área de la sesión", () => {
  const dims = (pre: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${pre}.${i + 1}`, nombre: `Dim ${pre}.${i + 1}`, aplica: i !== n - 1 }));
  const AREAS: AreaParaElAlcance[] = [
    { id: "1", nombre: "Ventas", dimensiones: dims("1", 8) },
    { id: "2", nombre: "Marketing", dimensiones: dims("2", 8) },
    { id: "3", nombre: "Servicio", dimensiones: dims("3", 8) },
  ];

  it("con el equipo de Marketing: solo las de Marketing (y las que aplican), no las 24 de la escala", () => {
    const a = alcanceDeLaSesion({ equipo: "marketing", enfoque: ["1.1"], areasEnJuego: ["1", "2", "3"], areas: AREAS });
    expect(a.de).toBe("equipo");
    expect(a.dimensiones).toHaveLength(7);
    expect(a.dimensiones.every((d) => d.area === "Marketing")).toBe(true);
  });

  it("con un equipo que la escala no mide: sus temas", () => {
    const a = alcanceDeLaSesion({ equipo: "financiero", enfoque: [], areasEnJuego: ["1"], areas: AREAS });
    expect(a.de).toBe("temas_del_equipo");
    expect(a.dimensiones.length).toBeGreaterThan(0);
    expect(a.dimensiones.every((d) => d.id === null)).toBe(true);
  });

  it("sin equipo: las de la guía enfocada; sin guía, las áreas en juego", () => {
    const guia = alcanceDeLaSesion({ equipo: null, enfoque: ["1.2", "3.1", "9.9"], areasEnJuego: ["1", "2", "3"], areas: AREAS });
    expect(guia.de).toBe("guia");
    expect(guia.dimensiones.map((d) => d.id)).toEqual(["1.2", "3.1"]);
    const areas = alcanceDeLaSesion({ equipo: null, enfoque: [], areasEnJuego: ["2"], areas: AREAS });
    expect(areas.de).toBe("areas_en_juego");
    expect(areas.dimensiones).toHaveLength(7);
  });

  it("un juicio de exploración sin nada que explorar en el alcance se descarta; con temas del equipo, vale aunque no sea la escala", () => {
    const crudo = { resumen: "x", juicios: [{ punto: "exploracion", valor: "sin_explorar", dimension: "Cómo lo miden", lectura: "No se preguntó.", citas: [] }], recomendaciones: [] };
    expect(leerElAnalisis(crudo, [], { guia: false, escala: true, posicionamiento: false, dimensiones: false }).descartados).toBe(1);
    expect(leerElAnalisis(crudo, [], { guia: false, escala: false, posicionamiento: false, dimensiones: true }).resultado.juicios).toHaveLength(1);
  });
});
