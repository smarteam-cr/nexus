import { describe, expect, it } from "vitest";
import {
  asuntoComoTema,
  atencionDe,
  conteosDelSeguimiento,
  cseDelSeguimiento,
  elegirTemas,
  filtrarSeguimiento,
  filtrosPorDefecto,
  ordenarSeguimiento,
  pasoDelSeguimiento,
  proximaSesionDe,
  sesionFueraDeLaRegla,
  sinSesion,
  temaCorto,
  temasDeLaMinuta,
  type CandidatoDeTema,
  type FilaDeSeguimiento,
} from "./seguimiento";
import { recortarCalendario } from "./calendario";

const HOY = "2026-10-19";
const AHORA = new Date("2026-10-19T15:00:00Z");

function fila(o: Partial<FilaDeSeguimiento> & { clientId: string }): FilaDeSeguimiento {
  return {
    nombre: o.clientId,
    cse: { nombre: "Heiver Gomez", email: "hgomez@smarteamcr.com" },
    cseDeBaja: null,
    tuya: true,
    salud: "bien",
    porque: null,
    proximaSesion: { clientId: o.clientId, titulo: "Seguimiento", inicio: "2026-10-22T16:00:00Z", fuente: "calendario" },
    calendarioLeido: true,
    paso: { tipo: "reunion", dia: "2026-10-22", inicio: "2026-10-22T16:00:00Z", titulo: "Seguimiento" },
    pasoLleva: null,
    ultimaReunion: { sessionId: "s1", titulo: "Kickoff", fecha: "2026-10-10T16:00:00Z" },
    temas: [],
    invitados: [],
    ...o,
  };
}

const cand = (o: Partial<CandidatoDeTema> & { texto: string }): CandidatoDeTema => ({
  origen: "reunion",
  fuente: "Reunión",
  fecha: "2026-10-15T16:00:00Z",
  posicion: 0,
  href: null,
  ...o,
});

describe("temaCorto", () => {
  it("se queda con el rótulo de un tema «Rótulo: explicación»", () => {
    expect(temaCorto("Arquitectura de cotizaciones Analisa: migración a nuevo modelo HubSpot + API Kimiconet")).toBe(
      "Arquitectura de cotizaciones Analisa",
    );
  });
  it("corta un texto largo en la última palabra que entra", () => {
    const largo = "Corrección del cálculo de tiempo de primera respuesta en los acuerdos de servicio porque solo considera al dueño del ticket";
    const t = temaCorto(largo);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(91);
    expect(largo.startsWith(t.slice(0, -1))).toBe(true);
  });
  it("un rótulo demasiado corto no cuenta como rótulo", () => {
    expect(temaCorto("SLA: corregir el cálculo")).toBe("SLA: corregir el cálculo");
  });
});

describe("asuntoComoTema", () => {
  it("le quita Re:, RV: y Fwd:", () => {
    expect(asuntoComoTema("RE: RV: Propuesta de renovación")).toBe("Propuesta de renovación");
    expect(asuntoComoTema("Fwd: [EXTERNO] Accesos al portal")).toBe("Accesos al portal");
  });
  it("una invitación del calendario o una respuesta automática no es un tema", () => {
    expect(asuntoComoTema("Invitación: Seguimiento semanal @ lun 20 oct")).toBeNull();
    expect(asuntoComoTema("Accepted: Kickoff")).toBeNull();
    expect(asuntoComoTema("Respuesta automática: fuera")).toBeNull();
    expect(asuntoComoTema("")).toBeNull();
    expect(asuntoComoTema(null)).toBeNull();
  });
});

describe("temasDeLaMinuta", () => {
  it("solo los textos", () => {
    expect(temasDeLaMinuta(["Uno", 3, " ", "Dos"])).toEqual(["Uno", "Dos"]);
    expect(temasDeLaMinuta(null)).toEqual([]);
    expect(temasDeLaMinuta({ a: 1 })).toEqual([]);
  });
});

describe("elegirTemas", () => {
  it("primero lo más reciente, y los primeros temas de cada reunión", () => {
    const t = elegirTemas(
      [
        cand({ texto: "Plan de capacitación de asesoras", fecha: "2026-10-15T16:00:00Z", posicion: 0 }),
        cand({ texto: "Automatización de cuotas condominales", fecha: "2026-10-15T16:00:00Z", posicion: 4 }),
        cand({ texto: "Renovación del contrato de licencias", fecha: "2026-10-10T16:00:00Z", posicion: 0 }),
        cand({ texto: "Problema de remitente en correos masivos", origen: "correo", fecha: "2026-10-17T16:00:00Z" }),
        cand({ texto: "Pipeline de tickets de servicio", fecha: "2026-10-15T16:00:00Z", posicion: 1 }),
      ],
      "Grupo Inve",
    );
    expect(t.map((x) => x.texto)).toEqual([
      "Problema de remitente en correos masivos",
      "Plan de capacitación de asesoras",
      "Pipeline de tickets de servicio",
      "Renovación del contrato de licencias",
    ]);
  });

  it("dos temas que hablan de lo mismo cuentan una vez (sin el nombre de la cuenta)", () => {
    const t = elegirTemas(
      [
        cand({ texto: "Migración de contactos desde Salesforce", posicion: 0 }),
        cand({ texto: "Migración de contactos de Salesforce a HubSpot para CEMACO", origen: "correo", fecha: "2026-10-14T16:00:00Z" }),
        cand({ texto: "Capacitación del equipo comercial", posicion: 1 }),
      ],
      "CEMACO",
    );
    expect(t).toHaveLength(2);
    expect(t[0].texto).toBe("Migración de contactos desde Salesforce");
  });

  it("las tareas abiertas entran solo si las reuniones y los correos no alcanzan", () => {
    const tarea = cand({ texto: "Enviar el reporte de adopción", origen: "tarea", fuente: "T-12", fecha: "2026-10-18T16:00:00Z" });
    expect(elegirTemas([cand({ texto: "Uno de reuniones" }), cand({ texto: "Otro distinto de verdad", posicion: 1 }), tarea], "X").map((t) => t.origen)).toEqual([
      "reunion",
      "reunion",
    ]);
    const conTarea = elegirTemas([cand({ texto: "Uno de reuniones" }), tarea], "X");
    expect(conTarea.map((t) => t.origen)).toEqual(["reunion", "tarea"]);
    expect(conTarea[1].fuente).toBe("T-12");
  });

  it("como mucho 4, y cada tema dice de dónde sale y cuándo", () => {
    const muchos = ["Alfa uno", "Beta dos", "Gama tres", "Delta cuatro", "Épsilon cinco"].map((texto, i) =>
      cand({ texto, posicion: i, fuente: "Kickoff", href: "/sessions/s1" }),
    );
    const t = elegirTemas(muchos, "X");
    expect(t).toHaveLength(4);
    expect(t[0]).toMatchObject({ fuente: "Kickoff", href: "/sessions/s1", fecha: "2026-10-15T16:00:00Z", origen: "reunion" });
  });

  it("sin nada, ningún tema", () => {
    expect(elegirTemas([], "X")).toEqual([]);
  });
});

describe("proximaSesionDe", () => {
  const r = (clientId: string, inicio: string) => ({ clientId, titulo: "R", inicio, fuente: "calendario" as const });
  it("la primera de esa cuenta dentro de la ventana, nunca la de otra cuenta", () => {
    const reuniones = [r("a", "2026-11-01T16:00:00Z"), r("b", "2026-10-20T16:00:00Z"), r("a", "2026-10-25T16:00:00Z"), r("a", "2026-10-18T16:00:00Z")];
    expect(proximaSesionDe(reuniones, "a", AHORA)?.inicio).toBe("2026-10-25T16:00:00Z");
    expect(proximaSesionDe(reuniones, "c", AHORA)).toBeNull();
  });
  it("una de dentro de 40 días no cuenta", () => {
    expect(proximaSesionDe([r("a", "2026-11-28T16:00:00Z")], "a", AHORA)).toBeNull();
  });
});

describe("el paso, la ventana de la regla y el calendario recortado", () => {
  it("el paso se copia campo por campo: lo que la cartera le suma no viaja", () => {
    expect(pasoDelSeguimiento({ tipo: "accion", dia: "2026-10-21", numero: 12, titulo: "Enviar", lleva: "x@y.com" })).toEqual({
      tipo: "accion",
      dia: "2026-10-21",
      numero: 12,
      titulo: "Enviar",
    });
    expect(pasoDelSeguimiento(null)).toBeNull();
  });

  it("una sesión en más de 8 días todavía no es el siguiente paso", () => {
    expect(sesionFueraDeLaRegla(fila({ clientId: "a" }), HOY)).toBe(false);
    expect(
      sesionFueraDeLaRegla(fila({ clientId: "a", proximaSesion: { clientId: "a", titulo: "R", inicio: "2026-10-30T16:00:00Z", fuente: "calendario" } }), HOY),
    ).toBe(true);
    expect(sesionFueraDeLaRegla(fila({ clientId: "a", proximaSesion: null }), HOY)).toBe(false);
  });

  it("la lectura de 30 días contesta la de 8, recortada", () => {
    const cal = {
      desde: AHORA.toISOString(),
      reuniones: [{ inicio: "2026-10-20T16:00:00Z" }, { inicio: "2026-11-10T16:00:00Z" }],
      ocupado: [{ inicio: "2026-10-21T16:00:00Z" }, { inicio: "2026-11-02T16:00:00Z" }],
    };
    const r = recortarCalendario(cal, AHORA, 8)!;
    expect(r.reuniones.map((x) => x.inicio)).toEqual(["2026-10-20T16:00:00Z"]);
    expect(r.ocupado.map((x) => x.inicio)).toEqual(["2026-10-21T16:00:00Z"]);
    expect(recortarCalendario(null, AHORA, 8)).toBeNull();
  });
});

describe("sin sesión, orden y filtros", () => {
  it("sin calendario leído no se dice que no hay sesión", () => {
    expect(sinSesion(fila({ clientId: "a", proximaSesion: null, calendarioLeido: false }))).toBe(false);
    expect(sinSesion(fila({ clientId: "a", proximaSesion: null }))).toBe(true);
  });

  it("ordena por lo que más pide atención: sin las dos, sin paso, sin sesión, después el color y la última reunión", () => {
    const filas = [
      fila({ clientId: "al-dia" }),
      fila({ clientId: "sin-sesion", proximaSesion: null }),
      fila({ clientId: "sin-paso", paso: null }),
      fila({ clientId: "sin-las-dos", proximaSesion: null, paso: null }),
      fila({ clientId: "al-dia-en-riesgo", salud: "riesgo" }),
      fila({ clientId: "al-dia-sin-reunion", ultimaReunion: null }),
    ];
    expect(ordenarSeguimiento(filas, HOY).map((f) => f.clientId)).toEqual([
      "sin-las-dos",
      "sin-paso",
      "sin-sesion",
      "al-dia-en-riesgo",
      "al-dia-sin-reunion",
      "al-dia",
    ]);
    expect(atencionDe(filas[3])).toBe(3);
  });

  it("el CSE ve de entrada las que LLEVA, aunque el CSE de la cuenta sea otro; quien lidera, todas", () => {
    expect(filtrosPorDefecto({ lider: false })).toEqual({ cse: "tuyas", sinSesion: false, sinPaso: false });
    expect(filtrosPorDefecto({ lider: true }).cse).toBe("");
    const filas = [
      fila({ clientId: "suya-como-cse" }),
      fila({ clientId: "suya-pero-otro-cse", cse: { nombre: "Caroline Bersot", email: "cbersot@smarteamcr.com" } }),
      fila({ clientId: "compartida", tuya: false }),
    ];
    expect(filtrarSeguimiento(filas, filtrosPorDefecto({ lider: false })).map((f) => f.clientId)).toEqual(["suya-como-cse", "suya-pero-otro-cse"]);
  });

  it("filtra por CSE, por sin sesión y por sin siguiente paso", () => {
    const filas = [
      fila({ clientId: "a" }),
      fila({ clientId: "b", cse: { nombre: "Caroline Bersot", email: "cbersot@smarteamcr.com" }, proximaSesion: null }),
      fila({ clientId: "c", cse: null, paso: null }),
    ];
    expect(filtrarSeguimiento(filas, { cse: "hgomez@smarteamcr.com", sinSesion: false, sinPaso: false }).map((f) => f.clientId)).toEqual(["a"]);
    expect(filtrarSeguimiento(filas, { cse: "sin", sinSesion: false, sinPaso: false }).map((f) => f.clientId)).toEqual(["c"]);
    expect(filtrarSeguimiento(filas, { cse: "", sinSesion: true, sinPaso: false }).map((f) => f.clientId)).toEqual(["b"]);
    expect(filtrarSeguimiento(filas, { cse: "", sinSesion: false, sinPaso: true }).map((f) => f.clientId)).toEqual(["c"]);
    expect(cseDelSeguimiento(filas)).toEqual({
      cses: [
        { clave: "cbersot@smarteamcr.com", nombre: "Caroline Bersot" },
        { clave: "hgomez@smarteamcr.com", nombre: "Heiver Gomez" },
      ],
      haySinCse: true,
    });
    expect(conteosDelSeguimiento(filas)).toEqual({ total: 3, sinSesion: 1, sinPaso: 1, sinCalendario: 0 });
  });
});
