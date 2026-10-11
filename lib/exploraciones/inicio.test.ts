/**
 * lib/exploraciones/inicio.test.ts — lo que dice la página de inicio de la exploración (etapa A).
 * Correr: `npx vitest run lib/exploraciones/inicio.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, VALIDADOR_LIBRE, type EstadoDeExploracion, type Validez } from "./contenido";
import type { PestanaDeSesion, ReunionDeLaExploracion, SesionPlaneada } from "./guia";
import {
  conteoDeLasSesiones,
  datosDeLaSesion,
  devolverALaExploracion,
  estadoCortoDeLaGuia,
  estadoDeLaFila,
  horaDeCostaRica,
  horario,
  pideUnirla,
  sacarDeLaExploracion,
  sesionDesdeLaReunion,
} from "./inicio";

const reunion = (o: Partial<ReunionDeLaExploracion> = {}): ReunionDeLaExploracion => ({
  id: "m1",
  titulo: "Alineación",
  fecha: "2026-09-21T15:00:00.000Z",
  origen: "meet",
  leida: false,
  ...o,
});

const pestana = (o: Partial<PestanaDeSesion> = {}): PestanaDeSesion => ({ clave: "s-1", numero: 1, sesion: null, reunion: null, fecha: null, hecha: false, ...o });

describe("las horas, en la hora de Costa Rica", () => {
  it("UTC−6 sin horario de verano, armado a mano", () => {
    expect(horaDeCostaRica("2026-10-15T16:00:00.000Z")).toBe("10:00");
    expect(horaDeCostaRica("2026-10-16T03:30:00.000Z")).toBe("21:30");
    expect(horaDeCostaRica("no es fecha")).toBeNull();
  });
  it("el horario con su fin, y sin fin la hora sola", () => {
    expect(horario("2026-10-15T16:00:00.000Z", "2026-10-15T16:45:00.000Z")).toBe("10:00 a 10:45");
    expect(horario("2026-10-15T16:00:00.000Z")).toBe("10:00");
    expect(horario("2026-10-15T16:00:00.000Z", "2026-10-15T16:00:00.000Z")).toBe("10:00");
    expect(horario("x")).toBe("");
  });
});

describe("la línea de datos de cada sesión", () => {
  it("con reunión: de dónde viene y qué dejó", () => {
    expect(datosDeLaSesion(pestana({ reunion: reunion({ texto: "transcripcion" }) }), "sinLeer")).toMatch(/· Google Meet · con transcripción$/);
    expect(datosDeLaSesion(pestana({ reunion: reunion({ texto: "notas" }) }), "soloNotasSinLeer")).toMatch(/solo notas de Gemini$/);
    expect(datosDeLaSesion(pestana({ reunion: reunion({ corta: { minutos: 6 } }) }), "corta")).toMatch(/6 min, casi sin conversación$/);
    expect(datosDeLaSesion(pestana({ reunion: reunion({ origen: "hubspot" }) }), "leida")).toMatch(/· HubSpot$/);
  });
  it("dice «ligada por fecha» cuando la sesión no eligió su reunión ni la unió a un evento", () => {
    expect(datosDeLaSesion(pestana({ reunion: reunion({ texto: "transcripcion" }), ligadaPor: "fecha" }), "leida")).toMatch(/ligada por fecha$/);
  });
  it("unida a un evento que no ocurre: su hora, en el calendario; cancelada, lo dice", () => {
    const sesion: SesionPlaneada = { id: "s-1", evento: { id: "e1", calendario: "a@smarteamcr.com", inicio: "2026-10-15T16:00:00.000Z" } };
    expect(datosDeLaSesion(pestana({ sesion }), "agendada")).toMatch(/, 10:00 · en el calendario$/);
    expect(datosDeLaSesion(pestana({ sesion }), "cancelada")).toMatch(/· cancelada en el calendario$/);
  });
  it("sin reunión: sin fecha, y que la guía se puede preparar igual", () => {
    expect(datosDeLaSesion(pestana({ sesion: { id: "s-1" } }), "sinReunion")).toBe("sin fecha · la guía se puede preparar igual");
  });
});

describe("el estado a la derecha de cada fila", () => {
  it("leída en verde; sin leer en ámbar y se puede leer; agendada en gris", () => {
    expect(estadoDeLaFila("leida")).toEqual({ texto: "Leída", tono: "bien", leer: false });
    expect(estadoDeLaFila("sinLeer")?.leer).toBe(true);
    expect(estadoDeLaFila("soloNotasSinLeer")).toEqual({ texto: "Sin leer", tono: "atencion", leer: true });
    expect(estadoDeLaFila("agendada")?.tono).toBe("neutro");
    expect(estadoDeLaFila("corta")?.texto).toBe("¿Qué pasó?");
  });
  it("sin reunión no tiene estado: ofrece unirla (y también la cancelada)", () => {
    expect(estadoDeLaFila("sinReunion")).toBeNull();
    expect(pideUnirla("sinReunion")).toBe(true);
    expect(pideUnirla("cancelada")).toBe(true);
    expect(pideUnirla("leida")).toBe(false);
  });
  it("el conteo del panel: cada estado en su grupo, sin las que no se hicieron", () => {
    expect(conteoDeLasSesiones(["leida", "sinLeer", "soloNotasSinLeer", "agendada", "esperando", "sinReunion", "corta", "noSeHizo"])).toEqual({
      leidas: 1,
      sinLeer: 2,
      agendadas: 2,
      sinReunion: 1,
      atencion: 1,
    });
  });
});

describe("el estado de la guía de la próxima sesión", () => {
  it("de base, al día o vieja con lo primero que cambió", () => {
    expect(estadoCortoDeLaGuia(false, null)).toBe("la guía todavía es la de base");
    expect(estadoCortoDeLaGuia(true, null)).toBe("la guía está al día");
    expect(estadoCortoDeLaGuia(true, { respondidas: ["metas", "retos"], nuevas: [], dimensiones: false, llevados: 0 })).toBe("la guía está vieja: ya se respondieron 2 puntos");
    expect(estadoCortoDeLaGuia(true, { respondidas: [], nuevas: ["metas"], dimensiones: false, llevados: 0 })).toBe("la guía está vieja: ahora falta 1 punto más");
    expect(estadoCortoDeLaGuia(true, { respondidas: [], nuevas: [], dimensiones: true, llevados: 0 })).toMatch(/dimensiones/);
    expect(estadoCortoDeLaGuia(true, { respondidas: [], nuevas: [], dimensiones: false, llevados: 1 })).toBe("la guía está vieja: te llevaste 1 punto de otra sesión");
  });
});

describe("sacar y devolver sesiones", () => {
  const validez: Validez = {
    dimensiones: new Set(),
    criterios: new Set(),
    areas: new Set(),
    ediciones: new Set(),
    perfilesHabituales: {},
    escalaVersion: "1",
  } as unknown as Validez;
  const estadoCon = (sesiones: SesionPlaneada[], fuera: string[] = []): EstadoDeExploracion =>
    ({
      ...({} as EstadoDeExploracion),
      contenido: { ...contenidoVacio(), sesiones, fuera },
      propuesta: propuestaVacia(),
    }) as EstadoDeExploracion;

  const conReunion: SesionPlaneada = { id: "s-1", reunion: { id: "m1", origen: "meet" }, fecha: "2026-09-21" };
  const conEvento: SesionPlaneada = { id: "s-2", evento: { id: "e9", calendario: "a@smarteamcr.com", inicio: "2026-10-15T16:00:00.000Z" } };
  const pestanas: PestanaDeSesion[] = [
    pestana({ clave: "s-1", sesion: conReunion, reunion: reunion() }),
    pestana({ clave: "s-2", numero: 2, sesion: conEvento }),
    pestana({ clave: "r-meet-m7", numero: 3, reunion: reunion({ id: "m7" }) }),
  ];

  it("en un prospecto: quita las sesiones y deja sus reuniones (y la fila de Meet del evento) fuera", () => {
    const { ops } = sacarDeLaExploracion(pestanas, ["s-1", "s-2", "r-meet-m7"], true);
    expect(ops).toEqual([
      { op: "quitarSesiones", ids: ["s-1", "s-2"] },
      { op: "fuera", claves: ["meet:m1", "meet:gmeet_e9", "meet:m7"], fuera: true },
    ]);
  });

  it("en un cliente o un proyecto: solo quita la sesión (nada entra solo)", () => {
    expect(sacarDeLaExploracion(pestanas, ["s-1"], false).ops).toEqual([{ op: "quitarSesiones", ids: ["s-1"] }]);
  });

  it("deshacer deja la exploración como estaba", () => {
    const antes = estadoCon([conReunion, conEvento]);
    const { ops, sacadas } = sacarDeLaExploracion(pestanas, ["s-1", "r-meet-m7"], true);
    const sacado = aplicarOperaciones(antes, ops, validez, VALIDADOR_LIBRE);
    expect(sacado.ok).toBe(true);
    if (!sacado.ok) return;
    expect(sacado.estado.contenido.sesiones.map((s) => s.id)).toEqual(["s-2"]);
    expect(sacado.estado.contenido.fuera).toEqual(["meet:m1", "meet:m7"]);
    const devuelto = aplicarOperaciones(sacado.estado, devolverALaExploracion(sacadas), validez, VALIDADOR_LIBRE);
    expect(devuelto.ok).toBe(true);
    if (!devuelto.ok) return;
    expect(devuelto.estado.contenido.sesiones.map((s) => s.id).sort()).toEqual(["s-1", "s-2"]);
    expect(devuelto.estado.contenido.fuera).toEqual([]);
  });

  it("«Agregar como sesión» desde Fuera: la sesión trae su reunión y su día", () => {
    expect(sesionDesdeLaReunion({ id: "m7", origen: "meet", fecha: "2026-09-29T02:00:00.000Z" }, "s-9")).toEqual({
      id: "s-9",
      reunion: { id: "m7", origen: "meet" },
      fecha: "2026-09-28",
    });
  });
});
