import { describe, expect, it } from "vitest";
import {
  aceptaLaPropuesta,
  csvDePresentaciones,
  decisionesDeLasPropuestas,
  dijoAhoraNo,
  documentoDeLaPieza,
  estadoDeLaPresentacion,
  filaDeLaAccion,
  motivoParaResponder,
  pidePregunta,
  plegar,
  porQueNoSePuede,
  preguntaDelEstado,
  quienesResponden,
  tituloParaTi,
  type FilaDePresentacion,
  type PersonaDelEquipo,
} from "./reglas";
import { filasDesdeLoViejo } from "./desde-lo-viejo";

const REUNION = { id: "s1", titulo: "Seguimiento", fecha: "2026-10-05" };
let t = 0;
/** Una fila, cada una un minuto después de la anterior. */
function fila(evento: string, extra: Partial<FilaDePresentacion> = {}): FilaDePresentacion {
  t += 1;
  return { evento, fecha: null, porEmail: "cse@x", createdAt: new Date(Date.UTC(2026, 9, 7, 15, t)), ...extra };
}
const propuesta = (fecha: string) => fila("propuesta", { fecha, porEmail: null, sessionId: "s1", detalle: { cita: "lo vemos el viernes", reunion: REUNION } });

const cse = (email: string, extra: Partial<PersonaDelEquipo> = {}): PersonaDelEquipo => ({ email, rol: "CSE", activa: true, ...extra });

describe("las cuatro piezas que se presentan", () => {
  it("cada pieza del riel tiene su documento, y las demás no se presentan", () => {
    expect(documentoDeLaPieza("kickoff")).toBe("kickoff");
    expect(documentoDeLaPieza("diagnosis")).toBe("diagnostico");
    expect(documentoDeLaPieza("planning")).toBe("planificacion");
    expect(documentoDeLaPieza("delivery")).toBe("entrega");
    expect(documentoDeLaPieza("timeline")).toBeNull();
    expect(documentoDeLaPieza(null)).toBeNull();
  });
});

describe("el estado sale de leer las filas en orden", () => {
  it("sin filas, todavía nadie respondió; «Todavía no sé» vuelve a preguntarse a la semana", () => {
    expect(estadoDeLaPresentacion(plegar([]), "2026-10-07", { documento: "kickoff" })).toBe("sin-responder");
    const p = plegar([fila("sin-fecha")]);
    const estado = estadoDeLaPresentacion(p, "2026-10-08", { documento: "kickoff" });
    expect(estado).toBe("sin-fecha");
    expect(pidePregunta(p, estado, "2026-10-08", "2026-10-01")).toBe(false);
    expect(pidePregunta(p, estado, "2026-10-14", "2026-10-01")).toBe(true);
  });

  it("sin respuesta, se pregunta solo por un documento generado en los últimos 30 días", () => {
    const p = plegar([]);
    expect(pidePregunta(p, "sin-responder", "2026-10-14", "2026-10-01")).toBe(true);
    expect(pidePregunta(p, "sin-responder", "2026-10-14", "2026-09-14")).toBe(true);
    expect(pidePregunta(p, "sin-responder", "2026-10-14", "2026-09-13")).toBe(false);
    expect(pidePregunta(p, "sin-responder", "2026-10-14", null)).toBe(false);
    // Lo que ya se respondió se sigue preguntando aunque el documento sea viejo.
    expect(pidePregunta(plegar([fila("fecha", { fecha: "2026-10-01" })]), "paso-la-fecha", "2026-10-14", "2026-06-01")).toBe(true);
  });

  it("con fecha, se pregunta de nuevo recién cuando pasó: «¿Ya lo presentaste?»", () => {
    const p = plegar([fila("fecha", { fecha: "2026-10-10" })]);
    expect(estadoDeLaPresentacion(p, "2026-10-08", { documento: "planificacion" })).toBe("con-fecha");
    expect(estadoDeLaPresentacion(p, "2026-10-10", { documento: "planificacion" })).toBe("con-fecha");
    expect(estadoDeLaPresentacion(p, "2026-10-11", { documento: "planificacion" })).toBe("paso-la-fecha");
    expect(preguntaDelEstado("paso-la-fecha", p, "planificacion")).toBe("¿Ya la presentaste? Era el sábado 10 de octubre.");
  });

  it("el diagnóstico pide confirmar que está terminado dos días antes, y «listo» vale para SU fecha", () => {
    const p = plegar([fila("fecha", { fecha: "2026-10-10" })]);
    expect(estadoDeLaPresentacion(p, "2026-10-07", { documento: "diagnostico" })).toBe("con-fecha");
    expect(estadoDeLaPresentacion(p, "2026-10-08", { documento: "diagnostico" })).toBe("por-reconfirmar");
    const listo = plegar([fila("fecha", { fecha: "2026-10-10" }), fila("listo", { fecha: "2026-10-10", detalle: { aviso: { para: "Andrés", motivo: null } } })]);
    expect(estadoDeLaPresentacion(listo, "2026-10-09", { documento: "diagnostico" })).toBe("listo");
    expect(listo.aviso?.para).toBe("Andrés");
    const corrida = plegar([fila("fecha", { fecha: "2026-10-10" }), fila("listo", { fecha: "2026-10-10" }), fila("fecha", { fecha: "2026-10-14" })]);
    expect(corrida.listo).toBeNull();
    expect(estadoDeLaPresentacion(corrida, "2026-10-13", { documento: "diagnostico" })).toBe("por-reconfirmar");
  });

  it("«Ya lo presenté» cierra la pregunta; el diagnóstico marcado «Presentado» también", () => {
    const p = plegar([fila("fecha", { fecha: "2026-10-10" }), fila("presentado", { fecha: "2026-10-09" })]);
    expect(estadoDeLaPresentacion(p, "2026-10-20", { documento: "entrega" })).toBe("presentado");
    expect(pidePregunta(p, "presentado", "2026-10-20", "2026-10-01")).toBe(false);
    expect(estadoDeLaPresentacion(plegar([]), "2026-10-20", { documento: "diagnostico", presentadoFormal: true })).toBe("presentado");
    // Otra fecha después de presentarlo es una presentación nueva.
    const otra = plegar([fila("presentado", { fecha: "2026-10-09" }), fila("fecha", { fecha: "2026-10-30" })]);
    expect(otra.presentado).toBeNull();
    expect(estadoDeLaPresentacion(otra, "2026-10-20", { documento: "entrega" })).toBe("con-fecha");
  });

  it("queda quién respondió lo último; lo que leyó Nexus y «Ahora no» no cuentan como respuesta", () => {
    const p = plegar([fila("fecha", { fecha: "2026-10-10", porEmail: "Ana@X" }), propuesta("2026-10-12"), fila("ahora-no", { porEmail: "otra@x" })]);
    expect(p.ultima).toMatchObject({ evento: "fecha", por: "ana@x" });
  });
});

describe("la fecha que lee Nexus en una reunión", () => {
  it("se propone, se usa o se descarta, y lo descartado no vuelve", () => {
    const con = plegar([propuesta("2026-10-09")]);
    expect(con.propuesta?.fecha).toBe("2026-10-09");
    expect(aceptaLaPropuesta(con, "2026-10-09")).toBe(false);
    const usar = filaDeLaAccion({ accion: "usar-propuesta" }, con);
    expect(usar).toMatchObject({ evento: "fecha", fecha: "2026-10-09" });
    const usada = plegar([propuesta("2026-10-09"), fila(usar.evento, { fecha: usar.fecha, detalle: usar.detalle })]);
    expect(usada.fecha).toBe("2026-10-09");
    expect(usada.propuesta).toBeNull();
    expect(usada.fuente).toContain("Seguimiento");
    const descartada = plegar([propuesta("2026-10-09"), fila("descarte", { fecha: "2026-10-09" })]);
    expect(descartada.propuesta).toBeNull();
    expect(aceptaLaPropuesta(descartada, "2026-10-09")).toBe(false);
    expect(aceptaLaPropuesta(descartada, "2026-10-16")).toBe(true);
  });

  it("«Uso de Nexus» sabe qué pasó con cada una y quién la decidió", () => {
    const filas = [
      propuesta("2026-10-09"),
      fila("fecha", { fecha: "2026-10-09", porEmail: "ana@x", detalle: { deLaPropuesta: "s1" } }),
      propuesta("2026-10-20"),
      fila("descarte", { fecha: "2026-10-20", porEmail: "luis@x" }),
      propuesta("2026-10-27"),
    ];
    expect(decisionesDeLasPropuestas(filas).map((d) => [d.fecha, d.estado, d.por])).toEqual([
      ["2026-10-09", "usado", "ana@x"],
      ["2026-10-20", "desestimado", "luis@x"],
      ["2026-10-27", "pendiente", null],
    ]);
  });
});

describe("solo Customer Success responde", () => {
  const lideres = [{ email: "csl@x", rol: "CSL", activa: true }];

  it("se le pregunta al encargado y a quien generó el documento, si son de Customer Success", () => {
    expect(quienesResponden({ encargado: cse("ana@x"), generador: cse("luis@x"), lideres })).toEqual([
      { email: "ana@x", motivo: "encargado" },
      { email: "luis@x", motivo: "genero" },
    ]);
    // La misma persona no aparece dos veces.
    expect(quienesResponden({ encargado: cse("ana@x"), generador: cse("ANA@x"), lideres })).toEqual([{ email: "ana@x", motivo: "encargado" }]);
  });

  it("si ninguno es de Customer Success (o se fue), le toca a la CSL", () => {
    expect(quienesResponden({ encargado: cse("dir@x", { rol: "SUPER_ADMIN" }), generador: cse("baja@x", { activa: false }), lideres })).toEqual([
      { email: "csl@x", motivo: "lider" },
    ]);
    expect(quienesResponden({ encargado: null, generador: null, lideres })).toEqual([{ email: "csl@x", motivo: "lider" }]);
  });

  it("dirección no responde; la CSL siempre puede", () => {
    const responden = quienesResponden({ encargado: cse("ana@x"), generador: null, lideres });
    expect(motivoParaResponder({ email: "ana@x", rol: "CSE" }, responden)).toBe("encargado");
    expect(motivoParaResponder({ email: "otro@x", rol: "CSE" }, responden)).toBeNull();
    expect(motivoParaResponder({ email: "dir@x", rol: "SUPER_ADMIN" }, responden)).toBeNull();
    expect(motivoParaResponder({ email: "csl@x", rol: "CSL" }, responden)).toBe("lider");
  });
});

describe("lo que no se puede responder", () => {
  const p = plegar([]);
  it("una fecha planeada no es de un día que ya pasó; «Ya lo presenté» no es de un día que no llegó", () => {
    expect(porQueNoSePuede({ accion: "fecha", fecha: "2026-10-06" }, p, "kickoff", "2026-10-07")).toMatch(/ya pasó/);
    expect(porQueNoSePuede({ accion: "fecha", fecha: "2026-10-07" }, p, "kickoff", "2026-10-07")).toBeNull();
    expect(porQueNoSePuede({ accion: "presentado", fecha: "2026-10-08" }, p, "kickoff", "2026-10-07")).toMatch(/no llegó/);
    expect(porQueNoSePuede({ accion: "presentado", fecha: "2026-09-30" }, p, "kickoff", "2026-10-07")).toBeNull();
  });
  it("solo el diagnóstico se confirma como terminado, y sin propuesta no hay qué usar", () => {
    expect(porQueNoSePuede({ accion: "listo", fecha: "2026-10-09" }, p, "entrega", "2026-10-07")).toMatch(/Solo el diagnóstico/);
    expect(porQueNoSePuede({ accion: "listo", fecha: "2026-10-09" }, p, "diagnostico", "2026-10-07")).toBeNull();
    expect(porQueNoSePuede({ accion: "usar-propuesta" }, p, "diagnostico", "2026-10-07")).toMatch(/No hay/);
  });
  it("«Ahora no» calla la tarjeta unas horas, solo para quien lo dijo", () => {
    const filas = [fila("ahora-no", { porEmail: "ana@x", createdAt: new Date("2026-10-07T15:00:00.000Z") })];
    expect(dijoAhoraNo(filas, "ANA@x", new Date("2026-10-08T05:00:00.000Z"))).toBe(true);
    expect(dijoAhoraNo(filas, "luis@x", new Date("2026-10-08T05:00:00.000Z"))).toBe(false);
    expect(dijoAhoraNo(filas, "ana@x", new Date("2026-10-08T15:00:00.000Z"))).toBe(false);
  });
});

describe("lo que se lee", () => {
  it("los títulos de «Para ti» llevan el documento y la empresa, en tuteo", () => {
    expect(tituloParaTi("sin-responder", "diagnostico", "Wherex")).toBe("¿Cuándo presentas el diagnóstico de Wherex?");
    expect(tituloParaTi("paso-la-fecha", "entrega", "Areyá")).toBe("¿Ya presentaste la entrega de Areyá?");
  });

  it("el CSV lleva cada fila con quién respondió, y no deja pasar una fórmula", () => {
    const csv = csvDePresentaciones([
      {
        ...fila("fecha", { fecha: "2026-10-10", porEmail: "ana@x" }),
        documento: "kickoff",
        projectId: "p1",
        proyectoNombre: "Implementación",
        clientNombre: "=HYPERLINK(1)",
        rol: "CSE",
        motivo: "encargado",
      },
    ]);
    expect(csv.startsWith("﻿momento,documento,evento,fecha,")).toBe(true);
    expect(csv).toContain("kickoff,fecha,2026-10-10,'=HYPERLINK(1),Implementación,p1,ana@x,CSE,encargado");
  });
});

describe("el Json viejo del diagnóstico pasa a filas", () => {
  it("cada cosa que guardaba, con quién y cuándo; lo que no guardaba quién, no se inventa", () => {
    const filas = filasDesdeLoViejo(
      {
        v: 1,
        fecha: "2026-10-10",
        fijadaPor: "Ana@x",
        fijadaEn: "2026-10-07T15:00:00.000Z",
        descartadas: ["2026-10-08", "2026-10-09"],
        descartadasPor: [{ fecha: "2026-10-09", por: "luis@x", en: "2026-10-07T14:00:00.000Z" }],
        listo: { fecha: "2026-10-10", por: "ana@x", en: "2026-10-08T15:00:00.000Z" },
        aviso: { en: "2026-10-08T15:00:00.000Z", para: "Andrés", motivo: null },
      },
      new Date("2026-10-01T00:00:00.000Z"),
    );
    expect(filas.map((f) => [f.evento, f.fecha, f.porEmail])).toEqual([
      ["descarte", "2026-10-09", "luis@x"],
      ["fecha", "2026-10-10", "ana@x"],
      ["listo", "2026-10-10", "ana@x"],
    ]);
    const p = plegar(filas);
    expect(estadoDeLaPresentacion(p, "2026-10-09", { documento: "diagnostico" })).toBe("listo");
    expect(p.aviso?.para).toBe("Andrés");
    expect(filasDesdeLoViejo(null, new Date())).toEqual([]);
  });
});
