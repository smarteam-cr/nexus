import { describe, expect, it } from "vitest";
import {
  acuerdoBienFormado,
  calcularCuando,
  dependenciasDeOperacionesDeTareas,
  fechaDichaEnElMensaje,
  fusionarOperacionesDeTareas,
  huellaDeOperacion,
  numerosNombrados,
  podarOperacionesDeTareas,
  prepararOperacionesDeTareas,
  type FotoDeTareas,
  type OperacionDeTareas,
  type ProyectoDeLaFoto,
  type TareaDeLaFoto,
  referenciasDeOperaciones,
  soltarColgadas,
} from "./operaciones";
import { ventanaDeTareas } from "./ventana";
import { anunciaUnCambio, AVISO_SIN_ACUERDO_DE_TAREAS, reclamoDeOmisionDeTareas, sinMarcadores, textoDelDesenlaceDeTareas, textoDelTopeDiario } from "./textos";
import { describirOperacionesDeTareas, rotulosDeOperaciones, textoDelBotonDeTareas } from "./lineas";
import { diasHabilesEntre, fechaDelDiaHabil } from "./plan";
import { PROMPT_DE_TAREAS, TOOL_ACUERDO_DE_TAREAS } from "./prompt";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { contextoDeRespaldo, LARGO_DEL_CONTEXTO, limpiarContexto } from "../contexto-de-tarea";

// Jueves 8 de octubre de 2026, 10:00 en Costa Rica.
const AHORA = new Date("2026-10-08T16:00:00Z");

const LIDIA = { email: "lidia@x", nombre: "Lidia Flores", equipo: "marketing", equipoNombre: "Marketing" };
const MARCO = { email: "marco@x", nombre: "Marco Salas", equipo: "ventas", equipoNombre: "Ventas" };
const ALE = { email: "ale@x", nombre: "Alejandra Ortega", equipo: "marketing", equipoNombre: "Marketing" };

const tarea = (numero: number, o: Partial<TareaDeLaFoto> = {}): TareaDeLaFoto => ({
  id: `t${numero}`,
  numero,
  titulo: "Revisar los copies del Radisson",
  estado: "pendiente",
  responsableEmail: LIDIA.email,
  equipo: "marketing",
  semana: "2026-10-05",
  clientId: null,
  proyectoId: null,
  abierta: true,
  acciones: { editar: true, reasignar: true, tomar: true, moverDeSemana: true, cambiarPrivada: true },
  ...o,
});

function foto(o: { lidera?: string[]; tareas?: TareaDeLaFoto[]; proyectos?: ProyectoDeLaFoto[] } = {}): FotoDeTareas {
  const proyectos = o.proyectos ?? [];
  return {
    ahora: AHORA,
    yo: { ...LIDIA, lidera: o.lidera ?? [], esSuperAdmin: false },
    personas: new Map([
      ["M1", LIDIA],
      ["M2", MARCO],
      ["M3", ALE],
    ]),
    clientes: new Map([["C1", { id: "c-kolbi", nombre: "kölbi" }]]),
    proyectosHubspot: new Map([["H1", { id: "p-kolbi", nombre: "Implementación kölbi", clientId: "c-kolbi" }]]),
    proyectos: new Map(proyectos.map((p, i) => [`R${i + 1}`, p])),
    espacios: new Map([["E1", { id: "e-mkt", nombre: "Marketing", puedeCrear: true }]]),
    personasPorEmail: new Map([LIDIA, MARCO, ALE].map((p) => [p.email, p])),
    clientesVisibles: new Set(["c-kolbi"]),
    nombresDeClientes: new Map([["c-kolbi", "kölbi"]]),
    proyectosHubspotPorId: new Map([["p-kolbi", { nombre: "Implementación kölbi", clientId: "c-kolbi" }]]),
    proyectosPorId: new Map(proyectos.map((p) => [p.id, p])),
    espaciosPorId: new Map([["e-mkt", { nombre: "Marketing", puedeCrear: true }]]),
    tareas: new Map((o.tareas ?? [tarea(12)]).map((t) => [t.numero, t])),
    equiposConLider: new Set(["marketing"]),
    semanasRevisadas: new Set(),
  };
}

describe("el cuándo y las fechas", () => {
  it("lo calcula el código desde hoy; una fecha exacta solo si la persona la escribió", () => {
    expect(calcularCuando("manana", AHORA)).toEqual({ semana: "2026-10-05", vence: "2026-10-09" });
    expect(calcularCuando("lunes", AHORA)).toEqual({ semana: "2026-10-12", vence: "2026-10-12" });
    expect(calcularCuando("proxima_semana", AHORA)).toEqual({ semana: "2026-10-12", vence: null });
    expect(calcularCuando("fin_de_mes", AHORA)).toEqual({ semana: "2026-10-26", vence: "2026-10-31" });
    expect(calcularCuando("mas_adelante", AHORA)).toEqual({ semana: null, vence: null });
    expect(calcularCuando("el martes que viene", AHORA)).toBeNull();
    expect(fechaDichaEnElMensaje("2026-10-15", "para el 15 de octubre")).toBe(true);
    expect(fechaDichaEnElMensaje("2026-10-15", "para el 15/10")).toBe(true);
    expect(fechaDichaEnElMensaje("2026-10-15", "para la otra semana")).toBe(false);
  });

  it("un plan cuenta días hábiles, de lunes a viernes", () => {
    expect(fechaDelDiaHabil("2026-10-12", 1)).toBe("2026-10-12");
    expect(fechaDelDiaHabil("2026-10-12", 6)).toBe("2026-10-19");
    expect(fechaDelDiaHabil("2026-10-10", 1)).toBe("2026-10-12"); // sábado → lunes
    expect(diasHabilesEntre("2026-10-12", "2026-11-10")).toBe(22);
  });
});

describe("prepararOperacionesDeTareas", () => {
  it("normaliza las etiquetas a ids y calcula la fecha", () => {
    const r = prepararOperacionesDeTareas(foto(), [{ op: "tarea.crear", titulo: "Mandar el reporte a kölbi", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", cuando: "manana", cliente: "C1", minutos: 60 }], "anótame mandar el reporte mañana");
    expect(r.rechazadas).toEqual([]);
    expect(r.aceptadas[0]).toMatchObject({ para: { tipo: "yo" }, modo: "proponer", cuando: { vence: "2026-10-09" }, clientId: "c-kolbi", minutos: 60 });
  });

  it("«asígnale» de quien no lidera ni comparte espacio queda como propuesta, y lo dice", () => {
    const r = prepararOperacionesDeTareas(foto(), [{ op: "tarea.crear", titulo: "Revisar la propuesta de kölbi", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "M2", modo: "asignar" }], "asígnale a Marco");
    expect(r.aceptadas[0]).toMatchObject({ para: { tipo: "persona", email: MARCO.email }, modo: "proponer", pidioAsignar: true });
    // La líder de Marketing sí le asigna a Alejandra (de su equipo).
    const deLider = prepararOperacionesDeTareas(foto({ lidera: ["marketing"] }), [{ op: "tarea.crear", titulo: "Diseñar el banner", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "M3", modo: "asignar" }], "asígnale a Ale");
    expect(deLider.aceptadas[0]).toMatchObject({ modo: "asignar" });
  });

  it("rechaza con un motivo: una fecha que no se dijo, un título en voseo, una etiqueta inventada, T-# que no ve", () => {
    const r = prepararOperacionesDeTareas(
      foto(),
      [
        { op: "tarea.crear", titulo: "Mandar el reporte", contexto: "Para que el equipo tenga lo que necesita esta semana.", cuando: "2026-10-20" },
        { op: "tarea.crear", titulo: "Revisá los copies", contexto: "Para que el equipo tenga lo que necesita esta semana." },
        { op: "tarea.crear", titulo: "Llamar a Wherex", contexto: "Para que el equipo tenga lo que necesita esta semana.", cliente: "C9" },
        { op: "tarea.editar", tarea: "T-99", campo: "prioridad", valor: "alta" },
        { op: "tarea.editar", tarea: "T-12", campo: "estado", valor: "hecha" },
        { op: "borrar_todo" },
      ],
      "anótame lo del reporte",
    );
    expect(r.aceptadas).toEqual([]);
    expect(r.rechazadas.map((x) => x.motivo)).toEqual([
      expect.stringContaining("no la dijo la persona"),
      expect.stringContaining("voseo"),
      expect.stringContaining("C9 no es un cliente"),
      expect.stringContaining("T-99 no existe"),
      expect.stringContaining("no se edita «estado»"),
      expect.stringContaining("no es una operación"),
    ]);
  });

  it("un plan: el proyecto con su ref y sus tareas por día hábil, con fecha calculada", () => {
    const r = prepararOperacionesDeTareas(
      foto(),
      [
        { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", cliente: "C1", inicia: "lunes" },
        { op: "tarea.crear", ref: "k1", titulo: "Hacer el kickoff interno", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", dia: 1 },
        { op: "tarea.crear", titulo: "Configurar el pipeline", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "nadie", proyecto: "onb1", dia: 6, despuesDe: ["k1"] },
      ],
      "arma el plan de onboarding de kölbi",
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.aceptadas[0]).toMatchObject({ op: "proyecto.crear", ref: "onb1", espacioId: "e-mkt", clientId: "c-kolbi", inicia: "2026-10-12" });
    expect(r.aceptadas[2]).toMatchObject({ dia: 6, cuando: { vence: "2026-10-19" }, para: { tipo: "nadie" }, despuesDe: [{ ref: "k1" }] });
    expect(dependenciasDeOperacionesDeTareas(r.aceptadas)).toEqual([[], [0], [0, 1]]);
  });

  it("numerosNombrados saca las T-# del lote crudo", () => {
    expect(numerosNombrados([{ op: "tarea.editar", tarea: "T-12" }, { op: "tarea.depender", tarea: "t-3", despuesDe: ["T-4", "k1"] }]).sort()).toEqual([12, 3, 4].sort());
  });
});

describe("lo pendiente", () => {
  const ops: OperacionDeTareas[] = [
    { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding", espacioId: "e-mkt" },
    { op: "tarea.crear", ref: "k1", titulo: "Hacer el kickoff", para: { tipo: "yo" }, modo: "proponer", proyecto: { ref: "onb1" } },
    { op: "tarea.crear", titulo: "Llamar a Marco", para: { tipo: "persona", email: MARCO.email }, modo: "proponer" },
  ];

  it("descartar el proyecto se lleva sus tareas; lo nuevo idéntico no se duplica y su ref que choca se renombra", () => {
    const f = fusionarOperacionesDeTareas(ops, [], new Set([0]));
    expect(f.operaciones.map((o) => o.op)).toEqual(["tarea.crear"]);
    expect(f.descartadas).toEqual([0, 1]);
    const g = fusionarOperacionesDeTareas(ops, [{ op: "tarea.crear", titulo: "Llamar a Marco", para: { tipo: "persona", email: MARCO.email }, modo: "proponer", origen: "c:otro:0" }, { op: "proyecto.crear", ref: "onb1", nombre: "Otro", espacioId: "e-mkt" }], new Set());
    expect(g.operaciones).toHaveLength(4);
    expect(g.operaciones[3]).toMatchObject({ ref: "onb1_2" });
  });

  it("podar: cae lo que ya no se ve, sin pedir la fecha literal", () => {
    const p = podarOperacionesDeTareas(foto({ tareas: [] }), [...ops, { op: "tarea.editar", tarea: { numero: 12 }, campo: "prioridad", valor: "alta" }]);
    expect(p.vivas).toHaveLength(3);
    expect(p.caidas[0].motivo).toContain("ya no está");
  });
});

describe("lo que se lee", () => {
  it("una línea por operación, en tuteo, con quién decide; el botón dice lo que hace", () => {
    const f = foto();
    const r = prepararOperacionesDeTareas(
      f,
      [
        { op: "tarea.crear", titulo: "Revisar los copies del Radisson", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", cuando: "manana", minutos: 60 },
        { op: "tarea.crear", titulo: "Dejar administrable la landing", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "M2", cuando: "viernes" },
      ],
      "anótame y sugiérele a Marco",
    );
    const lineas = describirOperacionesDeTareas(f, r.aceptadas);
    expect(lineas[0]).toBe("Crear «Revisar los copies del Radisson» · para ti · vie 9 oct · 1 h · parecida a T-12 — Para que el equipo tenga lo que necesita esta semana.");
    expect(lineas[1]).toBe("Proponerle a Marco Salas (Ventas) «Dejar administrable la landing» · vie 9 oct · la decide Marco — Para que el equipo tenga lo que necesita esta semana.");
    for (const l of lineas) expect(voseoEnProsa(l)).toEqual([]);
    const rot = rotulosDeOperaciones(f, r.aceptadas);
    expect(textoDelBotonDeTareas(rot, new Set())).toBe("Crear 2 tareas");
    expect(textoDelBotonDeTareas(rot, new Set([0]))).toBe("Mandarle la sugerencia a Marco Salas");
  });

  it("el prompt y la herramienta: tuteo, una sola herramienta con el nombre de siempre", () => {
    expect(voseoEnProsa(PROMPT_DE_TAREAS)).toEqual([]);
    expect(TOOL_ACUERDO_DE_TAREAS.name).toBe("registrar_cambio_acordado");
  });
});

describe("la ventana del hilo", () => {
  const cse = (t: string) => ({ rol: "CSE", contenido: t, shaDeContexto: "s" });
  const asis = (t: string) => ({ rol: "ASISTENTE", contenido: t, shaDeContexto: "s" });
  const desenlace = (ok: boolean) => ({ rol: "ASISTENTE", contenido: `<<<DESENLACE>>>{"ok":${ok}}\n\nListo.`, shaDeContexto: null });

  it("arranca después del último acuerdo aplicado, y no después de uno que falló", () => {
    const t = [cse("a"), asis("b"), desenlace(true), cse("c"), asis("d"), desenlace(false), cse("e")];
    expect(ventanaDeTareas(t).map((x) => x.contenido)).toEqual(["c", "d", t[5].contenido, "e"]);
  });

  it("como mucho 12, saltando de a 6 (el prefijo no cambia en cada turno), y empieza en un turno de la persona", () => {
    const t = Array.from({ length: 16 }, (_, i) => (i % 2 ? asis(`r${i}`) : cse(`p${i}`)));
    const v = ventanaDeTareas(t);
    expect(v.length).toBeLessThanOrEqual(12);
    expect(v[0].rol).toBe("CSE");
    // Dos turnos más (persona y asistente) no corren el inicio.
    expect(ventanaDeTareas([...t, cse("p16"), asis("r17")])[0]).toBe(v[0]);
  });
});

describe("lo que lo pendiente nombra, y un cliente por su nombre", () => {
  it("referenciasDeOperaciones junta T-#, proyectos y proyectos de HubSpot", () => {
    expect(
      referenciasDeOperaciones([
        { op: "tarea.editar", tarea: { numero: 7 }, campo: "proyecto", valor: "p-1" },
        { op: "tarea.crear", titulo: "Llamar", para: { tipo: "yo" }, modo: "proponer", proyecto: { id: "p-2" }, projectId: "h-1", despuesDe: [{ numero: 3 }] },
      ]),
    ).toEqual({ numeros: [7, 3], proyectos: ["p-1", "p-2"], proyectosHubspot: ["h-1"] });
  });

  it("un cliente que no está en la lista se resuelve por su nombre exacto, solo entre los que ve", () => {
    const f = { ...foto(), clientesVisibles: new Set(["c-kolbi", "c-w1", "c-w2"]), nombresDeClientes: new Map([["c-kolbi", "kölbi"], ["c-w1", "Wherex"], ["c-w2", "Wherex"]]) };
    const ok = prepararOperacionesDeTareas(f, [{ op: "tarea.crear", titulo: "Llamar a kölbi", contexto: "Para que el equipo tenga lo que necesita esta semana.", cliente: "KOLBI" }], "anótame llamar");
    expect(ok.aceptadas[0]).toMatchObject({ clientId: "c-kolbi" });
    const dos = prepararOperacionesDeTareas(f, [{ op: "tarea.crear", titulo: "Llamar", contexto: "Para que el equipo tenga lo que necesita esta semana.", cliente: "Wherex" }], "x");
    expect(dos.rechazadas[0].motivo).toContain("varias empresas");
    const ajena = prepararOperacionesDeTareas(f, [{ op: "tarea.crear", titulo: "Llamar", contexto: "Para que el equipo tenga lo que necesita esta semana.", cliente: "Honda" }], "x");
    expect(ajena.rechazadas[0].motivo).toContain("no es una empresa que vea");
  });

  it("los textos del chat van en tuteo", () => {
    for (const t of [
      AVISO_SIN_ACUERDO_DE_TAREAS,
      reclamoDeOmisionDeTareas(true),
      reclamoDeOmisionDeTareas(false),
      textoDelTopeDiario(30),
      textoDelDesenlaceDeTareas({ ok: true, detalle: "se crearon 2 tareas" }),
      textoDelDesenlaceDeTareas({ ok: false, detalle: "T-12 ya no se puede mover" }),
    ]) {
      expect(voseoEnProsa(t)).toEqual([]);
    }
  });
});

describe("la revisión de 1B", () => {
  it("la huella distingue dos «pasar» de tareas distintas (no las deduplica)", () => {
    const a: OperacionDeTareas = { op: "tarea.mover-semana", tarea: { numero: 12 }, cuando: { semana: "2026-10-12", vence: null } };
    const b: OperacionDeTareas = { op: "tarea.mover-semana", tarea: { numero: 15 }, cuando: { semana: "2026-10-19", vence: null } };
    expect(huellaDeOperacion(a)).not.toBe(huellaDeOperacion(b));
    // Lo mismo con las claves en otro orden sí es la misma.
    expect(huellaDeOperacion({ cuando: { vence: null, semana: "2026-10-12" }, tarea: { numero: 12 }, op: "tarea.mover-semana" } as OperacionDeTareas)).toBe(huellaDeOperacion(a));
  });

  it("soltarColgadas: lo que nombra una ref que nadie crea cae, en cadena", () => {
    const ops: OperacionDeTareas[] = [
      { op: "tarea.crear", ref: "k2", titulo: "Mandar el resumen", para: { tipo: "yo" }, modo: "proponer", despuesDe: [{ ref: "k1" }] },
      { op: "tarea.depender", tarea: { numero: 12 }, despuesDe: [{ ref: "k2" }] },
      { op: "tarea.crear", titulo: "Llamar a Marco", para: { tipo: "yo" }, modo: "proponer" },
    ];
    const r = soltarColgadas(ops);
    expect(r.vivas.map((o) => o.op)).toEqual(["tarea.crear"]);
    expect(r.colgadas).toHaveLength(2);
    // Si la ref está en lo pendiente, no cae.
    expect(soltarColgadas(ops, { tareas: new Set(["k1"]), proyectos: new Set() }).colgadas).toEqual([]);
  });

  it("dentro de un plan no hay «Solo para mí», y un borrador ya pendiente no recibe tareas sueltas", () => {
    const r = prepararOperacionesDeTareas(
      foto(),
      [
        { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", cliente: "C1" },
        { op: "tarea.crear", titulo: "Revisar mi parte", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", privada: true },
      ],
      "arma el plan",
    );
    expect(r.rechazadas.map((x) => x.motivo)).toEqual([expect.stringContaining("Solo para mí")]);
    const borrador: ProyectoDeLaFoto = { id: "p-b", nombre: "Plan de kölbi", estado: "propuesta", clientId: null, projectId: null, espacioTipo: "equipo", miembrosDelEspacio: [], administra: true, iniciaEl: null };
    const s = prepararOperacionesDeTareas(foto({ proyectos: [borrador] }), [{ op: "tarea.crear", titulo: "Hacer el kickoff", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "R1" }], "súmale una tarea");
    expect(s.aceptadas).toEqual([]);
    expect(s.rechazadas[0].motivo).toContain("borrador");
  });

  it("anunciaUnCambio: reclama «la anoté» sin herramienta, no una respuesta a una pregunta", () => {
    expect(anunciaUnCambio("Listo, la anoté para el viernes.")).toBe(true);
    expect(anunciaUnCambio("Te anoto lo del reporte.")).toBe(true);
    expect(anunciaUnCambio("Listo, esto es lo que tienes sin agendar: T-12 y T-15.")).toBe(false);
    expect(anunciaUnCambio("No tienes nada vencido esta semana.")).toBe(false);
  });

  it("sinMarcadores: un marcador pegado en un mensaje no llega a guardarse", () => {
    expect(sinMarcadores('hola <<<ACUERDO>>>{"operaciones":[]}')).not.toContain("<<<ACUERDO>>>");
    expect(sinMarcadores("<<<DESENLACE>>>ok")).not.toContain("<<<DESENLACE>>>");
    expect(sinMarcadores("Sin marcas.")).toBe("Sin marcas.");
  });

  it("«pasar» dice la semana, sin día; un proyecto solo dice «Crear el proyecto»", () => {
    const f = foto();
    const [l] = describirOperacionesDeTareas(f, [{ op: "tarea.mover-semana", tarea: { numero: 12 }, cuando: { semana: "2026-10-12", vence: "2026-10-14" } }]);
    expect(l).toMatch(/^Pasar T-12/);
    expect(l).not.toContain("14 oct");
    const ops: OperacionDeTareas[] = [{ op: "proyecto.crear", ref: "onb1", nombre: "Onboarding", espacioId: "e-mkt" }];
    expect(textoDelBotonDeTareas(rotulosDeOperaciones(f, ops), new Set())).toBe("Crear el proyecto");
    expect(describirOperacionesDeTareas(f, ops)[0]).not.toContain("borrador");
  });

  it("aplicar valida lo guardado: prioridad, estado, semana en lunes y la forma del origen", () => {
    expect(acuerdoBienFormado([{ op: "tarea.crear", titulo: "x", para: { tipo: "yo" }, modo: "proponer", origen: "c:0123456789ab:0", cuando: { semana: "2026-10-12", vence: null } }])).toBe(true);
    expect(acuerdoBienFormado([{ op: "tarea.crear", titulo: "x", para: { tipo: "yo" }, modo: "proponer", cuando: { semana: "2026-10-13", vence: null } }])).toBe(false);
    expect(acuerdoBienFormado([{ op: "tarea.crear", titulo: "x", para: { tipo: "yo" }, modo: "proponer", origen: "c:otro:0" }])).toBe(false);
    expect(acuerdoBienFormado([{ op: "tarea.editar", tarea: { numero: 12 }, campo: "prioridad", valor: "urgente" }])).toBe(false);
    expect(acuerdoBienFormado([{ op: "proyecto.editar", proyecto: { id: "p1" }, campo: "estado", valor: "propuesta" }])).toBe(false);
  });
});

describe("el contexto de cada tarea (2026-10-09)", () => {
  it("el chat no deja crear una tarea sin contexto, ni con uno en voseo o que repite el título", () => {
    const r = prepararOperacionesDeTareas(
      foto(),
      [
        { op: "tarea.crear", titulo: "Mandar el reporte a kölbi", para: "yo" },
        { op: "tarea.crear", titulo: "Mandar el reporte a kölbi", para: "yo", contexto: "Revisá los números antes de mandarlo." },
        { op: "tarea.crear", titulo: "Mandar el reporte a kölbi", para: "yo", contexto: "Mandar el reporte a kölbi" },
      ],
      "anótame mandar el reporte",
    );
    expect(r.aceptadas).toEqual([]);
    expect(r.rechazadas.map((x) => x.motivo)).toEqual([expect.stringContaining("falta el contexto"), expect.stringContaining("voseo"), expect.stringContaining("repite el título")]);
  });

  it("con contexto entra recortado, y no cuenta para saber si dos tareas son la misma", () => {
    const largo = "Kölbi pidió el reporte mensual de leads para su comité del jueves. ".repeat(10);
    const r = prepararOperacionesDeTareas(foto(), [{ op: "tarea.crear", titulo: "Mandar el reporte a kölbi", para: "yo", contexto: largo }], "anótame mandar el reporte");
    const o = r.aceptadas[0] as Extract<OperacionDeTareas, { op: "tarea.crear" }>;
    expect(o.contexto!.length).toBeLessThanOrEqual(LARGO_DEL_CONTEXTO);
    expect(huellaDeOperacion({ ...o, contexto: "otra forma de decirlo" })).toBe(huellaDeOperacion(o));
  });

  it("sin modelo: el detalle de la línea y el párrafo de la reunión que más se le parece", () => {
    const parrafos = ["**Banner de SAP:** Lidia comentó que el banner de SAP tiene que estar listo para la campaña de octubre, con el logo nuevo.", "**Reporte:** se habló del reporte de leads."];
    expect(contextoDeRespaldo({ titulo: "Diseñar el banner de SAP", detalle: "con el logo nuevo" }, parrafos)).toBe(
      "con el logo nuevo. Lidia comentó que el banner de SAP tiene que estar listo para la campaña de octubre, con el logo nuevo.",
    );
    expect(contextoDeRespaldo({ titulo: "Llamar a Fabio", detalle: null }, parrafos)).toBeNull();
    expect(limpiarContexto("  Para que   Marketing lo use en la campaña.  ", "Diseñar el banner")).toEqual({ contexto: "Para que Marketing lo use en la campaña." });
    // Un gentilicio no es voseo.
    expect(limpiarContexto("Hay que traducir la landing al portugués y al francés para la campaña de Brasil.", "Traducir la landing")).toMatchObject({ contexto: expect.any(String) });
  });

  it("el respaldo no pega el párrafo de otro tema ni de otro cliente, y limpia el formato de Gemini", () => {
    // El tema del párrafo es otro cliente: aunque compartan «revisar» y «pipeline», no es su contexto.
    expect(contextoDeRespaldo({ titulo: "Revisar el pipeline de kölbi" }, ["**Wherex**: revisar el pipeline, están evaluando cancelar el contrato."])).toBeNull();
    // Nombra a otra empresa que la línea no nombra.
    expect(
      contextoDeRespaldo({ titulo: "Revisar el pipeline de ventas" }, ["Se habló de revisar el pipeline de ventas de Wherex porque están evaluando cancelar."], { clientes: ["Wherex", "kölbi"] }),
    ).toBeNull();
    // Comparten solo palabras vacías («para», «esta», «semana»): no alcanza.
    expect(
      contextoDeRespaldo({ titulo: "Banner SAP" }, ["Presupuesto de pauta: Alejandra explica que para esta semana el cliente aprobó el presupuesto."]),
    ).toBeNull();
    // El formato real: tema plano y la hora al final.
    expect(
      contextoDeRespaldo({ titulo: "Definir el foco del email marketing" }, ["Definición del foco del email marketing: el equipo acordó priorizar los leads nuevos de octubre (00:00:18)."]),
    ).toBe("el equipo acordó priorizar los leads nuevos de octubre.");
  });
});
