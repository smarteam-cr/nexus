import { describe, expect, it } from "vitest";
import { esDiaLaboral, grillaDelDia, horaCR, huecoLibre, instante, lineaDeAhora, primerHuecoLaboral, resumenDelDia, reunionesDelDia, varianteDelInicio } from "./inicio";
import { cifrasDelInicio, siguienteMovimiento, type ReunionParaCifras } from "./cifras";
import { guiaDeLaReunion, type DatosParaLaGuia } from "./guia";
import { equipoDeRol, EQUIPOS_DE_NEXUS } from "@/lib/equipos/registro";
import type { NegocioVisto } from "@/lib/ventas/negocios";

const DIA = "2026-10-16";
const a = (h: number, m = 0) => instante(DIA, h * 60 + m);

describe("qué inicio ve cada persona", () => {
  it("por su equipo; la CSL, la cartera; dirección según lo que hace", () => {
    expect(varianteDelInicio({ rol: "VENTAS", frentes: [], tieneVentas: false })).toBe("ventas");
    expect(varianteDelInicio({ rol: "CSE", frentes: [], tieneVentas: false })).toBe("cse");
    expect(varianteDelInicio({ rol: "CSL", frentes: [], tieneVentas: false })).toBe("csl");
    expect(varianteDelInicio({ rol: "DEV", frentes: [], tieneVentas: false })).toBe("dev");
    expect(varianteDelInicio({ rol: "MARKETING", frentes: [], tieneVentas: false })).toBe("marketing");
    expect(varianteDelInicio({ rol: "ADMIN", frentes: [], tieneVentas: false })).toBe("general");
    expect(varianteDelInicio({ rol: "SUPER_ADMIN", frentes: [], tieneVentas: true })).toBe("ventas");
    expect(varianteDelInicio({ rol: "SUPER_ADMIN", frentes: ["LIDERAR_CS"], tieneVentas: false })).toBe("csl");
    expect(varianteDelInicio({ rol: "SUPER_ADMIN", frentes: [], tieneVentas: false })).toBe("general");
  });
  it("cada equipo del registro declara su inicio", () => {
    for (const e of EQUIPOS_DE_NEXUS) expect(["ventas", "cse", "dev", "marketing", "general"]).toContain(e.paraTi.inicio);
    expect(equipoDeRol("DEV")?.cartera).toBe("dev");
    expect(equipoDeRol("MARKETING")?.cartera).toBe("internas");
  });
});

describe("lo de hoy sacado de la semana", () => {
  it("toma las reuniones que empiezan hoy en hora de Costa Rica", () => {
    const semana = [
      { id: "a", inicio: "2026-10-19T15:00:00Z" }, // lunes 9:00 CR
      { id: "b", inicio: "2026-10-20T05:30:00Z" }, // lunes 23:30 CR (el martes en UTC)
      { id: "c", inicio: "2026-10-20T14:00:00Z" }, // martes 8:00 CR
    ];
    expect(reunionesDelDia(semana, "2026-10-19").map((r) => r.id)).toEqual(["a", "b"]);
    expect(reunionesDelDia(semana, "2026-10-21")).toEqual([]);
  });
});

describe("la cuadrícula de la agenda", () => {
  it("de 8:00 a 18:00, un minuto por píxel, cada reunión en su lugar", () => {
    const g = grillaDelDia([{ id: "x", inicio: a(15), fin: a(16) }], DIA);
    expect(g.desdeHora).toBe(8);
    expect(g.hastaHora).toBe(18);
    expect(g.eventos).toEqual([{ id: "x", arriba: 7 * 60, alto: 60, columna: 0, columnas: 1 }]);
  });
  it("se estira si hay reuniones antes o después, y no mete las de otro día", () => {
    const g = grillaDelDia(
      [
        { id: "temprano", inicio: a(7, 30), fin: a(8) },
        { id: "tarde", inicio: a(18), fin: a(19) },
        { id: "otro", inicio: instante("2026-10-17", 600), fin: null },
      ],
      DIA,
    );
    expect(g.desdeHora).toBe(7);
    expect(g.hastaHora).toBe(19);
    expect(g.eventos.map((e) => e.id).sort()).toEqual(["tarde", "temprano"]);
  });
  it("las que se pisan van en columnas; una corta igual se puede tocar", () => {
    const g = grillaDelDia(
      [
        { id: "a", inicio: a(10), fin: a(11) },
        { id: "b", inicio: a(10, 30), fin: a(11, 30) },
        { id: "c", inicio: a(12), fin: a(12, 10) },
      ],
      DIA,
    );
    const por = new Map(g.eventos.map((e) => [e.id, e]));
    expect(por.get("a")).toMatchObject({ columna: 0, columnas: 2 });
    expect(por.get("b")).toMatchObject({ columna: 1, columnas: 2 });
    expect(por.get("c")).toMatchObject({ columna: 0, columnas: 1, alto: 20 });
  });
  it("la línea de ahora, solo hoy y dentro de la grilla", () => {
    expect(lineaDeAhora({ desdeHora: 8, hastaHora: 18 }, DIA, new Date(a(11, 13)))).toBe(193);
    expect(lineaDeAhora({ desdeHora: 8, hastaHora: 18 }, "2026-10-17", new Date(a(11)))).toBeNull();
    expect(lineaDeAhora({ desdeHora: 8, hastaHora: 18 }, DIA, new Date(a(20)))).toBeNull();
  });
  it("la hora en Costa Rica", () => {
    expect(horaCR(a(9, 5))).toBe("9:05");
    expect(horaCR(a(15))).toBe("15:00");
  });
});

describe("el hueco libre de hoy", () => {
  const reuniones = [
    { id: "1", inicio: a(10), fin: a(11, 30) },
    { id: "2", inicio: a(12), fin: a(12, 15) },
    { id: "3", inicio: a(15), fin: a(16) },
  ];
  it("el primero de una hora o más, desde ahora redondeado al cuarto (sin el almuerzo: no lo marcó)", () => {
    expect(huecoLibre(reuniones, DIA, new Date(a(11, 5)))).toEqual({ inicio: a(13), fin: a(15) });
    // De 9:00 (8:50 redondeado) a 10:00 es justo una hora: entra.
    expect(huecoLibre(reuniones, DIA, new Date(a(8, 50)))).toEqual({ inicio: a(9), fin: a(10) });
    // A las 9:10 ya no queda una hora antes de las 10: el siguiente.
    expect(huecoLibre(reuniones, DIA, new Date(a(9, 10)))).toEqual({ inicio: a(13), fin: a(15) });
  });
  it("con una hora justa entra; sin hueco o en otro día, nada", () => {
    expect(huecoLibre([{ id: "1", inicio: a(9), fin: a(18) }], DIA, new Date(a(8)))).toEqual({ inicio: a(8), fin: a(9) });
    expect(huecoLibre([{ id: "1", inicio: a(8), fin: a(18) }], DIA, new Date(a(8)))).toBeNull();
    expect(huecoLibre(reuniones, "2026-10-17", new Date(a(11)))).toBeNull();
  });
  it("solo en horario laboral: nunca después de las 17:00 ni en fin de semana", () => {
    // La última reunión termina a las 16:00: el hueco va de 16:00 a 17:00, no hasta las 18:00.
    expect(huecoLibre(reuniones, DIA, new Date(a(15, 30)))).toEqual({ inicio: a(16), fin: a(17) });
    expect(huecoLibre([], DIA, new Date(a(13)))).toEqual({ inicio: a(13), fin: a(17) });
    // A las 16:10 queda menos de una hora hasta las 17:00: nada.
    expect(huecoLibre([], DIA, new Date(a(16, 10)))).toBeNull();
    expect(huecoLibre([], DIA, new Date(a(18)))).toBeNull();
    // Antes de las 8:00 arranca a las 8:00 (y llega hasta el almuerzo).
    expect(huecoLibre([], DIA, new Date(a(6, 40)))).toEqual({ inicio: a(8), fin: a(12) });
    // Sábado y domingo, nunca.
    const sab = "2026-10-17";
    expect(huecoLibre([], sab, new Date(instante(sab, 10 * 60)))).toBeNull();
    const dom = "2026-10-18";
    expect(huecoLibre([], dom, new Date(instante(dom, 10 * 60)))).toBeNull();
  });
  it("los días de trabajo son de lunes a viernes", () => {
    expect(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].every(esDiaLaboral)).toBe(true);
    expect(esDiaLaboral("2026-10-17")).toBe(false);
    expect(esDiaLaboral("2026-10-18")).toBe(false);
  });
});

describe("la primera hora libre para «Agendar»", () => {
  const lunes = "2026-10-19";
  const l = (h: number, m = 0) => instante(lunes, h * 60 + m);
  it("hoy, si queda una hora antes de las 17:00, y dura una hora", () => {
    // De 11:30 a 12:00 no entra una hora y de 12:00 a 13:00 es el almuerzo: a las 13:00.
    expect(primerHuecoLaboral([{ id: "1", inicio: a(10), fin: a(11, 30) }], new Date(a(9, 50)))).toEqual({ inicio: a(13), fin: a(14) });
    expect(primerHuecoLaboral([], new Date(a(15, 55)))).toEqual({ inicio: a(16), fin: a(17) });
  });
  it("el viernes tarde, el sábado o el domingo: el lunes a las 8:00", () => {
    expect(primerHuecoLaboral([], new Date(a(16, 20)))).toEqual({ inicio: l(8), fin: l(9) });
    expect(primerHuecoLaboral([], new Date(instante("2026-10-17", 11 * 60)))).toEqual({ inicio: l(8), fin: l(9) });
    expect(primerHuecoLaboral([], new Date(instante("2026-10-18", 7 * 60)))).toEqual({ inicio: l(8), fin: l(9) });
  });
  it("salta lo ocupado del día que viene y respeta la duración pedida", () => {
    const ev = [
      { id: "1", inicio: l(8), fin: l(10) },
      { id: "2", inicio: l(10, 30), fin: l(11) },
    ];
    expect(primerHuecoLaboral(ev, new Date(a(17)))).toEqual({ inicio: l(11), fin: l(12) });
    expect(primerHuecoLaboral(ev, new Date(a(17)), { minutos: 30 })).toEqual({ inicio: l(10), fin: l(10, 30) });
  });
  it("nunca termina después de las 17:00", () => {
    const ev = [{ id: "1", inicio: l(8), fin: l(16, 30) }];
    const h = primerHuecoLaboral(ev, new Date(a(17)));
    expect(h.inicio).toBe(instante("2026-10-20", 8 * 60));
  });
});

describe("«Tu día, según Nexus»", () => {
  it("dos o tres frases con los datos, sin inventar", () => {
    const f = resumenDelDia({
      proxima: { hora: "15:00", titulo: "Revisión de la propuesta", empresa: "BLUESAT" },
      primero: { titulo: "kölbi está en riesgo." },
      delAgente: 2,
      cuentasSinAccion: ["Cemaco", "Honda Costa Rica"],
      hueco: { hora: "12:15" },
    });
    const texto = f.map((x) => x.map((p) => p.t).join("")).join(" ");
    expect(texto).toBe(
      "A las 15:00 tienes «Revisión de la propuesta» con BLUESAT. Lo primero de tu lista: kölbi está en riesgo. Cemaco y Honda Costa Rica no tienen su acción o su reunión de la semana.",
    );
    expect(f[0].find((p) => p.fuerte)?.t).toBe("BLUESAT");
  });
  it("sin nada que decir, vacío; muchas cuentas se cuentan", () => {
    expect(resumenDelDia({ proxima: null, primero: null, delAgente: 0, cuentasSinAccion: [], hueco: null })).toEqual([]);
    const f = resumenDelDia({ proxima: null, primero: null, delAgente: 0, cuentasSinAccion: ["A", "B", "C", "D", "E"], hueco: { hora: "9:00" } });
    expect(f.map((x) => x.map((p) => p.t).join(""))).toEqual(["A, B, C y 2 más no tienen su acción o su reunión de la semana.", "Tienes libre desde las 9:00."]);
  });
});

describe("la guía de una reunión", () => {
  const base: DatosParaLaGuia = {
    cliente: { id: "c1", nombre: "BLUESAT" },
    invitados: [
      { email: "jorge@bluesat.com", nombre: "Jorge Méndez", cargo: "Gerente comercial", lado: "cliente", ultimaReunion: "2026-10-09T15:00:00Z" },
      { email: "sofia@bluesat.com", nombre: "Sofía Rojas", cargo: "Operaciones", lado: "cliente", ultimaReunion: null },
    ],
    pendientes: [{ titulo: "Confirmar el acceso a la propuesta", venceEl: "2026-10-16", estado: "pendiente", lado: "cliente", proyecto: "Implementación" }],
    pasos: null,
    negocios: [{ nombre: "Comunicaciones operativas", etapa: "Pricing and Terms", cierre: "31 oct", monto: null }],
    tickets: [],
    ultimaVez: { sessionId: "s1", titulo: "Seguimiento", fecha: "2026-10-09T15:00:00Z", resumen: "…", acuerdos: ["Enviar el desglose de licencias"], fuente: "minuta revisada" },
  };
  it("a quien vende, el objetivo sale del negocio; los puntos, de los hechos", () => {
    const g = guiaDeLaReunion(base, { equipo: "ventas", hoyISO: DIA, hayReunionDespues: false });
    expect(g.objetivo).toEqual({ texto: "Que BLUESAT avance «Comunicaciones operativas» (Pricing and Terms), que cierra el 31 oct.", deDonde: "El negocio abierto en HubSpot" });
    expect(g.puntos).toEqual([
      "Pregunta por «Confirmar el acceso a la propuesta»: el cliente lo debía para el 16 oct.",
      "Sofía Rojas viene por primera vez: confirma su papel en el proyecto.",
      "Retoma lo acordado la última vez: Enviar el desglose de licencias.",
      "«Comunicaciones operativas» no tiene monto en HubSpot: si sale el tema, pregúntalo.",
    ]);
  });
  it("el siguiente paso de tu equipo manda; sin nada, no se inventa", () => {
    const conPaso: DatosParaLaGuia = {
      ...base,
      pasos: {
        disponible: true,
        objetos: [],
        pasos: [
          {
            id: "p",
            objeto: "empresa",
            objetoId: "c1",
            equipo: "cs",
            que: "Revisar el uso con el administrador",
            fecha: "2026-10-20",
            responsableEmail: null,
            responsableNombre: null,
            escritoPor: "x",
            escritoPorNombre: null,
            fuente: "persona",
            creadoAt: "2026-10-01T00:00:00Z",
            hubspotEstado: "escrito",
            hubspotError: null,
          },
        ],
      },
    };
    expect(guiaDeLaReunion(conPaso, { equipo: "cs", hoyISO: DIA, hayReunionDespues: true }).objetivo?.texto).toBe("Avanzar el siguiente paso: Revisar el uso con el administrador.");
    const vacio = guiaDeLaReunion({ ...base, invitados: [], pendientes: [], negocios: [], ultimaVez: null }, { equipo: "cs", hoyISO: DIA, hayReunionDespues: true });
    expect(vacio).toEqual({ objetivo: null, puntos: [] });
    expect(guiaDeLaReunion({ ...base, invitados: [], pendientes: [], negocios: [], ultimaVez: null }, { equipo: "cs", hoyISO: DIA, hayReunionDespues: false }).puntos).toEqual([
      "Antes de colgar, deja agendada la próxima reunión.",
    ]);
  });
});

describe("las cifras del inicio", () => {
  const ahora = new Date(a(11));
  const reuniones: ReunionParaCifras[] = [
    { inicio: a(9), fin: a(10), empresas: ["c1"], nombres: { c1: "Tecnosagot" } },
    { inicio: a(15), fin: a(16), empresas: ["c2"], nombres: { c2: "BLUESAT" } },
    { inicio: a(10, 30), fin: a(11, 30), empresas: [], nombres: {} },
  ];
  const comun = {
    reuniones,
    veAgenda: true,
    ahora,
    importa: 5,
    tambien: 6,
    semana: 10,
    avisosNuevos: 3,
    tareas: null,
  };
  it("Ventas: reuniones, lo que importa, la meta y lo ponderado", () => {
    const c = cifrasDelInicio("ventas", {
      ...comun,
      cuentas: [],
      ventas: { meta: { avance: 186870, monto: 335000, moneda: "USD", cumplimiento: 0.558 }, anio: 2026, ponderado: { usd: 85300, activos: 31, sinMonto: 10 } },
    });
    expect(c.map((x) => x.clave)).toEqual(["reuniones", "importa", "meta", "ponderado"]);
    expect(c[0]).toMatchObject({ valor: "3", unidad: "2 con clientes", sub: "Próxima: BLUESAT a las 15:00" });
    expect(c[1]).toMatchObject({ valor: "5", sub: "+6 más para hoy" });
    expect(c[2]).toMatchObject({ valor: "56 %", barra: 56 });
    expect(c[3].sub).toBe("31 activos · 10 sin monto");
  });
  it("CSE: la acción, la reunión y cómo están sus cuentas, con lo que falta en ámbar", () => {
    const servicio = (falta: string[]) => ({ falta, calendarioLeido: true });
    const c = cifrasDelInicio("cse", {
      ...comun,
      ventas: null,
      cuentas: [
        { empresa: "kölbi", salud: "riesgo", servicio: servicio([]) },
        { empresa: "Cemaco", salud: "senales", servicio: servicio(["accion", "reunion"]) },
        { empresa: "Honda", salud: "senales", servicio: servicio(["accion"]) },
        { empresa: "Noelito", salud: "bien", servicio: servicio([]) },
      ],
    });
    expect(c.map((x) => x.clave)).toEqual(["reuniones", "accion", "reunion", "colores"]);
    expect(c[1]).toMatchObject({ valor: "2", unidad: "de 4 cuentas", sub: "Faltan Cemaco y Honda", subAviso: true });
    expect(c[2]).toMatchObject({ valor: "3", sub: "1 sin reunión agendada", subAviso: true });
    expect(c[3].colores).toEqual({ riesgo: 1, senales: 2, bien: 1 });
  });
  it("sin calendario no se dice que falta la reunión", () => {
    const c = cifrasDelInicio("csl", { ...comun, ventas: null, cuentas: [{ empresa: "A", salud: null, servicio: { falta: [], calendarioLeido: false } }] });
    expect(c.find((x) => x.clave === "reunion")?.sub).toBe("Un calendario no se pudo leer");
    expect(c.find((x) => x.clave === "colores")?.valor).toBe("—");
  });
});

describe("tu siguiente movimiento", () => {
  const negocio = (o: Partial<NegocioVisto>): NegocioVisto => ({
    id: "n1",
    hubspotDealId: "d1",
    nombre: "Acuerdo macro",
    pipeline: "Ventas",
    etapa: "Contrato enviado",
    probabilidad: 0.8,
    fechaCierre: "2026-10-31",
    monto: 30000,
    moneda: "USD",
    siguientePasoHubspot: null,
    proximaActividad: null,
    ultimaActividad: "2026-10-15T15:00:00Z",
    ultimaReunion: null,
    empresa: "Grupo Inve",
    sinEmpresa: false,
    tipoDeEmpresa: "CLIENTE",
    clientId: "c1",
    hubspotCompanyId: null,
    pospuestaHasta: null,
    propuesta: null,
    pasos: [],
    ...o,
  });
  it("los que cierran antes, con lo que les falta", () => {
    const m = siguienteMovimiento([negocio({}), negocio({ id: "n2", empresa: "ABG", ultimaActividad: "2026-10-01T15:00:00Z", fechaCierre: "2026-10-20" }), negocio({ id: "n3", etapa: "Pausados" })], DIA, new Date(a(11)));
    expect(m.total).toBe(2);
    expect(m.lista.map((x) => x.empresa)).toEqual(["ABG", "Grupo Inve"]);
    expect(m.lista[1]).toMatchObject({ monto: "US$30.000", linea: "Acuerdo macro · Contrato enviado · 31 oct", estado: { texto: "Sin siguiente paso", tono: "aviso" } });
  });
});
