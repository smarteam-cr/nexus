import { describe, expect, it } from "vitest";
import {
  avisoDeLaPropuestaContraLimites,
  avisoDeLimites,
  citaEstaEnLasFuentes,
  fechaQueCabe,
  horasDelPlan,
  pasaUnLimiteConfirmado,
  ultimoDiaDelPlan,
  fusionarPropuestos,
  limitesDeLaFila,
  limitesDeLaSalidaDelHandoff,
  limitesVigentes,
  normalizarParaCita,
  propuestosSin,
  revisarLimites,
  semanasDeArranque,
  validarCambioDeLimite,
  type LimitesDelCronograma,
} from "./limites";

/* El caso real: Club Amantes del Vino. Arranque el lunes 21 de septiembre de 2026. Vendido en 12
   semanas (sin la Semana 0) y todo listo antes del 31 de diciembre (vence Salesforce). */
const ANCLA = "2026-09-21T00:00:00.000Z";
const HOY_CAV = [
  { name: "Semana 0", durationWeeks: 1, startWeek: null },
  { name: "Diagnóstico", durationWeeks: 2, startWeek: null },
  { name: "Arquitectura y planificación", durationWeeks: 2, startWeek: null },
  { name: "Desarrollo SDK / Integración", durationWeeks: 4, startWeek: 3 },
  { name: "Configuración y migración", durationWeeks: 4, startWeek: 6 },
  { name: "Pruebas y ajustes", durationWeeks: 2, startWeek: null },
  { name: "Capacitación", durationWeeks: 2, startWeek: null },
  { name: "Go-live y cierre", durationWeeks: 1, startWeek: null },
];
const ACOMODADO_CAV = [
  { name: "Semana 0", durationWeeks: 1, startWeek: null },
  { name: "Diagnóstico", durationWeeks: 2, startWeek: null },
  { name: "Arquitectura y planificación", durationWeeks: 2, startWeek: null },
  { name: "Desarrollo SDK / Integración", durationWeeks: 4, startWeek: 3 },
  { name: "Configuración y migración", durationWeeks: 4, startWeek: 5 },
  { name: "Capacitación", durationWeeks: 2, startWeek: 7 },
  { name: "Pruebas y ajustes", durationWeeks: 2, startWeek: null },
  { name: "Go-live y cierre", durationWeeks: 1, startWeek: null },
];
const CONFIRMADOS_CAV: LimitesDelCronograma = {
  fechaLimite: "2026-12-31",
  duracionVendidaSemanas: 12,
  horasVendidas: null,
  confirmacion: {},
  propuestos: null,
  conSemanaCero: true,
};

describe("revisarLimites — el caso real", () => {
  it("hoy (15 semanas, último día el 3 ene): se pasa 2 semanas de lo vendido y 3 días de la fecha límite", () => {
    const r = revisarLimites({ ancla: ANCLA, fases: HOY_CAV, limites: CONFIRMADOS_CAV });
    expect(r.semanasDeArranque).toBe(1);
    expect(r.semanasDelPlan).toBe(14);
    expect(r.duracion).toMatchObject({ vendidas: 12, delPlan: 14, deMas: 2, origen: "confirmado" });
    // 2026-11-18: el cierre es el ÚLTIMO DÍA de la última semana (el 3 ene), no el día siguiente (el 4).
    expect(r.fecha).toMatchObject({ limite: "2026-12-31", cierre: "2027-01-03", diasDeMas: 3, fasesQueSePasan: ["Go-live y cierre"] });
    expect(r.seSale).toBe(true);
  });

  it("acomodado en paralelo (12 semanas, último día el 13 dic): cabe en lo vendido y antes de la fecha límite", () => {
    const r = revisarLimites({ ancla: ANCLA, fases: ACOMODADO_CAV, limites: CONFIRMADOS_CAV });
    expect(r.duracion).toMatchObject({ delPlan: 11, deMas: -1 });
    expect(r.fecha).toMatchObject({ cierre: "2026-12-13", diasDeMas: -18, fasesQueSePasan: [] });
    expect(r.seSale).toBe(false);
  });

  it("los textos dicen cuánto se pasa y qué fases quedan después", () => {
    const r = revisarLimites({ ancla: ANCLA, fases: HOY_CAV, limites: CONFIRMADOS_CAV });
    const a = avisoDeLimites(r, CONFIRMADOS_CAV)!;
    expect(a.seSale).toBe(true);
    expect(a.titulo).toBe("El cronograma no cabe en lo acordado");
    expect(a.lineas).toEqual([
      // 2026-11-18: lo vendido va PRIMERO (en RC se leyó al revés «el plan dura 8 semanas y se vendieron 4»).
      "Se vendieron 12 semanas; el plan dura 14 sin la Semana 0 (2 de más).",
      "La fecha límite es el 31 dic 2026; el plan termina el 3 ene 2027 (3 días de más). Terminan después: «Go-live y cierre».",
    ]);
  });

  it("la barra de la propuesta dice que con ella vuelve a caber", () => {
    const antes = revisarLimites({ ancla: ANCLA, fases: HOY_CAV, limites: CONFIRMADOS_CAV });
    const despues = revisarLimites({ ancla: ANCLA, fases: ACOMODADO_CAV, limites: CONFIRMADOS_CAV });
    expect(avisoDeLaPropuestaContraLimites(antes, despues)).toBe("Con la propuesta, el plan vuelve a caber en lo acordado.");
    expect(avisoDeLaPropuestaContraLimites(despues, antes)).toBe(
      "⚠ Con la propuesta, el plan dura 14 semanas y se vendieron 12 y cierra el 3 ene 2027, 3 días después de la fecha límite. Avísale a Ventas o mueve el límite con el cliente.",
    );
    // Sin nada que decir: los dos caben.
    expect(avisoDeLaPropuestaContraLimites(despues, despues)).toBeNull();
  });
});

/* El caso real que lo corrigió: RC Inmobiliaria · DocuSign (2026-11-18). Arranque el martes 17 nov, 5 fases en 4
   semanas, vendido en 4 semanas con fecha límite el viernes 11 dic. */
describe("revisarLimites — RC · DocuSign (2026-11-18)", () => {
  const ANCLA_RC = "2026-11-17T00:00:00.000Z";
  const FASES_RC = [
    { name: "Accesos y relevamiento", durationWeeks: 1, startWeek: 0 },
    { name: "Conector", durationWeeks: 1, startWeek: 0 },
    { name: "Plantillas", durationWeeks: 2, startWeek: 1 },
    { name: "Pruebas con cliente", durationWeeks: 1, startWeek: 3 },
    { name: "Capacitación y entrega", durationWeeks: 1, startWeek: 3 },
  ];
  const LIMITES_RC: LimitesDelCronograma = { ...CONFIRMADOS_CAV, fechaLimite: "2026-12-11", duracionVendidaSemanas: 4, conSemanaCero: false };

  it("el plan termina el lunes 14 dic (no el martes 15): 3 días de más, y cabe en las 4 semanas", () => {
    const r = revisarLimites({ ancla: ANCLA_RC, fases: FASES_RC, limites: LIMITES_RC });
    expect(ultimoDiaDelPlan(ANCLA_RC, FASES_RC)).toBe("2026-12-14");
    expect(r.fecha).toMatchObject({ cierre: "2026-12-14", diasDeMas: 3, fasesQueSePasan: ["Pruebas con cliente", "Capacitación y entrega"] });
    expect(r.duracion).toMatchObject({ vendidas: 4, delPlan: 4, deMas: 0 });
  });

  it("«Mover la fecha límite» propone el último día del plan, nunca la fecha que ya está", () => {
    const r = revisarLimites({ ancla: ANCLA_RC, fases: FASES_RC, limites: LIMITES_RC });
    expect(fechaQueCabe(r)).toBe("2026-12-14");
    expect(fechaQueCabe(r)).not.toBe(LIMITES_RC.fechaLimite);
    // Si ya cabe, no hay fecha que proponer.
    const cabe = revisarLimites({ ancla: ANCLA_RC, fases: FASES_RC, limites: { ...LIMITES_RC, fechaLimite: "2026-12-14" } });
    expect(cabe.fecha?.diasDeMas).toBe(0);
    expect(fechaQueCabe(cabe)).toBeNull();
  });

  it("lo vendido se lee primero: «Se vendieron 4 semanas; el plan dura 8 (4 de más)»", () => {
    const ocho = [{ name: "A", durationWeeks: 4 }, { name: "B", durationWeeks: 4 }];
    const r = revisarLimites({ ancla: ANCLA_RC, fases: ocho, limites: { ...LIMITES_RC, fechaLimite: null } });
    expect(avisoDeLimites(r, LIMITES_RC)!.lineas).toEqual(["Se vendieron 4 semanas; el plan dura 8 (4 de más)."]);
  });

  it("juntar fases y «Ajustar el plan a lo vendido» piden un límite CONFIRMADO que el plan pase", () => {
    const ocho = [{ name: "A", durationWeeks: 4 }, { name: "B", durationWeeks: 4 }];
    const confirmado = revisarLimites({ ancla: ANCLA_RC, fases: ocho, limites: { ...LIMITES_RC, fechaLimite: null } });
    expect(pasaUnLimiteConfirmado(confirmado)).toBe(true);
    const propuesto = revisarLimites({
      ancla: ANCLA_RC,
      fases: ocho,
      limites: {
        ...LIMITES_RC,
        fechaLimite: null,
        duracionVendidaSemanas: null,
        propuestos: { runId: null, en: "", duracionVendida: { valor: 4, cita: "son cuatro semanas en total", citaVerificada: true } },
      },
    });
    expect(propuesto.seSale).toBe(true);
    expect(pasaUnLimiteConfirmado(propuesto)).toBe(false);
    const cabe = revisarLimites({ ancla: ANCLA_RC, fases: FASES_RC, limites: { ...LIMITES_RC, fechaLimite: null } });
    expect(pasaUnLimiteConfirmado(cabe)).toBe(false);
  });
});

describe("las horas vendidas (2026-11-18)", () => {
  const ANCLA_RC = "2026-11-17T00:00:00.000Z";
  const conHoras = (hs: Array<number | null>, status = "PENDING") => [
    { name: "Plantillas", durationWeeks: 2, tasks: hs.map((h) => ({ horasEstimadas: h, status })) },
  ];
  const LIMITES = { ...CONFIRMADOS_CAV, fechaLimite: null, duracionVendidaSemanas: null, horasVendidas: 40 };

  it("suma las horas de las tareas (sin las suspendidas) y avisa cuánto se pasa", () => {
    expect(horasDelPlan([...conHoras([20, 25, null]), ...conHoras([10], "SUSPENDED")])).toEqual({ horas: 45, conHoras: 2, sinHoras: 1 });
    // Lo que hace solo el cliente no gasta las horas vendidas de Smarteam (ni cuenta como «sin horas»).
    expect(horasDelPlan([{ name: "X", durationWeeks: 1, tasks: [{ horasEstimadas: 3, party: "CLIENTE" }, { horasEstimadas: null, party: "CLIENTE" }] }])).toEqual({ horas: 0, conHoras: 0, sinHoras: 0 });
    const r = revisarLimites({ ancla: ANCLA_RC, fases: conHoras([20, 25, null]), limites: LIMITES });
    expect(r.horas).toMatchObject({ vendidas: 40, delPlan: 45, deMas: 5, sinHoras: 1, origen: "confirmado" });
    expect(r.seSale).toBe(true);
    expect(avisoDeLimites(r, LIMITES)!.lineas).toEqual(["Se vendieron 40 horas; las tareas suman 45 (5 de más). 1 tarea no tiene horas."]);
    expect(pasaUnLimiteConfirmado(r)).toBe(true);
  });

  it("cabe, y sin horas estimadas no hay cuenta (lo dice, no avisa)", () => {
    const cabe = revisarLimites({ ancla: ANCLA_RC, fases: conHoras([12.5, 10]), limites: LIMITES });
    expect(avisoDeLimites(cabe, LIMITES)!.lineas).toEqual(["Se vendieron 40 horas; las tareas suman 22,5: cabe (17,5 de margen)."]);
    const sin = revisarLimites({ ancla: ANCLA_RC, fases: conHoras([null]), limites: LIMITES });
    expect(sin.seSale).toBe(false);
    expect(avisoDeLimites(sin, LIMITES)!.lineas).toEqual(["Se vendieron 40 horas; las tareas todavía no tienen horas estimadas."]);
  });

  it("se confirma y se mueve como los otros dos límites", () => {
    expect(validarCambioDeLimite(null, { campo: "horasVendidas", valor: 40, motivo: "Acuerdo Macro" })).toEqual({
      ok: true,
      reason: "Horas vendidas confirmadas: 40 horas (Acuerdo Macro).",
    });
    expect(validarCambioDeLimite(null, { campo: "horasVendidas", valor: 0 }).ok).toBe(false);
    expect(validarCambioDeLimite(40, { campo: "horasVendidas", valor: 40, motivo: "x", acordadoCon: "y" })).toEqual({
      ok: false,
      error: "Ese ya es el valor confirmado.",
    });
  });

  it("la IA del handoff las propone con su cita", () => {
    const p = limitesDeLaSalidaDelHandoff(
      { limites: { horasVendidas: 40, citaHoras: "La implementación de DocuSign contempla aproximadamente 40 horas de trabajo" } },
      "Ejecutar DocuSign: La implementación de DocuSign contempla aproximadamente 40 horas de trabajo Smarteam.",
      "run1",
      new Date("2026-11-18T10:00:00.000Z"),
    );
    expect(p?.horasVendidas).toEqual({ valor: 40, cita: "La implementación de DocuSign contempla aproximadamente 40 horas de trabajo", citaVerificada: true });
    expect(limitesDeLaFila({ fechaLimite: null, duracionVendidaSemanas: null, horasVendidas: 40, limitesConfirmacion: null, limitesPropuestos: p, conSemanaCero: false }).propuestos?.horasVendidas?.valor).toBe(40);
  });
});

describe("revisarLimites — bordes", () => {
  it("sin Semana 0 (Desarrollo y Web) la primera fase cuenta entera", () => {
    const fases = [{ name: "Relevamiento técnico", durationWeeks: 1 }, { name: "Desarrollo", durationWeeks: 5 }];
    const r = revisarLimites({ ancla: ANCLA, fases, limites: { ...CONFIRMADOS_CAV, duracionVendidaSemanas: 5, fechaLimite: null, conSemanaCero: false } });
    expect(r.semanasDeArranque).toBe(0);
    expect(r.duracion).toMatchObject({ delPlan: 6, deMas: 1 });
  });

  it("un proyecto de Customer Success sin fase de arranque no descuenta nada", () => {
    expect(semanasDeArranque([{ name: "Diagnóstico", durationWeeks: 2 }], true)).toBe(0);
    expect(semanasDeArranque([{ name: "Semana 0", durationWeeks: 2 }], true)).toBe(2);
    expect(semanasDeArranque([{ name: "Semana 0", durationWeeks: 1 }], false)).toBe(0);
  });

  it("sin fecha de arranque no compara la fecha límite, pero sí la duración", () => {
    const r = revisarLimites({ ancla: null, fases: HOY_CAV, limites: CONFIRMADOS_CAV });
    expect(r.fecha).toMatchObject({ cierre: null, diasDeMas: null, fasesQueSePasan: [] });
    expect(r.duracion?.deMas).toBe(2);
    expect(avisoDeLimites(r, CONFIRMADOS_CAV)!.lineas[1]).toContain("sin fecha de arranque no se puede saber");
  });

  it("sin límites no hay aviso", () => {
    const r = revisarLimites({ ancla: ANCLA, fases: HOY_CAV, limites: { ...CONFIRMADOS_CAV, fechaLimite: null, duracionVendidaSemanas: null } });
    expect(r.seSale).toBe(false);
    expect(avisoDeLimites(r, CONFIRMADOS_CAV)).toBeNull();
  });
});

describe("lo que vale mientras nadie confirma", () => {
  const propuestos = {
    runId: "run1",
    en: "2026-09-23T10:00:00.000Z",
    fechaLimite: { valor: "2026-12-31", cita: "la suscripción vence el 31 de diciembre", citaVerificada: true },
    duracionVendida: { valor: 12, cita: "son doce semanas", citaVerificada: false },
  };

  it("vale lo propuesto con cita verificada, y lo dice; lo que no se pudo citar no vale", () => {
    const v = limitesVigentes({ fechaLimite: null, duracionVendidaSemanas: null, propuestos });
    expect(v.fecha).toEqual({ valor: "2026-12-31", origen: "propuesto" });
    expect(v.duracion).toBeNull();
    const r = revisarLimites({ ancla: ANCLA, fases: HOY_CAV, limites: { ...CONFIRMADOS_CAV, fechaLimite: null, duracionVendidaSemanas: null, propuestos } });
    expect(avisoDeLimites(r, { conSemanaCero: true, propuestos })!.lineas[0]).toContain("(lo propuso la IA; falta confirmarlo)");
  });

  it("lo confirmado le gana a lo propuesto", () => {
    const v = limitesVigentes({ fechaLimite: "2027-01-15", duracionVendidaSemanas: 14, propuestos });
    expect(v.fecha).toEqual({ valor: "2027-01-15", origen: "confirmado" });
    expect(v.duracion).toEqual({ valor: 14, origen: "confirmado" });
  });
});

describe("la salida del handoff", () => {
  const FUENTES = "Kick off - CAV (23 sep 2026): la suscripción de Salesforce Marketing Cloud vence el 31 de diciembre de 2026. Duración estimada de 12 semanas desde el arranque.";
  const EN = new Date("2026-09-23T10:00:00.000Z");

  it("toma los dos límites con su cita, y verifica que la cita esté en lo que leyó", () => {
    const p = limitesDeLaSalidaDelHandoff(
      {
        limites: {
          duracionVendidaSemanas: 12,
          citaDuracion: "Duración estimada de 12 semanas desde el arranque",
          fechaLimite: "2026-12-31",
          citaFechaLimite: "**La suscripción de Salesforce Marketing Cloud vence el 31 de diciembre de 2026**",
          noCabe: null,
        },
      },
      FUENTES,
      "run1",
      EN,
    );
    expect(p).toEqual({
      runId: "run1",
      en: "2026-09-23T10:00:00.000Z",
      duracionVendida: { valor: 12, cita: "Duración estimada de 12 semanas desde el arranque", citaVerificada: true },
      fechaLimite: {
        valor: "2026-12-31",
        cita: "**La suscripción de Salesforce Marketing Cloud vence el 31 de diciembre de 2026**",
        citaVerificada: true,
      },
    });
  });

  it("un valor sin cita no se propone; una cita que no está en las fuentes queda sin verificar", () => {
    const p = limitesDeLaSalidaDelHandoff(
      { limites: { duracionVendidaSemanas: 12, citaDuracion: null, fechaLimite: "2026-12-31", citaFechaLimite: "el cliente necesita todo antes de fin de año" } },
      FUENTES,
      "run1",
      EN,
    );
    expect(p?.duracionVendida).toBeUndefined();
    expect(p?.fechaLimite?.citaVerificada).toBe(false);
  });

  it("descarta valores imposibles y la clave ausente", () => {
    expect(limitesDeLaSalidaDelHandoff({}, FUENTES, "r", EN)).toBeNull();
    expect(
      limitesDeLaSalidaDelHandoff({ limites: { duracionVendidaSemanas: 0, citaDuracion: "x x x x x x x x", fechaLimite: "2026-02-31", citaFechaLimite: "abc" } }, FUENTES, "r", EN),
    ).toBeNull();
  });

  it("guarda el «no cabe» que dijo la IA", () => {
    const p = limitesDeLaSalidaDelHandoff({ limites: { noCabe: "Los 11 journeys no entran en 12 semanas: faltan 2." } }, FUENTES, "r", EN);
    expect(p?.noCabe).toBe("Los 11 journeys no entran en 12 semanas: faltan 2.");
  });

  it("una cita corta no prueba nada", () => {
    expect(citaEstaEnLasFuentes("12 semanas", normalizarParaCita(FUENTES))).toBe(false);
  });
});

describe("fusionar y quitar propuestas", () => {
  const base = { runId: "a", en: "x", duracionVendida: { valor: 12, cita: "doce semanas de trabajo", citaVerificada: true } };

  it("no propone lo que ya está confirmado igual", () => {
    expect(fusionarPropuestos(null, base, { fechaLimite: null, duracionVendidaSemanas: 12 })).toBeNull();
    expect(fusionarPropuestos(null, base, { fechaLimite: null, duracionVendidaSemanas: 10 })?.duracionVendida?.valor).toBe(12);
  });

  it("si el handoff nuevo no trae nada, queda la propuesta anterior", () => {
    expect(fusionarPropuestos(base, null, { fechaLimite: null, duracionVendidaSemanas: null })).toEqual(base);
  });

  it("confirmar o descartar un campo lo saca de la propuesta", () => {
    expect(propuestosSin(base, "duracionVendida")).toBeNull();
  });
});

describe("validarCambioDeLimite — mover un límite es un acuerdo", () => {
  it("confirmar por primera vez no pide nada más", () => {
    expect(validarCambioDeLimite(null, { campo: "fechaLimite", valor: "2026-12-31" })).toEqual({
      ok: true,
      reason: "Fecha límite confirmada: 31 dic 2026.",
    });
  });

  it("moverla pide el motivo y con quién se acordó", () => {
    expect(validarCambioDeLimite("2026-12-31", { campo: "fechaLimite", valor: "2027-01-15" })).toMatchObject({ ok: false });
    expect(validarCambioDeLimite("2026-12-31", { campo: "fechaLimite", valor: "2027-01-15", motivo: "Salesforce extendió la licencia" })).toMatchObject({
      ok: false,
      error: "Mover un límite ya confirmado pide con quién del cliente se acordó.",
    });
    expect(
      validarCambioDeLimite("2026-12-31", {
        campo: "fechaLimite",
        valor: "2027-01-15",
        motivo: "Salesforce extendió la licencia dos semanas",
        acordadoCon: "Rafaela Dañino",
      }),
    ).toEqual({
      ok: true,
      reason: "Fecha límite: 31 dic 2026 → 15 ene 2027. Acordado con Rafaela Dañino: Salesforce extendió la licencia dos semanas.",
    });
  });

  it("valida el valor", () => {
    expect(validarCambioDeLimite(null, { campo: "duracionVendida", valor: 0 })).toMatchObject({ ok: false });
    expect(validarCambioDeLimite(null, { campo: "duracionVendida", valor: 12.5 })).toMatchObject({ ok: false });
    expect(validarCambioDeLimite(null, { campo: "fechaLimite", valor: "31/12/2026" })).toMatchObject({ ok: false });
  });
});

describe("limitesDeLaFila", () => {
  it("lee las columnas y el Json tolerando basura", () => {
    const l = limitesDeLaFila({
      fechaLimite: new Date("2026-12-31T00:00:00.000Z"),
      duracionVendidaSemanas: 12,
      limitesConfirmacion: { fechaLimite: { por: "apinzon@smarteamcr.com", rol: "VENTAS", en: "2026-10-02T00:00:00.000Z", fuente: null }, basura: 1 },
      limitesPropuestos: "no es un objeto",
      conSemanaCero: true,
    });
    expect(l).toEqual({
      fechaLimite: "2026-12-31",
      duracionVendidaSemanas: 12,
      horasVendidas: null,
      confirmacion: { fechaLimite: { por: "apinzon@smarteamcr.com", nombre: null, rol: "VENTAS", en: "2026-10-02T00:00:00.000Z", fuente: null } },
      propuestos: null,
      conSemanaCero: true,
    });
  });
});
