import { describe, expect, it } from "vitest";
import { CONFIG_DE_FABRICA, completarConfig, horasDisponibles, parteParaCuentas, semaforoDe } from "./config";
import { diasEntre, etiquetaDelLunes, inicioDelLunes, lunesDe, lunesDeFecha, lunesHasta, sumarSemanas } from "./semana";
import { destinoDe, minutosContables, tiempoEnReuniones, type ReunionParaCarga } from "./reuniones";
import { entregaEstimada, horasDeTarea, planDelPeriodo, type CronogramaParaCarga } from "./entrega";
import { correlacion, factorDeComplejidad, horasPorPuntoDeFactor, type DatosDeComplejidad } from "./complejidad";
import { cargaDePersona, cargaDelEquipo, horasPorCuenta } from "./utilizacion";
import { simularTraspasos } from "./simulacion";
import { proyectarDemanda, sumarMeses, tipoDeTrato } from "./contratacion";
import { filasDeCobertura, miles, resumenDeCobertura, type MedicionDeCarga } from "./cobertura";

const C = CONFIG_DE_FABRICA;
const HEIVER = "heiver@smarteamcr.com";
const JC = "jc@smarteamcr.com";
const ALEX = "alex@smarteamcr.com";

describe("A · config", () => {
  it("A1 sin fila guardada rige la de fábrica", () => {
    expect(completarConfig(null)).toEqual(C);
    expect(completarConfig(undefined)).toEqual(C);
  });
  it("A2 una fila vieja sin un campo nuevo se completa con el de fábrica", () => {
    const c = completarConfig({ preparacionMin: 20, pesos: { hub: 0.2 } });
    expect(c.preparacionMin).toBe(20);
    expect(c.pesos.hub).toBe(0.2);
    expect(c.pesos.integracion).toBe(C.pesos.integracion);
    expect(c.horasPorTrato.impl).toBe(C.horasPorTrato.impl);
  });
  it("A3 un valor que no es número no entra", () => {
    expect(completarConfig({ preparacionMin: "20" }).preparacionMin).toBe(15);
    expect(completarConfig({ semaforo: { llena: NaN } }).semaforo.llena).toBe(70);
  });
  it("A4 capacidad: 40 h × 80 % = 32 h; el ajuste por persona manda", () => {
    expect(horasDisponibles(C, HEIVER)).toBe(32);
    const c = completarConfig({ personas: { "Heiver@SmarteamCR.com ": { horasContrato: 20 } } });
    expect(horasDisponibles(c, HEIVER)).toBe(16);
    expect(horasDisponibles(c, JC)).toBe(32);
  });
  it("A5 la CSL va a cuentas con su parte, salvo ajuste propio", () => {
    expect(parteParaCuentas(C, ALEX, true)).toBe(0.4);
    expect(parteParaCuentas(C, HEIVER, false)).toBe(1);
    expect(parteParaCuentas(completarConfig({ personas: { [ALEX]: { paraCuentas: 0.6 } } }), ALEX, true)).toBe(0.6);
  });
  it("A6 semáforo: < 70 con espacio, 70–85 llena, > 85 sobrecarga", () => {
    expect(semaforoDe(69, C)).toBe("con-espacio");
    expect(semaforoDe(70, C)).toBe("llena");
    expect(semaforoDe(85, C)).toBe("llena");
    expect(semaforoDe(86, C)).toBe("sobrecarga");
  });
});

describe("B · semanas en hora de Costa Rica", () => {
  it("B1 el domingo a las 23:00 de CR es de la semana que termina", () => {
    // Domingo 4 oct 23:00 CR = lunes 5 oct 05:00 UTC.
    expect(lunesDe("2026-10-05T05:00:00Z")).toBe("2026-09-28");
    // Lunes 5 oct 00:00 CR = 06:00 UTC.
    expect(lunesDe("2026-10-05T06:00:00Z")).toBe("2026-10-05");
  });
  it("B2 sumar y listar semanas", () => {
    expect(sumarSemanas("2026-09-28", 1)).toBe("2026-10-05");
    expect(lunesHasta("2026-09-28", 3)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(inicioDelLunes("2026-09-28").toISOString()).toBe("2026-09-28T06:00:00.000Z");
    expect(etiquetaDelLunes("2026-09-28")).toBe("28 sep");
    expect(diasEntre("2026-09-01T00:00:00Z", "2026-09-22T00:00:00Z")).toBe(21);
    // Una fecha de calendario guardada a medianoche UTC es de su propio día, no del anterior.
    expect(lunesDeFecha("2026-09-14T00:00:00Z")).toBe("2026-09-14");
    expect(lunesDeFecha("2026-09-20T00:00:00Z")).toBe("2026-09-14");
  });
});

const reunion = (p: Partial<ReunionParaCarga>): ReunionParaCarga => ({
  id: Math.random().toString(36),
  inicio: "2026-09-29T15:00:00Z",
  duracionMin: 60,
  participantes: [HEIVER, "cliente@acme.com"],
  cliente: { id: "acme", nombre: "Acme", tipo: "CLIENTE" },
  ...p,
});

describe("C · reuniones", () => {
  it("C1 una reunión de día completo no cuenta y las largas se topan en 4 h", () => {
    expect(minutosContables(0)).toBeNull();
    expect(minutosContables(480)).toBeNull();
    expect(minutosContables(300)).toBe(240);
    expect(minutosContables(45)).toBe(45);
  });
  it("C2 a dónde va el tiempo: cliente, comercial o interna", () => {
    expect(destinoDe(reunion({})).destino).toBe("cliente");
    expect(destinoDe(reunion({ cliente: { id: "p", nombre: "P", tipo: "PROSPECTO" } })).destino).toBe("comercial");
    expect(destinoDe(reunion({ cliente: { id: "s", nombre: "Smarteam", tipo: "INTERNO" } })).destino).toBe("interna");
    expect(destinoDe(reunion({ cliente: null, participantes: [HEIVER, JC] })).destino).toBe("interna");
    const sinEmpresa = destinoDe(reunion({ cliente: null }));
    expect(sinEmpresa.destino).toBe("comercial");
    expect(sinEmpresa.sinEmpresa).toBe(true);
  });
  it("C3 cada persona del equipo suma su tiempo; la cuenta guarda calendario y minutos-persona", () => {
    const personas = [
      { email: HEIVER, nombre: "Heiver", baja: null },
      { email: JC, nombre: "JC", baja: null },
    ];
    const t = tiempoEnReuniones([reunion({ participantes: [HEIVER, JC, "x@acme.com"] }), reunion({ duracionMin: 30 })], personas, [HEIVER, JC]);
    const s = t.porPersona.get(HEIVER)!.get("2026-09-28")!;
    expect(s.cliente).toBe(90);
    expect(s.reunionesConCliente).toBe(2);
    expect(s.reunionesSinOtroDeCs).toBe(1);
    const acme = t.porCuenta.get("acme")!;
    expect(acme.minutos).toBe(90);
    expect(acme.minutosPersona).toBe(150);
    expect(acme.reuniones).toBe(2);
  });
  it("C4 después de su baja una persona ya no suma; un evento de día completo se descarta", () => {
    const personas = [{ email: HEIVER, nombre: "Heiver", baja: "2026-09-15T00:00:00Z" }];
    const t = tiempoEnReuniones([reunion({}), reunion({ inicio: "2026-09-10T15:00:00Z" }), reunion({ duracionMin: 600 })], personas);
    expect(t.porPersona.get(HEIVER)!.get("2026-09-28")).toBeUndefined();
    expect(t.porPersona.get(HEIVER)!.get("2026-09-07")!.cliente).toBe(60);
    expect(t.reunionesDescartadas).toBe(1);
    expect(t.reunionesContadas).toBe(1);
  });
});

const crono = (fases: CronogramaParaCarga["fases"], extra: Partial<CronogramaParaCarga> = {}): CronogramaParaCarga => ({
  proyectoId: "p1",
  clienteId: "acme",
  responsableEmail: HEIVER,
  ancla: "2026-09-14T00:00:00Z",
  fases,
  ...extra,
});

describe("D · entrega estimada", () => {
  it("D1 horas de una tarea: tipo de fase × parte de Smarteam × factor", () => {
    expect(horasDeTarea("CONFIGURACION", "SMARTEAM", 1, C)).toBe(2);
    expect(horasDeTarea("CONFIGURACION", "AMBOS", 1.5, C)).toBe(1.5);
    expect(horasDeTarea("CONFIGURACION", "CLIENTE", 2, C)).toBe(0);
    expect(horasDeTarea("CONFIGURACION", "DEV", 2, C)).toBe(0);
    expect(horasDeTarea(null, null, 1, C)).toBe(1.5);
  });
  it("D2 lo que pasó cuenta aunque no se marcó; lo que viene, solo lo abierto; las sesiones no", () => {
    const c = crono([
      {
        orden: 0,
        duracionSemanas: 4,
        semanaInicio: null,
        tipo: "CONFIGURACION",
        tareas: [
          { weekIndex: 0, estado: "DONE", parte: "SMARTEAM", tipo: "TASK", fechaManual: null },
          { weekIndex: 0, estado: "PENDING", parte: "SMARTEAM", tipo: "SESSION", fechaManual: null },
          { weekIndex: 3, estado: "DONE", parte: "SMARTEAM", tipo: "TASK", fechaManual: null },
          { weekIndex: 3, estado: "PENDING", parte: "SMARTEAM", tipo: "TASK", fechaManual: null },
          { weekIndex: 1, estado: "PENDING", parte: "CLIENTE", tipo: "TASK", fechaManual: null },
          { weekIndex: 1, estado: "SUSPENDED", parte: "SMARTEAM", tipo: "TASK", fechaManual: null },
        ],
      },
    ]);
    const e = entregaEstimada([c], () => 1.5, C, new Date("2026-09-30T15:00:00Z"));
    const sem = e.porPersona.get(HEIVER)!;
    expect(sem.get("2026-09-14")!.horas).toBe(3); // la hecha de la semana 0 (la sesión no)
    expect(sem.get("2026-10-05")!.horas).toBe(3); // solo la abierta de la semana 3
    expect(sem.get("2026-10-05")!.tareas).toBe(1);
    expect(sem.get("2026-09-21")).toBeUndefined(); // la del cliente no carga y la suspendida no cuenta
    // Atrasadas: la sesión abierta de la semana 0 (su fin pasó) y no la del cliente.
    expect(e.atrasadas.get(HEIVER)).toBe(1);
  });
  it("D3 sin fecha de arranque no se ubica en una semana: se cuenta aparte", () => {
    const c = crono([{ orden: 0, duracionSemanas: 2, semanaInicio: null, tipo: null, tareas: [{ weekIndex: 0, estado: "PENDING", parte: "SMARTEAM", tipo: "TASK", fechaManual: null }] }], { ancla: null });
    const e = entregaEstimada([c], () => 1, C, new Date("2026-09-30T15:00:00Z"));
    expect(e.sinFecha.get(HEIVER)).toBe(1);
    expect(e.porPersona.get(HEIVER)).toBeUndefined();
  });
  it("D4 una fecha manual gana sobre la del plan", () => {
    const c = crono([
      { orden: 0, duracionSemanas: 2, semanaInicio: null, tipo: "PLANIFICACION", tareas: [{ weekIndex: 0, estado: "PENDING", parte: "SMARTEAM", tipo: "TASK", fechaManual: "2026-10-20T15:00:00Z" }] },
    ]);
    const e = entregaEstimada([c], () => 1, C, new Date("2026-09-30T15:00:00Z"));
    expect(e.porPersona.get(HEIVER)!.get("2026-10-19")!.horas).toBe(1.5);
  });
  it("D5 el plan del período cuenta sesiones y horas por cuenta", () => {
    const c = crono([
      {
        orden: 0,
        duracionSemanas: 2,
        semanaInicio: null,
        tipo: "ADOPCION",
        tareas: [
          { weekIndex: 0, estado: "DONE", parte: "SMARTEAM", tipo: "SESSION", fechaManual: null },
          { weekIndex: 1, estado: "PENDING", parte: "SMARTEAM", tipo: "TASK", fechaManual: null },
        ],
      },
    ]);
    const p = planDelPeriodo([c], () => 2, C, new Date("2026-09-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z")).get("acme")!;
    expect(p).toEqual({ sesiones: 1, horasTareas: 2 });
  });
});

const datos = (d: Partial<DatosDeComplejidad> = {}): DatosDeComplejidad => ({
  ediciones: null,
  usuarios: null,
  integracion: false,
  migracion: false,
  etapas: [],
  industria: null,
  tendenciaDeUso: null,
  diasSinReunion: 5,
  nivelEscala: null,
  ...d,
});

describe("E · factor de complejidad", () => {
  it("E1 sin datos: 1,0, y cada variable sin dato dice que falta", () => {
    const f = factorDeComplejidad(datos(), C);
    expect(f.factor).toBe(1);
    expect(f.variables.filter((v) => v.estado === "falta").map((v) => v.clave)).toEqual(["hubs", "enterprise", "usuarios", "etapa", "industria", "escala", "uso"]);
  });
  it("E2 una cuenta compleja suma por cada variable", () => {
    const f = factorDeComplejidad(
      datos({
        ediciones: { sales: "enterprise", marketing: "professional", service: "professional", content: "starter" },
        usuarios: 35,
        integracion: true,
        etapas: ["Configuración técnica"],
        industria: "BANKING",
        tendenciaDeUso: -0.12,
        diasSinReunion: 30,
      }),
      C,
    );
    // 1 + hubs 0,2 + enterprise 0,1 + usuarios 0,2 + integración 0,3 + implementación 0,3 + regulada 0,1 + uso 0,15 + fría 0,1
    expect(f.factor).toBe(2.45);
    expect(f.variables.find((v) => v.clave === "hubs")!.valor).toBe("3: Sales Enterprise, Marketing Pro, Service Pro");
  });
  it("E3 el tope de hubs y el techo del factor", () => {
    const seis = { a: "professional", b: "professional", c: "professional", d: "professional", e: "professional", f: "professional", g: "professional" };
    expect(factorDeComplejidad(datos({ ediciones: seis }), C).variables[0].suma).toBe(0.4);
    const pesada = completarConfig({ pesos: { integracion: 5 } });
    expect(factorDeComplejidad(datos({ integracion: true }), pesada).factor).toBe(3);
  });
  it("E4 sin reuniones la relación cuenta como fría", () => {
    expect(factorDeComplejidad(datos({ diasSinReunion: null }), C).factor).toBe(1.1);
    expect(factorDeComplejidad(datos({ diasSinReunion: 21 }), C).factor).toBe(1);
  });
  it("E5 horas por punto de factor y correlación", () => {
    expect(horasPorPuntoDeFactor([{ factor: 1, horasPorSemana: 2 }, { factor: 2, horasPorSemana: 6 }])).toBeCloseTo(8 / 3);
    expect(correlacion([[1, 1], [2, 2], [3, 3]])).toBeCloseTo(1);
    expect(correlacion([[1, 1], [2, 2]])).toBeNull();
    expect(correlacion([[1, 1], [1, 2], [1, 3]])).toBeNull();
  });
});

describe("F · utilización", () => {
  const personas = [
    { email: HEIVER, nombre: "Heiver", baja: null },
    { email: JC, nombre: "JC", baja: null },
  ];
  const semanas = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
  // Heiver: 30 h de reuniones con Acme por semana (10 de 3 h), sin entrega.
  const reuniones = semanas.flatMap((l) =>
    Array.from({ length: 10 }, (_, i) => reunion({ inicio: new Date(Date.parse(`${l}T15:00:00Z`) + i * 3_600_000).toISOString(), duracionMin: 180 })),
  );
  const tiempo = tiempoEnReuniones(reuniones, personas, [HEIVER, JC]);
  const sinEntrega = { porPersona: new Map(), atrasadas: new Map(), sinFecha: new Map() };

  it("F1 horas = reuniones + preparación; utilización sobre 32 h", () => {
    const p = cargaDePersona({ email: HEIVER, nombre: "Heiver", esCsl: false }, tiempo, sinEntrega, C, { semanas, futuras: ["2026-10-05"] });
    const s = p.semanas[3];
    expect(s.cliente).toBe(30);
    expect(s.preparacion).toBe(2.5);
    expect(s.total).toBe(32.5);
    expect(s.utilizacion).toBe(102);
    expect(s.semaforo).toBe("sobrecarga");
    expect(p.racha).toBe(4);
    expect(p.senal).toBe(true);
    expect(p.proyeccion[0].total).toBe(32.5);
    expect(p.proyeccion[0].proyectada).toBe(true);
    expect(p.ultimaSemanaConReuniones).toBe("2026-09-28");
  });
  it("F2 la racha se corta en la última semana que no estuvo en sobrecarga", () => {
    const p = cargaDePersona({ email: HEIVER, nombre: "Heiver", esCsl: false }, tiempo, sinEntrega, C, { semanas: [...semanas, "2026-10-05"], futuras: [] });
    expect(p.racha).toBe(0);
    expect(p.senal).toBe(false);
  });
  it("F3 el equipo deja fuera a la CSL", () => {
    const h = cargaDePersona({ email: HEIVER, nombre: "Heiver", esCsl: false }, tiempo, sinEntrega, C, { semanas, futuras: [] });
    const j = cargaDePersona({ email: JC, nombre: "JC", esCsl: false }, tiempo, sinEntrega, C, { semanas, futuras: [] });
    const a = cargaDePersona({ email: ALEX, nombre: "Alex", esCsl: true }, tiempo, sinEntrega, C, { semanas, futuras: [] });
    const eq = cargaDelEquipo([h, j, a], C);
    expect(eq.disponible).toBe(64);
    expect(eq.horas).toBe(32.5);
    expect(eq.utilizacion).toBe(51);
  });
  it("F4 lo que pide cada cuenta por semana", () => {
    const cuentas = horasPorCuenta(HEIVER, tiempo, sinEntrega, semanas, C);
    expect(cuentas).toEqual([{ clienteId: "acme", reuniones: 30, preparacion: 2.5, entrega: 0, horas: 32.5 }]);
  });
});

describe("G · simulador de traspasos", () => {
  it("G1 quien recibe carga el traspaso el primer mes; después, lo mismo", () => {
    const r = simularTraspasos(
      [
        { email: HEIVER, horas: 40, disponible: 32, cuentas: [{ clienteId: "acme", horas: 8 }] },
        { email: JC, horas: 16, disponible: 32, cuentas: [] },
      ],
      [{ clienteId: "acme", de: HEIVER, a: JC }],
      C,
    );
    const h = r.find((x) => x.email === HEIVER)!;
    const j = r.find((x) => x.email === JC)!;
    expect(h.horasDespues).toBe(32);
    expect(h.utilizacionAntes).toBe(125);
    expect(h.utilizacionDespues).toBe(100);
    expect(j.horasPrimerMes).toBe(26);
    expect(j.horasDespues).toBe(24);
    expect(j.semaforoPrimerMes).toBe("llena");
  });
  it("G2 mover una cuenta que no lleva no cambia nada", () => {
    const r = simularTraspasos([{ email: HEIVER, horas: 10, disponible: 32, cuentas: [] }, { email: JC, horas: 10, disponible: 32, cuentas: [] }], [{ clienteId: "x", de: HEIVER, a: JC }], C);
    expect(r.map((x) => x.horasDespues)).toEqual([10, 10]);
  });
});

describe("H · contratación", () => {
  it("H1 el tipo sale del nombre; sin palabras, de si ya es cliente", () => {
    expect(tipoDeTrato("Licencia de HubSpot · Global Supply", true).tipo).toBe("lic");
    expect(tipoDeTrato("FACO · integración Intelisis", true).tipo).toBe("integ");
    expect(tipoDeTrato("Coocique · CRM", false).tipo).toBe("impl");
    expect(tipoDeTrato("Gastropark · creación de marca", false).tipo).toBe("marca");
    expect(tipoDeTrato("Eurostone CR", false)).toEqual({ tipo: "impl", porNombre: false });
    expect(tipoDeTrato("Postgrados · TEC", true)).toEqual({ tipo: "caso", porNombre: false });
  });
  it("H2 un trato suma desde el mes siguiente a su cierre; uno vencido, desde el mes que viene", () => {
    const hoy = new Date("2026-10-05T15:00:00Z");
    const p = proyectarDemanda(
      {
        base: 120,
        capacidad: 160,
        horasPorCse: 32,
        escenario: "ponderado",
        hoy,
        tratos: [
          { id: "1", nombre: "Eurostone CR", pipeline: null, probabilidad: 0.5, cierre: "2026-10-20T00:00:00Z", esClienteActual: false },
          { id: "2", nombre: "Coocique · CRM", pipeline: null, probabilidad: 1, cierre: "2026-08-31T00:00:00Z", esClienteActual: false },
          { id: "3", nombre: "Llantas · CRM", pipeline: null, probabilidad: 1, cierre: "2026-11-30T00:00:00Z", esClienteActual: false },
        ],
      },
      C,
    );
    expect(p.meses.map((m) => m.pipeline)).toEqual([0, 12, 20]);
    expect(p.meses.map((m) => m.utilizacion)).toEqual([75, 83, 88]);
    expect(p.primerMesSobre).toBe("2026-12");
    expect(p.tratosConCierreVencido).toBe(1);
    // Faltan 140 − 136 = 4 h → un CSE; buscar 10 semanas antes del 1 dic.
    expect(p.cseQueFaltan).toBe(1);
    expect(p.abrirBusquedaAntesDe).toBe("2026-09-22");
  });
  it("H3 escenarios: casi cerrado, ponderado y todo", () => {
    const base = { base: 100, capacidad: 160, horasPorCse: 32, hoy: new Date("2026-10-05T15:00:00Z"), meses: 2 };
    const tratos = [{ id: "1", nombre: "Acme · CRM", pipeline: null, probabilidad: 0.5, cierre: "2026-10-10T00:00:00Z", esClienteActual: false }];
    expect(proyectarDemanda({ ...base, tratos, escenario: "seguro" }, C).meses[1].pipeline).toBe(0);
    expect(proyectarDemanda({ ...base, tratos, escenario: "ponderado" }, C).meses[1].pipeline).toBe(4);
    expect(proyectarDemanda({ ...base, tratos, escenario: "todo" }, C).meses[1].pipeline).toBe(8);
    expect(proyectarDemanda({ ...base, tratos, escenario: "todo" }, C).cseQueFaltan).toBe(0);
  });
  it("H4 sumar meses cruza el año", () => {
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });
});

describe("I · qué datos hay", () => {
  const m: MedicionDeCarga = {
    ventana: { desde: "2026-07-01", hasta: "2026-09-30" },
    reuniones: { total: 1935, conDuracion: 1927, diaCompleto: 8, promedioMin: 52 },
    bloquesDeEjecucion: { eventos: 4, personas: 2 },
    tareas: { total: 1441, sesiones: 582, deTrabajo: 840, conParte: 1418, conHoras: 0, cronogramas: 50, cronogramasConFecha: 35, abiertasDelEquipoVencidas: 505, cerradasConQuien: 594 },
    cuentas: { total: 42, conPartner: 40, partnerAl: "2026-07-10", conIntegracion: 29, conIndustria: 27, conEtapa: 42, conReunion: 42, conEscala: 0, conTendencia: 29 },
    fases: { total: 329, conSesiones: 301 },
    capacidad: { guardada: false, personasAjustadas: 0 },
    duenos: { proyectosDeBaja: 11, personasDeBaja: 3 },
  };
  it("I1 las filas salen de lo medido", () => {
    const f = filasDeCobertura(m);
    expect(f).toHaveLength(18);
    expect(f[0].hoy).toContain("1.927 de 1.935");
    expect(f.find((x) => x.dato.startsWith("Horas estimadas"))!.estado).toBe("falta");
    expect(f.find((x) => x.dato === "Hubs, edición y usuarios")!.hoy).toContain("10 jul");
    expect(resumenDeCobertura(f)).toEqual({ tenemos: 4, parcial: 9, falta: 5, total: 18 });
  });
  it("I2 cuando se completa un dato, la fila se pone en verde", () => {
    const f = filasDeCobertura({ ...m, tareas: { ...m.tareas, conHoras: 1441 }, duenos: { proyectosDeBaja: 0, personasDeBaja: 0 } });
    expect(f.find((x) => x.dato.startsWith("Horas estimadas"))!.estado).toBe("tenemos");
    expect(f.find((x) => x.dato === "Dueños vigentes")!.estado).toBe("tenemos");
  });
  it("I3 miles con punto", () => {
    expect(miles(1441)).toBe("1.441");
    expect(miles(1234567)).toBe("1.234.567");
    expect(miles(12)).toBe("12");
  });
});

describe("J · quien entró hace poco", () => {
  it("J1 las semanas antes de entrar no cuentan en su promedio ni en el equipo", () => {
    const personas = [{ email: JC, nombre: "JC", baja: null }];
    const semanas = ["2026-09-14", "2026-09-21", "2026-09-28"];
    const reuniones = [reunion({ participantes: [JC, "x@acme.com"], inicio: "2026-09-29T15:00:00Z", duracionMin: 240 })];
    const tiempo = tiempoEnReuniones(reuniones, personas, [JC]);
    const vacia = { porPersona: new Map(), atrasadas: new Map(), sinFecha: new Map() };
    const p = cargaDePersona({ email: JC, nombre: "JC", esCsl: false, desde: "2026-09-28" }, tiempo, vacia, C, { semanas, futuras: [] });
    expect(p.semanas.map((s) => s.enElEquipo)).toEqual([false, false, true]);
    expect(p.semanas[0].disponible).toBe(0);
    expect(p.semanasEnElEquipo).toBe(1);
    expect(p.promedio.total).toBe(4.3); // 4 h + 15 min de preparación, en su única semana
    const eq = cargaDelEquipo([p], C);
    expect(eq.semanas.map((s) => s.disponible)).toEqual([0, 0, 32]);
    expect(eq.utilizacion).toBe(13);
  });
});
