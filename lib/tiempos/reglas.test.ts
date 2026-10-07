import { describe, expect, it } from "vitest";
import {
  CONFIG_POR_DEFECTO,
  DIAS_PARA_RESPONDER,
  META_PARA_CALIBRAR,
  SUPUESTO_MINUTOS,
  aplicaAPersona,
  aplicaATarea,
  calibracionPorTipo,
  caben,
  cuandoFue,
  cuantil,
  elegirDelLote,
  inicioDelDiaCR,
  estadoVisible,
  formatoMinutos,
  huella,
  leerConfig,
  marcadaDemasiadoTarde,
  minutosDeLaCarga,
  tasaDeRespuesta,
  textoDeEstimacion,
  tipoDeFase,
  tocaPorMuestreo,
  venceEn,
  type ConfigDeEncuesta,
} from "./reglas";

const tareas = (): ConfigDeEncuesta => structuredClone(CONFIG_POR_DEFECTO.TAREA_HECHA);
const DIA = 24 * 60 * 60 * 1000;

describe("leerConfig — tolerante", () => {
  it("sin nada guardado devuelve la del momento", () => {
    expect(leerConfig(null, "TAREA_HECHA")).toEqual(CONFIG_POR_DEFECTO.TAREA_HECHA);
    expect(leerConfig(undefined, "DOCUMENTO_PUBLICADO")).toEqual(CONFIG_POR_DEFECTO.DOCUMENTO_PUBLICADO);
  });

  it("un campo raro toma el valor por defecto y el resto se respeta", () => {
    const c = leerConfig(
      { aQuien: { roles: ["CSL"] }, opciones: [{ texto: "x", minutos: -3 }], muestreo: { modo: "nada", cadaN: 1 }, topePorDia: 0 },
      "TAREA_HECHA",
    );
    expect(c.aQuien.roles).toEqual(["CSL"]);
    expect(c.opciones).toEqual(CONFIG_POR_DEFECTO.TAREA_HECHA.opciones);
    expect(c.muestreo).toEqual(CONFIG_POR_DEFECTO.TAREA_HECHA.muestreo);
    expect(c.topePorDia).toBe(CONFIG_POR_DEFECTO.TAREA_HECHA.topePorDia);
  });

  it("sin tope se guarda como null y se lee como null", () => {
    expect(leerConfig({ topePorDia: null }, "TAREA_HECHA").topePorDia).toBeNull();
  });

  it("descarta tipos y documentos que no existen, y baja los correos a minúscula", () => {
    const c = leerConfig({ tareas: { tipos: ["CONFIGURACION", "VENTAS"] }, documentos: ["kickoff", "otro"], aQuien: { personas: ["Ana@X.com"] } }, "TAREA_HECHA");
    expect(c.tareas.tipos).toEqual(["CONFIGURACION"]);
    expect(c.documentos).toEqual(["kickoff"]);
    expect(c.aQuien.personas).toEqual(["ana@x.com"]);
  });

  it("devuelve una copia: tocarla no cambia el valor por defecto", () => {
    const c = leerConfig(null, "TAREA_HECHA");
    c.opciones.push({ texto: "Otro", minutos: 5 });
    expect(CONFIG_POR_DEFECTO.TAREA_HECHA.opciones).toHaveLength(6);
  });
});

describe("a quién y en qué", () => {
  it("le llega por rol, por frente o por correo", () => {
    const c = tareas();
    expect(aplicaAPersona(c, { email: "a@x.com", rol: "CSE", frentes: [] })).toBe(true);
    expect(aplicaAPersona(c, { email: "a@x.com", rol: "VENTAS", frentes: [] })).toBe(false);
    c.aQuien.frentes = ["LIDERAR_CS"];
    expect(aplicaAPersona(c, { email: "a@x.com", rol: "SUPER_ADMIN", frentes: ["LIDERAR_CS"] })).toBe(true);
    c.aQuien.personas = ["dev@x.com"];
    expect(aplicaAPersona(c, { email: "DEV@x.com", rol: "DEV", frentes: [] })).toBe(true);
  });

  it("por defecto, solo tareas de Smarteam o Ambos, de cualquier tipo y proyecto", () => {
    const c = tareas();
    expect(aplicaATarea(c, { tipo: "CONFIGURACION", party: "SMARTEAM", projectId: "p" })).toBe(true);
    expect(aplicaATarea(c, { tipo: "SIN", party: "AMBOS", projectId: "p" })).toBe(true);
    expect(aplicaATarea(c, { tipo: "CONFIGURACION", party: "CLIENTE", projectId: "p" })).toBe(false);
    c.tareas.proyectos = ["q"];
    expect(aplicaATarea(c, { tipo: "CONFIGURACION", party: "SMARTEAM", projectId: "p" })).toBe(false);
  });

  it("una fase sin tipo cuenta como «SIN»", () => {
    expect(tipoDeFase(null)).toBe("SIN");
    expect(tipoDeFase("ADOPCION")).toBe("ADOPCION");
    expect(tipoDeFase("SIN")).toBe("SIN");
  });

  it("una tarea marcada más de 14 días después de su semana no pregunta", () => {
    const fin = new Date("2026-09-01T00:00:00Z");
    expect(marcadaDemasiadoTarde(fin, new Date(fin.getTime() + 14 * DIA))).toBe(false);
    expect(marcadaDemasiadoTarde(fin, new Date(fin.getTime() + 15 * DIA))).toBe(true);
    expect(marcadaDemasiadoTarde(null, new Date())).toBe(false);
  });
});

describe("muestreo y tope", () => {
  it("la misma clave cae siempre igual", () => {
    expect(huella("tarea:abc")).toBe(huella("tarea:abc"));
    expect(huella("tarea:abc")).not.toBe(huella("tarea:abd"));
  });

  it("«calibrar» pregunta todas hasta tener 20 del tipo; después, 1 de cada N", () => {
    const c = tareas();
    const claves = Array.from({ length: 300 }, (_, i) => `tarea:${i}`);
    expect(claves.every((k) => tocaPorMuestreo(c, k, META_PARA_CALIBRAR - 1))).toBe(true);
    const despues = claves.filter((k) => tocaPorMuestreo(c, k, META_PARA_CALIBRAR)).length;
    expect(despues).toBeGreaterThan(60);
    expect(despues).toBeLessThan(140);
  });

  it("«todas» no muestrea y «uno_de» siempre muestrea", () => {
    const c = tareas();
    c.muestreo = { modo: "todas", cadaN: 3 };
    expect(tocaPorMuestreo(c, "x", 999)).toBe(true);
    c.muestreo = { modo: "uno_de", cadaN: 3 };
    const k = Array.from({ length: 50 }, (_, i) => `k${i}`).find((x) => huella(x) % 3 !== 0)!;
    expect(tocaPorMuestreo(c, k, 0)).toBe(false);
  });

  it("el tope del día cuenta lo que ya se preguntó", () => {
    const c = tareas();
    expect(caben(c, 0)).toBe(3);
    expect(caben(c, 5)).toBe(0);
    c.topePorDia = null;
    expect(caben(c, 50)).toBe(Number.POSITIVE_INFINITY);
  });

  it("de un avance sale una por tipo, primero los tipos con menos respuestas, dentro del tope", () => {
    const c = tareas();
    const lote = [
      { clave: "tarea:1", tipo: "CONFIGURACION" as const },
      { clave: "tarea:2", tipo: "CONFIGURACION" as const },
      { clave: "tarea:3", tipo: "ADOPCION" as const },
      { clave: "tarea:4", tipo: "PLANIFICACION" as const },
      { clave: "tarea:5", tipo: "SEGUIMIENTO" as const },
    ];
    const elegidas = elegirDelLote(c, lote, { CONFIGURACION: 10, PLANIFICACION: 2, ADOPCION: 0, SEGUIMIENTO: 5 }, 0);
    expect(elegidas.map((e) => e.tipo)).toEqual(["ADOPCION", "PLANIFICACION", "SEGUIMIENTO"]);
    expect(elegirDelLote(c, lote, {}, 2)).toHaveLength(1);
    expect(elegirDelLote(c, lote, {}, 3)).toHaveLength(0);
  });
});

describe("estados", () => {
  it("una pendiente pasada de plazo se lee como vencida", () => {
    const ahora = new Date("2026-10-05T12:00:00Z");
    expect(estadoVisible("pendiente", new Date(ahora.getTime() + 1000), ahora)).toBe("pendiente");
    expect(estadoVisible("pendiente", ahora, ahora)).toBe("vencida");
    expect(estadoVisible("respondida", new Date(0), ahora)).toBe("respondida");
  });

  it("vence a los 3 días", () => {
    const d = new Date("2026-10-05T12:00:00Z");
    expect(venceEn(d).getTime() - d.getTime()).toBe(DIAS_PARA_RESPONDER * DIA);
  });

  it("la tasa no cuenta las retiradas ni las que todavía esperan", () => {
    const ahora = new Date("2026-10-05T12:00:00Z");
    const futuro = new Date(ahora.getTime() + DIA);
    const pasado = new Date(ahora.getTime() - DIA);
    const t = tasaDeRespuesta(
      [
        { estado: "respondida", motivoOmision: null, venceAt: pasado },
        { estado: "respondida", motivoOmision: null, venceAt: pasado },
        { estado: "omitida", motivoOmision: "no_lo_hice", venceAt: pasado },
        { estado: "omitida", motivoOmision: "omitir", venceAt: pasado },
        { estado: "pendiente", motivoOmision: null, venceAt: pasado },
        { estado: "pendiente", motivoOmision: null, venceAt: futuro },
        { estado: "retirada", motivoOmision: null, venceAt: pasado },
      ],
      ahora,
    );
    expect(t).toMatchObject({ cerradas: 5, respondidas: 2, noLoHice: 1, omitidas: 1, vencidas: 1, esperando: 1, retiradas: 1, porcentaje: 40 });
    expect(tasaDeRespuesta([], ahora).porcentaje).toBeNull();
  });
});

describe("fechas en Costa Rica", () => {
  it("el día empieza a la medianoche de Costa Rica, no a la de Greenwich", () => {
    // 2026-10-05 a las 23:30 de CR es el 6 a las 05:30 UTC: sigue siendo el 5 en CR.
    const tarde = new Date("2026-10-06T05:30:00Z");
    expect(inicioDelDiaCR(tarde).toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });

  it("dice hoy, ayer, el día de esta semana o la fecha", () => {
    const ahora = new Date("2026-10-05T18:00:00Z"); // lunes 5, mediodía en CR
    expect(cuandoFue(new Date("2026-10-05T14:00:00Z"), ahora)).toBe("hoy");
    expect(cuandoFue(new Date("2026-10-04T18:00:00Z"), ahora)).toBe("ayer");
    expect(cuandoFue(new Date("2026-10-01T18:00:00Z"), ahora)).toBe("el jueves");
    expect(cuandoFue(new Date("2026-09-20T18:00:00Z"), ahora)).toBe("el 20 sep");
  });
});

describe("cómo se leen las respuestas", () => {
  it("formato de minutos", () => {
    expect(formatoMinutos(45)).toBe("45 min");
    expect(formatoMinutos(60)).toBe("1 h");
    expect(formatoMinutos(90)).toBe("1 h 30");
    expect(formatoMinutos(65)).toBe("1 h 05");
    expect(formatoMinutos(480)).toBe("8 h");
  });

  it("cuantiles", () => {
    expect(cuantil([], 0.5)).toBeNull();
    expect(cuantil([60, 30, 120], 0.5)).toBe(60);
    expect(cuantil([30, 60, 90, 120], 0.5)).toBe(75);
  });

  it("sin 5 respuestas no hay mediana; con 20, el tipo calibra y la carga usa la mediana", () => {
    const pocas = Array.from({ length: 4 }, () => ({ tipo: "PLANIFICACION", minutos: 60 }));
    const muchas = Array.from({ length: 20 }, (_, i) => ({ tipo: "CONFIGURACION", minutos: i < 10 ? 60 : 120 }));
    const cal = calibracionPorTipo([...pocas, ...muchas, { tipo: null, minutos: 30 }]);
    const plan = cal.find((c) => c.tipo === "PLANIFICACION")!;
    const conf = cal.find((c) => c.tipo === "CONFIGURACION")!;
    const sin = cal.find((c) => c.tipo === "SIN")!;
    expect(plan).toMatchObject({ respuestas: 4, mediana: null, calibra: false });
    expect(minutosDeLaCarga(plan)).toBe(SUPUESTO_MINUTOS.PLANIFICACION);
    expect(conf).toMatchObject({ respuestas: 20, mediana: 90, calibra: true });
    expect(minutosDeLaCarga(conf)).toBe(90);
    expect(sin.respuestas).toBe(1);
    expect(cal).toHaveLength(6);
  });

  it("la estimación se dice distinto si ya viene de respuestas", () => {
    expect(textoDeEstimacion("CONFIGURACION", 120, false)).toBe("La carga supone 2 h para una tarea de Configuración.");
    expect(textoDeEstimacion("CONFIGURACION", 90, true)).toContain("según lo que anotó el equipo");
    expect(textoDeEstimacion(null, 60, false)).toBeNull();
  });
});
