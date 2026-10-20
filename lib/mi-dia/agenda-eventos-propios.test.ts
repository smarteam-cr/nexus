/**
 * La cuenta de un evento propio de la agenda (2026-10-19). Elías: tocar «Preparar demo para Accesos Automáticos» en la
 * agenda de «Para ti» tiene que abrir el panel con lo de Accesos Automáticos; tocar «Tenis» o el almuerzo, solo el
 * título, la hora y tus notas. La regla: el nombre ENTERO de UNA empresa en el título (o, si el título no nombra
 * ninguna, en la descripción), con el match de títulos del cascade; con dos, ninguna (invariante 1).
 */
import { describe, expect, it } from "vitest";
import { agendaDelDia, cuentaDelEvento, empresasDeLaReunionInterna, empresasDelEventoPropio, eventosPropios } from "./agenda";
import { siguientePasoParaElPanel } from "./guia";
import { clientesNombradosEnteros, indiceDeClientes } from "@/lib/sessions/clientes-por-texto";

const INDICE = indiceDeClientes([
  { id: "aa", name: "Accesos Automáticos", company: null },
  { id: "honda", name: "Honda Costa Rica", company: null },
  { id: "clinica", name: "Clínica Médica Oceánica", company: null },
  { id: "servica", name: "Grupo Servica", company: null },
  { id: "inve", name: "Grupo Inve", company: null },
  { id: "cav", name: "Club de Amantes del Vino", company: null, siglas: ["CAV"] },
  { id: "plastimex", name: "Plastimex", company: null },
  { id: "cemaco-1", name: "CEMACO", company: null },
  { id: "cemaco-2", name: "Cemaco", company: null },
  { id: "libreria-int", name: "Librería Internacional", company: null },
  { id: "exito", name: "El Éxito", company: "El Éxito" },
  { id: "rc", name: "RC Inmobiliaria", company: "grc.cr" },
]);

const cuenta = (summary: string, description?: string) => cuentaDelEvento({ empresas: empresasDelEventoPropio({ summary, description }, INDICE) });

describe("la cuenta de un evento propio", () => {
  it("el nombre entero de una empresa en el título la decide", () => {
    expect(cuenta("Preparar demo para Accesos Automáticos")).toBe("aa");
    expect(cuenta("Demo: ACCESOS AUTOMATICOS.")).toBe("aa");
    expect(cuenta("Revisar propuesta de Plastimex")).toBe("plastimex");
  });

  it("un evento personal no es de nadie, aunque comparta una palabra con un cliente", () => {
    expect(cuenta("Tenis")).toBeNull();
    expect(cuenta("Almuerzo")).toBeNull();
    expect(cuenta("Cita Médica")).toBeNull();
    expect(cuenta("Sale Juan del colegio")).toBeNull();
  });

  it("medio nombre no alcanza: no se inventa la cuenta", () => {
    expect(cuenta("Preparar reunión Honda")).toBeNull();
    expect(cuenta("Preparar reunión Honda Costa Rica")).toBe("honda");
  });

  it("una palabra que comparten dos empresas no decide; la que las distingue, sí", () => {
    expect(cuenta("Grupo de estudio")).toBeNull();
    expect(cuenta("Preparar QBR Grupo Inve")).toBe("inve");
  });

  it("una sigla declarada cuenta como el nombre entero", () => {
    expect(cuenta("Reporte CAV")).toBe("cav");
  });

  it("dos empresas nombradas: ninguna (invariante 1)", () => {
    expect(empresasDelEventoPropio({ summary: "Comparar Plastimex y Accesos Automáticos" }, INDICE).sort()).toEqual(["aa", "plastimex"]);
    expect(cuenta("Comparar Plastimex y Accesos Automáticos")).toBeNull();
  });

  it("dos registros con el mismo nombre son la misma empresa: cuenta una vez", () => {
    expect(clientesNombradosEnteros("Preparar kickoff CEMACO", INDICE)).toEqual(["cemaco-1"]);
  });

  it("primero el título; si no nombra a nadie, la descripción", () => {
    expect(cuenta("Preparar demo", "Para la reunión con Accesos Automáticos del jueves")).toBe("aa");
    expect(cuenta("Revisar Plastimex", "Lo que pidió Accesos Automáticos")).toBe("plastimex");
    expect(cuenta("Bloque de trabajo", "")).toBeNull();
  });
});

describe("los eventos propios de la agenda llevan su cuenta", () => {
  const ev = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({
    id,
    summary,
    start: { dateTime: "2026-10-22T15:00:00Z" },
    end: { dateTime: "2026-10-22T16:00:00Z" },
    eventType: "default",
    ...extra,
  });

  it("con el índice, cada uno con la empresa que nombra; el bloque de una tarea, sin empresa (abre la tarea)", () => {
    const propios = eventosPropios(
      [
        ev("demo", "Preparar demo para Accesos Automáticos"),
        ev("tenis", "Tenis"),
        ev("bloque", "T-12 · Accesos Automáticos", { extendedProperties: { private: { nexusTareaId: "t12" } } }),
      ],
      INDICE,
    );
    expect(propios.map((p) => [p.id, p.empresas])).toEqual([
      ["demo", ["aa"]],
      ["tenis", []],
      ["bloque", []],
    ]);
  });

  it("sin el índice, ninguno lleva empresa", () => {
    expect(eventosPropios([ev("demo", "Preparar demo para Accesos Automáticos")])[0].empresas).toEqual([]);
  });
});

describe("el siguiente paso del panel", () => {
  const pasos = [
    { equipo: "ventas", fecha: "2026-10-30", que: "Mandar la propuesta" },
    { equipo: "cs", fecha: "2026-10-24", que: "Agendar el kickoff" },
    { equipo: "ventas", fecha: "2026-10-23", que: "Confirmar el presupuesto" },
  ];

  it("el de tu equipo, el más próximo", () => {
    expect(siguientePasoParaElPanel(pasos, "ventas")?.que).toBe("Confirmar el presupuesto");
  });

  it("si tu equipo no tiene, el más próximo de cualquier equipo", () => {
    expect(siguientePasoParaElPanel(pasos, "dev")?.que).toBe("Confirmar el presupuesto");
    expect(siguientePasoParaElPanel(pasos, null)?.que).toBe("Confirmar el presupuesto");
  });

  it("sin pasos, nada", () => {
    expect(siguientePasoParaElPanel([], "cs")).toBeNull();
  });
});

/**
 * Prueba 151 (2026-10-19): «Preparar demo para Accesos Automáticos» en el calendario de Andrés Pinzón, el mié 21 oct
 * 9:00–10:00, con Meet y con alguien más de Smarteam invitado. No es un evento propio (tiene otro invitado): es una
 * reunión interna, y el panel no traía la cuenta.
 */
describe("una reunión interna que nombra a una empresa", () => {
  const MAPAS = { porCorreo: new Map<string, string[]>(), porDominio: new Map([["accesos.cr", ["aa"]]]), internos: new Set(["smarteamcr.com"]) };
  const reunion = (id: string, summary: string, attendees: string[], extra: Record<string, unknown> = {}) => ({
    id,
    summary,
    start: { dateTime: "2026-10-21T15:00:00Z" },
    end: { dateTime: "2026-10-21T16:00:00Z" },
    eventType: "default",
    hangoutLink: "https://meet.google.com/abc-defg-hij",
    attendees: attendees.map((email, i) => ({ email, responseStatus: "accepted", self: i === 0 })),
    ...extra,
  });
  const PREPARAR = reunion("prep", "Preparar demo para Accesos Automáticos", ["apinzon@smarteamcr.com", "lnavarro@smarteamcr.com"]);

  it("el caso real: es interna, con Meet, y nombra a Accesos Automáticos", () => {
    const [r] = agendaDelDia([PREPARAR], { ...MAPAS, nombrar: INDICE });
    expect(r).toMatchObject({ empresas: [], externos: 0, internos: 2, conMeet: true, nombradas: ["aa"] });
    expect(cuentaDelEvento({ empresas: r.nombradas! })).toBe("aa");
  });

  it("⛔ nombrarla no la vuelve una reunión con el cliente: `empresas` sigue vacía (la regla de servicio no la cuenta)", () => {
    const [r] = agendaDelDia([PREPARAR], { ...MAPAS, nombrar: INDICE });
    expect(cuentaDelEvento(r)).toBeNull();
  });

  it("sin el índice (la regla de servicio), no se calcula", () => {
    expect(agendaDelDia([PREPARAR], MAPAS)[0].nombradas).toBeUndefined();
  });

  it("una reunión con alguien de afuera no usa el nombre: su empresa la deciden los invitados", () => {
    const [r] = agendaDelDia(
      [reunion("demo", "Plastimex: Demo HubSpot", ["apinzon@smarteamcr.com", "alejandro@accesos.cr"])],
      { ...MAPAS, nombrar: INDICE },
    );
    expect(r.empresas).toEqual(["aa"]);
    expect(r.nombradas).toBeUndefined();
  });

  it("dos empresas nombradas: ninguna (invariante 1)", () => {
    const [r] = agendaDelDia(
      [reunion("dos", "Comparar Plastimex y Accesos Automáticos", ["apinzon@smarteamcr.com", "lnavarro@smarteamcr.com"])],
      { ...MAPAS, nombrar: INDICE },
    );
    expect(r.nombradas?.sort()).toEqual(["aa", "plastimex"]);
    expect(cuentaDelEvento({ empresas: r.nombradas! })).toBeNull();
  });

  it("la reunión del sprint (una serie) que nombra clientes al pasar en su descripción no es de ninguno", () => {
    const sprint = { summary: "Sprint planning de marketing", description: "Revisar los avances de Plastimex y el reporte de Accesos Automáticos", recurringEventId: "serie-1" };
    expect(empresasDeLaReunionInterna(sprint, INDICE)).toEqual([]);
    // Con un solo cliente en la descripción, tampoco: la descripción de una serie es la agenda de siempre.
    expect(empresasDeLaReunionInterna({ ...sprint, description: "Hoy: el reporte de Plastimex" }, INDICE)).toEqual([]);
  });

  it("una serie cuyo TÍTULO nombra al cliente sí es de él; una reunión suelta usa también la descripción", () => {
    expect(empresasDeLaReunionInterna({ summary: "Seguimiento interno Plastimex", recurringEventId: "serie-2" }, INDICE)).toEqual(["plastimex"]);
    expect(empresasDeLaReunionInterna({ summary: "Revisión Pipeline de Formalizaciones", description: "Caso Plastimex" }, INDICE)).toEqual(["plastimex"]);
  });

  it("un título interno común no es de nadie", () => {
    for (const t of ["Sprint planning de marketing", "Bienvenidos Maria José - William - Alejandro", "Andrés: rol, metas y esquema de comisiones", "Reunión semanal Smarteam"]) {
      expect(empresasDeLaReunionInterna({ summary: t }, INDICE), t).toEqual([]);
    }
  });
});

/**
 * Medido sobre las reuniones internas de octubre de todo el equipo (2026-10-19): con una sola palabra distintiva,
 * «éxito» o «inmobiliaria» sueltas calzaban con El Éxito y RC Inmobiliaria. Vale para la reunión interna y para el
 * evento propio (es la misma regla del nombre entero).
 */
describe("un nombre con una sola palabra distintiva", () => {
  it("con palabras cortas, tiene que aparecer seguido", () => {
    expect(cuenta("Sobre Casos de Éxito- progreso-")).toBeNull();
    expect(cuenta("Custom Agent - Inmobiliaria")).toBeNull();
    expect(cuenta("Propuesta para El Éxito")).toBe("exito");
    expect(cuenta("RC Inmobiliaria: Interno")).toBe("rc");
  });

  it("la palabra distintiva va con mayúscula, como un nombre propio", () => {
    expect(cuenta("Cómo medir el éxito del onboarding")).toBeNull();
    const conLibreria = indiceDeClientes([{ id: "cemaco-int", name: "Cemaco Internacional", company: null }, { id: "libreria-int", name: "Librería Internacional", company: null }]);
    expect(clientesNombradosEnteros("Hablemos de librería", conLibreria)).toEqual([]);
    expect(clientesNombradosEnteros("Hablemos de Librería", conLibreria)).toEqual(["libreria-int"]);
  });

  it("los sufijos legales no cuentan, y una palabra larga que no distingue puede faltar en el medio", () => {
    const conSufijos = indiceDeClientes([
      { id: "gs", name: "Global Supply S.A", company: null },
      { id: "metzger", name: "Metzger Supply", company: null },
      { id: "luis", name: "Luis SA", company: null },
      { id: "plx", name: "Plastimex S.A.", company: null },
      { id: "ramirez", name: "El Grupo Ramírez", company: null },
      { id: "grupo-otro", name: "Grupo Otro", company: null },
    ]);
    expect(clientesNombradosEnteros("Global Supply S.A | cierre", conSufijos)).toEqual(["gs"]);
    expect(clientesNombradosEnteros("Seguimiento Global Supply", conSufijos)).toEqual(["gs"]);
    expect(clientesNombradosEnteros("Pendientes Luis", conSufijos)).toEqual(["luis"]);
    expect(clientesNombradosEnteros("Revisar Plastimex", conSufijos)).toEqual(["plx"]);
    expect(clientesNombradosEnteros("Preparar El Grupo Ramírez", conSufijos)).toEqual(["ramirez"]);
    expect(clientesNombradosEnteros("Preparar El Ramírez", conSufijos)).toEqual(["ramirez"]);
    expect(clientesNombradosEnteros("Preparar con Ramírez", conSufijos)).toEqual([]);
  });

  it("las palabras largas que no distinguen siguen sin hacer falta", () => {
    const conCemaco = indiceDeClientes([{ id: "cemaco-int", name: "Cemaco Internacional", company: null }, { id: "libreria-int", name: "Librería Internacional", company: null }]);
    expect(clientesNombradosEnteros("Alineación CEMACO", conCemaco)).toEqual(["cemaco-int"]);
    expect(cuenta("Alineación Interna - Librería Internacional")).toBe("libreria-int");
  });
});
