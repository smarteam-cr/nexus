/**
 * lib/tareas/nucleo.test.ts — el núcleo puro de Tareas internas: estados, semanas, fechas, texto, equipos, ámbito y
 * agenda. Las líneas de las notas son las REALES del «Sprint planning de marketing» del lun 5 oct 2026.
 */
import { describe, it, expect } from "vitest";
import { accionesDe, esLapida, leerEstado, nacePropuesta, columnaDelTablero, leerBloques, repartirBloques } from "./estados";
import { candidatasWhere } from "./donde";
import {
  enVentanaDeRevision,
  primeraSemanaSinRevisar,
  rangoDeLaSemana,
  rolPorDefecto,
  semanaAlAceptar,
  semanaDeLaReunion,
  semanaEnRevision,
  semanaQueCierra,
  estaAtrasada,
} from "./semana";
import { fechaDesdeLaReunion, venceDesdeClave } from "./fechas";
import { cuanSeParecen, esCandidataClara, huellaDeTexto, raices, raicesCompartidas, masParecidas } from "./texto";
import { claveDeEquipo, equipoDeLaMayoria, equiposQueLidera, nombreDelEquipo, tieneTareasManage } from "./equipos";
import { ambitoDe } from "./ambito";
import { enlaceDePlantilla, instanteCR, posicionEnLaGrilla, proponerHorarios } from "./agenda";

/* La hora de Costa Rica es UTC−6. El planning del 5 oct empezó a las 9:30 CR = 15:30 UTC. */
const PLANNING_5_OCT = new Date("2026-10-05T15:30:00Z");
const RETRO_9_OCT = new Date("2026-10-09T22:00:00Z"); // vie 16:00 CR

describe("estados", () => {
  it("un estado desconocido se lee como pendiente (sigue a la vista)", () => {
    expect(leerEstado("cualquier_cosa")).toBe("pendiente");
    expect(leerEstado("hecha")).toBe("hecha");
  });

  it("lápida solo lo que decidió una persona; lo retirado y lo vencido no", () => {
    expect(esLapida({ estado: "rechazada", decision: "rechazada", decididaPorEmail: "lidia@x" })).toBe(true);
    expect(esLapida({ estado: "fusionada", decision: "misma", decididaPorEmail: "lidia@x" })).toBe(true);
    expect(esLapida({ estado: "rechazada", decision: "retirada", decididaPorEmail: "marco@x" })).toBe(false);
    expect(esLapida({ estado: "rechazada", decision: "rechazada", decididaPorEmail: "sistema" })).toBe(false);
    expect(esLapida({ estado: "vencida", decision: "vencida", decididaPorEmail: "sistema" })).toBe(false);
  });

  it("columnas fijas del tablero", () => {
    expect(columnaDelTablero("propuesta")).toBe("por_decidir");
    expect(columnaDelTablero("no_se_hara")).toBeNull();
  });

  it("lo que es para otra persona nace propuesta; directo solo el líder o un compañero del espacio libre", () => {
    const sinNada = { equipoDelResponsable: "marketing", creadorLideraEseEquipo: false, ambosEnElEspacioLibre: false };
    expect(nacePropuesta("lidia@x", "lidia@x", sinNada)).toBe(false);
    expect(nacePropuesta("lidia@x", "alejandra@x", sinNada)).toBe(true);
    expect(nacePropuesta("alejandra@x", "lidia@x", { ...sinNada, creadorLideraEseEquipo: true })).toBe(false);
    expect(nacePropuesta("elias@x", "lidia@x", { ...sinNada, ambosEnElEspacioLibre: true })).toBe(false);
    expect(nacePropuesta(null, "lidia@x", sinNada)).toBe(true); // Nexus nunca asigna directo
    expect(nacePropuesta("lidia@x", null, sinNada)).toBe(false); // «Por asignar»
  });

  it("decide quien la recibe; quien la pidió puede retirarla", () => {
    const t = { estado: "propuesta", responsableEmail: "lidia@x", creadaPorEmail: "marco@x", pedidaPorEmail: "marco@x", equipo: "marketing", semana: "2026-10-05" };
    const lidia = accionesDe(t, { email: "lidia@x", esSuperAdmin: false, lidera: [] });
    expect(lidia.decidir).toBe(true);
    expect(lidia.retirar).toBe(false);
    const marco = accionesDe(t, { email: "marco@x", esSuperAdmin: false, lidera: [] });
    expect(marco.decidir).toBe(false);
    expect(marco.retirar).toBe(true);
  });

  it("solo la dueña agenda, y solo en la semana de hoy o una futura", () => {
    const t = { estado: "pendiente", responsableEmail: "lidia@x", creadaPorEmail: "lidia@x", pedidaPorEmail: null, equipo: "marketing", semana: "2026-10-05" };
    expect(accionesDe(t, { email: "lidia@x", esSuperAdmin: false, lidera: [] }, { lunesDeHoy: "2026-10-05" }).agendar).toBe(true);
    expect(accionesDe(t, { email: "lidia@x", esSuperAdmin: false, lidera: [] }, { lunesDeHoy: "2026-10-12" }).agendar).toBe(false);
    expect(accionesDe(t, { email: "alejandra@x", esSuperAdmin: false, lidera: ["marketing"] }, { lunesDeHoy: "2026-10-05" }).agendar).toBe(false);
  });

  it("«Solo para mí» lo cambia solo su responsable: ni la líder ni dirección", () => {
    const t = { estado: "pendiente", responsableEmail: "lidia@x", creadaPorEmail: "lidia@x", pedidaPorEmail: null, equipo: "marketing", semana: "2026-10-05" };
    expect(accionesDe(t, { email: "lidia@x", esSuperAdmin: false, lidera: [] }).cambiarPrivada).toBe(true);
    const ale = accionesDe(t, { email: "alejandra@x", esSuperAdmin: false, lidera: ["marketing"] });
    expect(ale.editar && !ale.cambiarPrivada).toBe(true);
    const sa = accionesDe(t, { email: "elias@x", esSuperAdmin: true, lidera: [] });
    expect(sa.editar && !sa.cambiarPrivada).toBe(true);
  });

  it("repartirBloques separa los de tu calendario (y cuáles vienen) de los de otra persona", () => {
    const b = (calendario: string, fin: string) => ({ calendario, eventoId: "e", inicio: "2026-10-01T15:00:00Z", fin });
    const r = repartirBloques([b("Lidia@x", "2026-10-01T16:00:00Z"), b("lidia@x", "2026-10-20T16:00:00Z"), b("ana@x", "2026-10-20T16:00:00Z")], "lidia@x", new Date("2026-10-09T12:00:00Z"));
    expect(r.mios).toHaveLength(2);
    expect(r.miosQueVienen).toHaveLength(1);
    expect(r.ajenos.map((x) => x.calendario)).toEqual(["ana@x"]);
  });

  it("las candidatas de una reunión de cliente conservan el filtro de dueños y estado (un OR no pisa al otro)", () => {
    const w = candidatasWhere(["lidia@x"], "marketing", "c-wherex");
    expect(w.OR).toBeUndefined();
    expect(w.AND).toHaveLength(2);
    expect(JSON.stringify(w)).toContain("lidia@x");
    expect(JSON.stringify(w)).toContain("c-wherex");
    expect(candidatasWhere(["lidia@x"], "marketing", null).AND).toHaveLength(1);
  });

  it("leerBloques descarta lo que no tiene forma de bloque", () => {
    expect(leerBloques([{ calendario: "a@x", eventoId: "e1", inicio: "2026-10-08T15:00:00Z", fin: "2026-10-08T16:00:00Z" }, { nada: 1 }, null])).toHaveLength(1);
    expect(leerBloques("x")).toEqual([]);
  });
});

describe("semanas", () => {
  it("el planning del lunes es de esa semana; lo del viernes, de la siguiente", () => {
    expect(semanaDeLaReunion(PLANNING_5_OCT)).toBe("2026-10-05");
    expect(semanaDeLaReunion(RETRO_9_OCT)).toBe("2026-10-12");
    expect(semanaQueCierra(RETRO_9_OCT)).toBe("2026-10-05");
    expect(semanaQueCierra(PLANNING_5_OCT)).toBe("2026-09-28");
  });

  it("un domingo a las 19:00 CR todavía es domingo (no el lunes UTC)", () => {
    const domingo = new Date("2026-10-12T01:00:00Z"); // dom 11 oct 19:00 CR
    expect(semanaDeLaReunion(domingo)).toBe("2026-10-12");
    expect(semanaQueCierra(domingo)).toBe("2026-10-05");
  });

  it("el rol: la retro es de las dos; el planning del lunes, planning", () => {
    expect(rolPorDefecto(PLANNING_5_OCT, "Sprint planning de marketing")).toBe("planning");
    expect(rolPorDefecto(RETRO_9_OCT, "Retrospectiva de marketing")).toBe("ambos");
    expect(rolPorDefecto(RETRO_9_OCT, "Sesión de cierre")).toBe("ambos");
    expect(rolPorDefecto(RETRO_9_OCT, "Algo del viernes")).toBe("cierre");
  });

  it("la ventana de revisión va del viernes 15:00 al lunes 6:00 (hora CR)", () => {
    expect(enVentanaDeRevision(new Date("2026-10-09T20:59:00Z"))).toBe(false); // vie 14:59
    expect(enVentanaDeRevision(new Date("2026-10-09T21:00:00Z"))).toBe(true); // vie 15:00
    expect(enVentanaDeRevision(new Date("2026-10-11T18:00:00Z"))).toBe(true); // dom
    expect(enVentanaDeRevision(new Date("2026-10-12T11:59:00Z"))).toBe(true); // lun 5:59
    expect(enVentanaDeRevision(new Date("2026-10-12T12:00:00Z"))).toBe(false); // lun 6:00
    expect(semanaEnRevision(new Date("2026-10-12T11:00:00Z"))).toBe("2026-10-05");
  });

  it("semanaDestino: salta lo revisado y, con piso, nunca cae en el pasado", () => {
    const revisadas = new Set(["2026-10-05"]);
    expect(primeraSemanaSinRevisar("2026-10-05", revisadas, { lunesDeHoy: "2026-10-05", conPiso: true })).toBe("2026-10-12");
    // «Sigue» desde una semana pasada cae en la de hoy, con un solo salto.
    expect(primeraSemanaSinRevisar("2026-10-12", new Set(), { lunesDeHoy: "2026-10-19", conPiso: true })).toBe("2026-10-19");
    expect(primeraSemanaSinRevisar("2026-10-12", new Set(), { lunesDeHoy: "2026-10-19", conPiso: false })).toBe("2026-10-12");
  });

  it("aceptar en el piloto retroactivo conserva la semana de la reunión mientras no se revise", () => {
    const lunesDeHoy = "2026-10-19";
    expect(semanaAlAceptar("2026-10-05", { lunesDeHoy, revisadas: new Set(), deUnaReunion: true })).toBe("2026-10-05");
    expect(semanaAlAceptar("2026-10-05", { lunesDeHoy, revisadas: new Set(["2026-10-05"]), deUnaReunion: true })).toBe("2026-10-19");
    // Un pedido viejo, sin reunión, va a la semana de hoy.
    expect(semanaAlAceptar("2026-10-05", { lunesDeHoy, revisadas: new Set(), deUnaReunion: false })).toBe("2026-10-19");
    // Aceptar en una semana revisada cae en la siguiente.
    expect(semanaAlAceptar("2026-10-19", { lunesDeHoy, revisadas: new Set(["2026-10-19"]), deUnaReunion: false })).toBe("2026-10-26");
  });

  it("rango y atraso", () => {
    expect(rangoDeLaSemana("2026-10-05")).toBe("5 al 9 oct");
    expect(rangoDeLaSemana("2026-09-28")).toBe("28 sep al 2 oct");
    expect(estaAtrasada("2026-10-07", true, "2026-10-08")).toBe(true);
    expect(estaAtrasada("2026-10-07", false, "2026-10-08")).toBe(false);
  });
});

describe("fechas dichas en la reunión", () => {
  it("se cuentan desde la reunión, en hora de Costa Rica", () => {
    expect(fechaDesdeLaReunion("Probar la herramienta durante hoy.", PLANNING_5_OCT)).toBe("2026-10-05");
    expect(fechaDesdeLaReunion("Entregar mañana", PLANNING_5_OCT)).toBe("2026-10-06");
    expect(fechaDesdeLaReunion("Enviar el miércoles", PLANNING_5_OCT)).toBe("2026-10-07");
    expect(fechaDesdeLaReunion("durante esta semana", PLANNING_5_OCT)).toBe("2026-10-09");
    expect(fechaDesdeLaReunion("para la próxima semana", PLANNING_5_OCT)).toBe("2026-10-16");
    expect(fechaDesdeLaReunion("a fin de mes", PLANNING_5_OCT)).toBe("2026-10-31");
    expect(fechaDesdeLaReunion("el 15 de octubre", PLANNING_5_OCT)).toBe("2026-10-15");
    expect(fechaDesdeLaReunion("Revisar la grabación", PLANNING_5_OCT)).toBeNull();
  });

  it("una tarea creada el lunes a las 00:30 UTC todavía es domingo en Costa Rica", () => {
    const domingoNoche = new Date("2026-10-12T00:30:00Z"); // dom 11 oct 18:30 CR
    expect(venceDesdeClave("hoy", domingoNoche)).toBe("2026-10-11");
    expect(venceDesdeClave("lunes", domingoNoche)).toBe("2026-10-12");
  });
});

describe("texto", () => {
  it("la huella iguala textos idénticos y separa los distintos", () => {
    expect(huellaDeTexto("Copies de videos")).toBe(huellaDeTexto("  copies de VÍDEOS ".replace("Í", "I")));
    expect(huellaDeTexto("Copies de videos")).not.toBe(huellaDeTexto("Copies de video"));
  });

  it("las siglas cuentan como raíz («SAP»)", () => {
    expect(raices("Estrategia SAP")).toContain("#sap");
    expect(raicesCompartidas(["Estrategia SAP: montar la campaña", "Sketch landing: diseño de la campaña de SAP", "Gestión landing SAP"], 3)).toContain("#sap");
  });

  it("una candidata clara exige 2 raíces y 2/3 del más corto, sin otro cliente en el medio", () => {
    expect(esCandidataClara("Copies de videos Radisson", "Copies para los videos de Radisson")).toBe(true);
    expect(esCandidataClara("Reporte de Colby", "Reporte de SAP")).toBe(false);
    expect(cuanSeParecen("Análisis Nexus", "Llamadas postevento").comunes).toEqual([]);
  });

  it("masParecidas ordena y descarta lo que no comparte nada", () => {
    const c = [{ t: "Llamadas postevento" }, { t: "Copies de videos Radisson" }, { t: "Videos de testimonios" }];
    expect(masParecidas("Revisar videos de Radisson", c, (x) => x.t, 3).map((x) => x.t)).toEqual(["Copies de videos Radisson", "Videos de testimonios"]);
  });
});

describe("equipos", () => {
  it("la clave es la del área; sin área, persona:", () => {
    expect(claveDeEquipo("Marketing", "a@x")).toBe("marketing");
    expect(claveDeEquipo("CSE", "a@x")).toBe("cs");
    expect(claveDeEquipo("CSL", "a@x")).toBe("cs");
    expect(claveDeEquipo("Development", "a@x")).toBe("desarrollo");
    expect(claveDeEquipo(null, "A@X")).toBe("persona:a@x");
  });

  it("un equipo de una sola persona se muestra como «Tus tareas»", () => {
    expect(nombreDelEquipo("revops", { miembros: 1, paraMi: true })).toBe("Tus tareas");
    expect(nombreDelEquipo("revops", { miembros: 1, paraMi: false })).toBe("RevOps");
  });

  it("el líder es quien tiene tareas.manage en SU override", () => {
    const ov = { v: 1, sections: { tareas: { manage: true } } };
    expect(tieneTareasManage(ov)).toBe(true);
    expect(tieneTareasManage({ v: 1, sections: {} })).toBe(false);
    expect(equiposQueLidera({ email: "a@x", nombre: "A", area: "Marketing", roleEnum: "MARKETING", permissionOverrides: ov })).toEqual(["marketing"]);
  });

  it("el equipo de la reunión es el de la mayoría; con empate, pregunta", () => {
    const m = [
      { email: "a@x", nombre: "A", area: "Marketing", roleEnum: "MARKETING" },
      { email: "l@x", nombre: "L", area: "Marketing", roleEnum: "MARKETING" },
      { email: "e@x", nombre: "E", area: "RevOps", roleEnum: "SUPER_ADMIN" },
    ];
    expect(equipoDeLaMayoria(["a@x", "l@x", "e@x", "cliente@otro.com"], m)).toBe("marketing");
    expect(equipoDeLaMayoria(["a@x", "e@x"], m)).toBeNull();
  });
});

describe("ámbito", () => {
  it("sin empresa es «Sin clasificar», nunca interno", () => {
    expect(ambitoDe(null, null).ambito).toBe("sin_clasificar");
  });
  it("SmartAgro es interno aunque la tarea no tenga proyecto", () => {
    const smartagro = { id: "s", nombre: "SmartAgro", kind: "CLIENTE", todoInterno: true };
    expect(ambitoDe(smartagro, null)).toMatchObject({ ambito: "interno", etiqueta: "Interno · SmartAgro" });
  });
  it("un proyecto interno manda sobre la empresa", () => {
    const smarteam = { id: "t", nombre: "Smarteam", kind: "INTERNO", todoInterno: false };
    expect(ambitoDe(smarteam, { id: "p", nombre: "SICOP", proyectoInterno: true }).etiqueta).toBe("Interno · SICOP");
    expect(ambitoDe(smarteam, null).etiqueta).toBe("Interno · Smarteam");
  });
  it("con empresa, su tipo", () => {
    expect(ambitoDe({ id: "c", nombre: "Colby", kind: "CLIENTE", todoInterno: false }, null).ambito).toBe("cliente");
    expect(ambitoDe({ id: "c", nombre: "X", kind: "PROSPECTO", todoInterno: false }, null).ambito).toBe("prospecto");
    expect(ambitoDe({ id: "c", nombre: "4am", kind: "ALIADO", todoInterno: false }, null).ambito).toBe("aliado");
  });
});

describe("agenda", () => {
  it("instanteCR: las 9:00 de Costa Rica son las 15:00 UTC", () => {
    expect(instanteCR("2026-10-08", 9).toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("propone el primer hueco, alta primero, después de sus dependencias y nunca en el pasado", () => {
    const ahora = new Date("2026-10-08T15:10:00Z"); // jue 9:10 CR
    const ocupado = [{ inicio: "2026-10-08T15:30:00Z", fin: "2026-10-08T17:00:00Z" }]; // 9:30–11:00
    const r = proponerHorarios(
      "2026-10-05",
      [
        { id: "b", minutos: 60, prioridad: "media", venceEl: null, despuesDe: ["a"] },
        { id: "a", minutos: 30, prioridad: "alta", venceEl: null },
      ],
      ocupado,
      ahora,
    );
    const a = r.find((x) => x.tareaId === "a")!;
    const b = r.find((x) => x.tareaId === "b")!;
    expect(a.inicio).toBe("2026-10-08T17:00:00.000Z"); // 11:00: 9:15–9:30 no alcanza para 30 min
    expect(b.inicio).toBe("2026-10-08T17:30:00.000Z"); // después de «a»
  });

  it("sin duración no se agenda; sin hueco lo dice", () => {
    const ahora = new Date("2026-10-09T22:30:00Z"); // vie 16:30 CR: ya no cabe una hora
    const r = proponerHorarios("2026-10-05", [{ id: "x", minutos: 60, prioridad: "media", venceEl: null }, { id: "y", minutos: 0, prioridad: "media", venceEl: null }], [], ahora);
    expect(r.find((x) => x.tareaId === "x")!.motivo).toBe("sin_hueco");
    expect(r.find((x) => x.tareaId === "y")!.motivo).toBe("sin_duracion");
  });

  it("el enlace de plantilla va en UTC con Z, en hora de CR, sin Meet ni invitados", () => {
    const url = enlaceDePlantilla({ titulo: "Subir estático evento", inicio: "2026-10-08T20:00:00Z", fin: "2026-10-08T20:30:00Z", tareaId: "t1", urlDeLaTarea: "https://nexus/tareas?t=t1", correo: "lflores@smarteamcr.com" });
    const p = new URL(url).searchParams;
    expect(p.get("dates")).toBe("20261008T200000Z/20261008T203000Z");
    expect(p.get("ctz")).toBe("America/Costa_Rica");
    expect(p.get("text")).toBe("Tarea · Subir estático evento");
    expect(p.get("details")).toContain("nexustarea t1");
    expect(p.has("vcon")).toBe(false);
    expect(p.has("add")).toBe(false);
  });

  it("la geometría de la grilla: jueves 14:00–14:30 CR", () => {
    const pos = posicionEnLaGrilla({ inicio: "2026-10-08T20:00:00Z", fin: "2026-10-08T20:30:00Z" }, "2026-10-05")!;
    expect(pos.dia).toBe(3);
    expect(pos.arriba).toBeCloseTo(6 / 10);
    expect(pos.alto).toBeCloseTo(0.5 / 10);
    expect(posicionEnLaGrilla({ inicio: "2026-10-12T15:00:00Z", fin: "2026-10-12T16:00:00Z" }, "2026-10-05")).toBeNull();
  });
});
