/**
 * La tercera vuelta de la exploración (2026-11-08, Elías tras probar la segunda con Centauro Solutions; DECISIONS «La
 * exploración desde el vendedor»): el objetivo de Smarteam fijo con su ajuste por empresa (cómo llegó da forma al ajuste),
 * el Resumen con el estado, los hallazgos y el botón del momento, y la guía que se arma sola al terminar de leer una sesión,
 * con las preguntas que deja Nexus cuando le falta contexto.
 */
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { CambiosSchema, leerContenido, leerPropuesta, VALIDADOR_ESTRICTO } from "./esquemas";
import {
  ajusteSugerido,
  conLoDeLaExploracion,
  FALTA_EL_OBJETIVO_DE_LA_SESION,
  objetivoAceptado,
  hallazgosParaMostrar,
  MAX_RESPUESTAS_PARA_LA_GUIA,
  momentoDeLaExploracion,
  objetivoDeSmarteam,
  OBJETIVO_DE_SMARTEAM,
  sumarRespuestas,
  type SesionParaElResumen,
} from "./objetivo-y-hallazgos";
import { abreLaPuerta, NOMBRE_DE_LA_VIA, PISTA_DEL_AJUSTE, textoDeComoLlego, VIAS_DE_LLEGADA, viaDeLaFuenteDeLead } from "./como-llego";
import { HERRAMIENTA_DE_LA_GUIA, herramientaDeLaAgenda, leerLoDeLaExploracion, pedidoDeLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
import { pedidoDelContexto } from "./contexto-pedido";
import { crearSeguimiento, type CorridaEnCurso } from "./seguimiento-de-corrida";
import { sePuedeReintentar } from "./reintento";

const RAIZ = path.resolve(__dirname, "..", "..");
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), "utf8");

const estado = (cambios: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion => ({
  contenido: contenidoVacio(),
  propuesta: propuestaVacia(),
  areas: [],
  edicion: null,
  perfilCierre: null,
  perfilDespues: null,
  responsableEmail: null,
  archivada: false,
  ...cambios,
});
const validez = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), perfilesHabituales: {}, escalaVersion: "1" };
const quien = { por: "ana@smarteam.co", en: "2026-11-08T12:00:00.000Z" };
const EN = "2026-11-08T10:00:00.000Z";

describe("el objetivo de Smarteam, fijo, y su ajuste para cada empresa", () => {
  it("el objetivo base lleva al diagnóstico, a la escala, al dolor, a cómo está hoy y por qué; en un proyecto, antes de implementar", () => {
    for (const marco of ["venta", "cs"] as const) {
      const o = objetivoDeSmarteam(marco);
      expect(o).toMatch(/diagnóstico/);
      expect(o).toMatch(/Escala de Rendimiento/);
      expect(o).toMatch(/dolor/);
      expect(o).toMatch(/cómo está hoy y por qué está ahí/);
    }
    expect(objetivoDeSmarteam("venta")).toBe(OBJETIVO_DE_SMARTEAM);
    expect(objetivoDeSmarteam("cs")).toMatch(/antes de planificar/);
  });

  it("sugiere el ajuste de las sesiones; no repite el confirmado; el de la llegada solo sin nada confirmado", () => {
    const deSesiones = { texto: "Confirmar si el desborde de soporte es lo que más duele", porque: "Sesión 2: 1.200 tickets al mes", en: EN, corridaId: "r1" };
    expect(ajusteSugerido({ ajusteDelObjetivo: deSesiones }, null)).toEqual({ texto: deSesiones.texto, porque: deSesiones.porque, de: "sesiones" });
    expect(ajusteSugerido({ ajusteDelObjetivo: deSesiones }, "  confirmar si el desborde de soporte es lo que MÁS duele ".replace("MÁS", "más"))).toBeNull();
    expect(ajusteSugerido({ ajusteDelObjetivo: null, contextoPropuesto: { objetivo: "Partir de lo que marcó en el test" } }, null)).toEqual({
      texto: "Partir de lo que marcó en el test",
      porque: null,
      de: "llegada",
    });
    // Con un ajuste ya confirmado, la primera lectura no vuelve a sugerir el suyo.
    expect(ajusteSugerido({ contextoPropuesto: { objetivo: "Partir de lo que marcó en el test" } }, "Otro ajuste")).toBeNull();
    // El de las sesiones gana al de la llegada.
    expect(ajusteSugerido({ ajusteDelObjetivo: deSesiones, contextoPropuesto: { objetivo: "Otro" } }, null)?.de).toBe("sesiones");
  });

  const conDosSugeridos = () =>
    estado({
      propuesta: {
        ...propuestaVacia(),
        ajusteDelObjetivo: { texto: "Ajuste de la sesión", porque: null, en: EN, corridaId: "r1" },
        contextoPropuesto: { tarjetas: {}, objetivo: "Ajuste de la llegada", desafio: null, resultado: null, en: EN },
      },
    });

  it("usar el ajuste lo confirma con quién y cuándo y saca SOLO la sugerencia que se veía; quitarlo vuelve al de Smarteam", () => {
    const usado = aplicarOperaciones(conDosSugeridos(), [{ op: "ajusteDelObjetivo", valor: "  Ajuste   de la sesión ", vista: "Ajuste de la sesión" }], validez, VALIDADOR_ESTRICTO, quien);
    expect(usado.ok).toBe(true);
    if (!usado.ok) return;
    expect(usado.estado.contenido.contexto).toEqual({ objetivo: "Ajuste de la sesión", por: "ana@smarteam.co", en: quien.en });
    expect(usado.estado.propuesta.ajusteDelObjetivo).toBeNull();
    // La de la llegada no se veía: se queda (y la tarjeta no la ofrece, porque ya hay uno confirmado).
    expect(usado.estado.propuesta.contextoPropuesto?.objetivo).toBe("Ajuste de la llegada");
    expect(ajusteSugerido(usado.estado.propuesta, usado.estado.contenido.contexto?.objetivo)).toBeNull();

    const quitado = aplicarOperaciones(usado.estado, [{ op: "ajusteDelObjetivo", valor: null }], validez, VALIDADOR_ESTRICTO, quien);
    expect(quitado.ok && quitado.estado.contenido.contexto).toBeUndefined();
  });

  it("descartar saca la que se veía y la recuerda; una más nueva que llegó con la pantalla abierta se queda", () => {
    const descartado = aplicarOperaciones(conDosSugeridos(), [{ op: "descartarAjusteDelObjetivo", texto: "Ajuste de la sesión" }], validez, VALIDADOR_ESTRICTO, quien);
    expect(descartado.ok).toBe(true);
    if (!descartado.ok) return;
    expect(descartado.estado.propuesta.ajusteDelObjetivo).toBeNull();
    expect(descartado.estado.propuesta.ajustesDescartados).toEqual(["Ajuste de la sesión"]);
    expect(descartado.estado.contenido.contexto).toBeUndefined();
    // La pantalla mostraba «A»; entretanto la guía dejó «B»: descartar «A» no borra «B».
    const otra = aplicarOperaciones(conDosSugeridos(), [{ op: "descartarAjusteDelObjetivo", texto: "Una vieja que ya no está" }], validez, VALIDADOR_ESTRICTO, quien);
    expect(otra.ok && otra.estado.propuesta.ajusteDelObjetivo?.texto).toBe("Ajuste de la sesión");
  });

  it("quitar el ajuste de una exploración de antes conserva lo que ya sabíamos y sus tarjetas", () => {
    const deAntes = estado({
      contenido: {
        ...contenidoVacio(),
        contexto: { objetivo: "Ver si les sirve", sabemos: "Llegó por el test", tarjetas: { retos: { texto: "CRM con duplicados", fuente: "Sesión 1" } }, por: "x", en: EN },
      },
    });
    const r = aplicarOperaciones(deAntes, [{ op: "ajusteDelObjetivo", valor: null }], validez, VALIDADOR_ESTRICTO, quien);
    expect(r.ok && r.estado.contenido.contexto).toMatchObject({ objetivo: "", sabemos: "Llegó por el test", tarjetas: { retos: { texto: "CRM con duplicados" } } });
    // Y se vuelve a leer igual (el objetivo vacío ya no tira el contexto entero).
    const leido = leerContenido(r.ok ? r.estado.contenido : {});
    expect(leido.contexto?.sabemos).toBe("Llegó por el test");
    expect(ajusteSugerido(propuestaVacia(), leido.contexto?.objetivo)).toBeNull();
  });

  it("una exploración en curso conserva lo que ya confirmó: su objetivo se lee como el ajuste", () => {
    const c = leerContenido({ contexto: { objetivo: "Entender si el desorden del CRM es crítico", por: "egonzalez@smarteamcr.com", en: EN } });
    expect(c.contexto?.objetivo).toBe("Entender si el desorden del CRM es crítico");
    expect(ajusteSugerido(propuestaVacia(), c.contexto?.objetivo)).toBeNull();
  });

  it("las operaciones nuevas pasan el esquema de la API", () => {
    const ops = [
      { op: "ajusteDelObjetivo", valor: "Enfocar en soporte" },
      { op: "ajusteDelObjetivo", valor: null },
      { op: "ajusteDelObjetivo", valor: "Enfocar en soporte", vista: "Enfocar en soporte" },
      { op: "descartarAjusteDelObjetivo", texto: "Enfocar en soporte" },
      { op: "responderParaLaGuia", respuestas: [{ pregunta: "¿Con quién es la sesión 3?", respuesta: "Con Laura, jefa de ventas" }] },
    ];
    expect(CambiosSchema.safeParse({ version: 1, operaciones: ops }).success).toBe(true);
  });
});

describe("cómo llegó da forma al ajuste (las vías de Elías)", () => {
  it("las seis vías de la lista, en su orden, y las de antes se siguen leyendo", () => {
    expect(VIAS_DE_LLEGADA.slice(0, 6)).toEqual(["hubspot", "test", "web", "abm", "estatal", "referido"]);
    expect(VIAS_DE_LLEGADA).toContain("frio");
    expect(VIAS_DE_LLEGADA).toContain("evento");
    expect(leerContenido({ comoLlego: { via: "evento", en: EN } }).comoLlego?.via).toBe("evento");
    expect(leerContenido({ comoLlego: { via: "estatal", en: EN } }).comoLlego?.via).toBe("estatal");
  });

  it("cada vía tiene su nombre y su pista para el ajuste", () => {
    for (const v of VIAS_DE_LLEGADA) {
      expect(NOMBRE_DE_LA_VIA[v].length).toBeGreaterThan(3);
      expect(PISTA_DEL_AJUSTE[v]).toMatch(/ajuste/);
    }
    expect(PISTA_DEL_AJUSTE.hubspot).toMatch(/resultado/);
    expect(PISTA_DEL_AJUSTE.estatal).toMatch(/términos de referencia/);
    expect(textoDeComoLlego({ via: "referido", referidoPor: "HubSpot" })).toBe(`Referido (lo refirió HubSpot). ${PISTA_DEL_AJUSTE.referido}`);
  });

  it("la fuente del lead de HubSpot: ABM es ABM y una licitación es contratación estatal", () => {
    expect(viaDeLaFuenteDeLead("ABM")).toBe("abm");
    expect(viaDeLaFuenteDeLead("Licitación pública")).toBe("estatal");
    expect(viaDeLaFuenteDeLead("Prospección Linkedin")).toBe("frio");
  });

  it("un prospecto presentado por ABM abre la puerta en su primera sesión, como uno en frío", () => {
    const e = { contenido: { ...contenidoVacio(), comoLlego: { via: "abm" as const, en: EN }, sesiones: [{ id: "s-1" }] }, propuesta: propuestaVacia() };
    expect(abreLaPuerta(e, "s-1")).toBe(true);
  });

  it("la llamada del contexto pide un AJUSTE al objetivo de Smarteam, no un objetivo nuevo", () => {
    const p = pedidoDelContexto("Centauro Solutions", [{ de: "Cómo llegó", texto: textoDeComoLlego({ via: "test" }) }]);
    expect(p.system as string).toContain(OBJETIVO_DE_SMARTEAM);
    expect(p.system as string).toMatch(/AJUSTE para esta empresa/);
    expect(JSON.stringify(p.messages)).toContain(PISTA_DEL_AJUSTE.test);
  });
});

describe("el Resumen arriba: en qué va, el botón del momento y los hallazgos", () => {
  const sesion = (numero: number, estadoDeLaReunion: string, hecha = true): SesionParaElResumen => ({
    clave: `s-${numero}`,
    numero,
    hecha,
    estado: estadoDeLaReunion,
    fecha: hecha ? `2026-11-0${numero + 4}` : null,
  });
  const o = { archivada: false, diaCorto: (iso: string) => iso.slice(5) };

  it("la última que pasó y no se leyó: «Analizar la sesión N»", () => {
    const m = momentoDeLaExploracion([sesion(1, "leida"), sesion(2, "sinLeer")], { clave: "nueva", numero: 3 }, o);
    expect(m.accion).toEqual({ tipo: "analizar", numero: 2, clave: "s-2" });
    expect(m.titulo).toMatch(/sesión 2 ya pasó y falta analizarla/);
    expect(m.detalle).toMatch(/sugiere el objetivo de la sesión 3/);
  });

  it("todo leído: «Preparar la sesión N» con la próxima (Centauro: la 3)", () => {
    const m = momentoDeLaExploracion([sesion(1, "leida"), sesion(2, "leida"), sesion(3, "agendada", false)], { clave: "s-3", numero: 3 }, o);
    expect(m.accion).toEqual({ tipo: "preparar", numero: 3, clave: "s-3" });
    expect(m.titulo).toBe("Activa · va por la sesión 3");
    expect(m.detalle).toMatch(/La última fue la sesión 2/);
  });

  it("sin sesiones todavía, preparar la primera; esperando la transcripción también es por analizar; archivada, sin botón", () => {
    expect(momentoDeLaExploracion([], { clave: "nueva", numero: 1 }, o).accion).toEqual({ tipo: "preparar", numero: 1, clave: "nueva" });
    expect(momentoDeLaExploracion([sesion(1, "esperando")], { clave: "nueva", numero: 2 }, o).detalle).toMatch(/Esperando la transcripción/);
    const archivada = momentoDeLaExploracion([sesion(1, "leida")], { clave: "nueva", numero: 2 }, { ...o, archivada: true });
    expect(archivada.accion).toBeNull();
    expect(archivada.titulo).toBe("Archivada");
  });

  it("una sesión que no se hizo no cuenta como la última", () => {
    const m = momentoDeLaExploracion([sesion(1, "leida"), { ...sesion(2, "noSeHizo"), noSeHizo: true }], { clave: "nueva", numero: 2 }, o);
    expect(m.accion?.tipo).toBe("preparar");
  });

  it("los hallazgos de Nexus mandan; sin ellos, el resumen de cada sesión leída, de la más nueva a la más vieja", () => {
    const deNexus = hallazgosParaMostrar({ lista: ["CRM con duplicados", "1.200 tickets al mes por WhatsApp"], en: EN, corridaId: "r1" }, [{ numero: 1, resumen: "x" }]);
    expect(deNexus).toEqual({ lista: ["CRM con duplicados", "1.200 tickets al mes por WhatsApp"], de: "nexus", en: EN });
    const deSesiones = hallazgosParaMostrar(null, [
      { numero: 1, resumen: "Contaron su CRM." },
      { numero: 2, resumen: "Diagnóstico de ventas." },
      { numero: 3, resumen: "  " },
    ]);
    expect(deSesiones).toEqual({ lista: ["Sesión 2: Diagnóstico de ventas.", "Sesión 1: Contaron su CRM."], de: "sesiones", en: null });
  });
});

describe("la guía se arma sola y pregunta lo que le falta", () => {
  function ctx(cambios: Partial<ContextoDeLaGuia> = {}): ContextoDeLaGuia {
    return {
      empresa: "Centauro Solutions",
      industria: "Turismo",
      edicion: "general",
      perfil: null,
      hoy: "2026-11-08",
      proxima: { numero: 3, titulo: null, fecha: null, sesionId: "s-a3" },
      conTest: false,
      desdeCero: false,
      nivelesDeLaEscala: [],
      paraConectar: null,
      hubspotActual: null,
      confirmado: [],
      huecos: [{ clave: "metas", etiqueta: "Metas", ayuda: "", base: "" }],
      enfoque: [],
      noExplorado: [],
      objecionesDichas: [],
      paraExplorar: [],
      ...cambios,
    };
  }
  const respuesta = (input: Record<string, unknown>): Anthropic.Messages.Message =>
    ({ content: [{ type: "tool_use", id: "t1", name: HERRAMIENTA_DE_LA_GUIA, input }] }) as unknown as Anthropic.Messages.Message;

  it("el pedido lleva el objetivo de Smarteam, el ajuste confirmado, cómo llegó, lo que respondió el vendedor y los hallazgos de antes", () => {
    const p = pedidoDeLaGuia(
      ctx({
        contextoDeLaExploracion: { base: OBJETIVO_DE_SMARTEAM, objetivo: "Confirmar si el desborde de soporte es lo crítico", sabemos: null },
        comoLlego: textoDeComoLlego({ via: "hubspot" }),
        respuestas: [{ pregunta: "¿Con quién es la sesión 3?", respuesta: "Con Laura, jefa de ventas" }],
        hallazgosAntes: ["CRM con duplicados"],
      }),
    );
    const cuerpo = JSON.stringify(p.messages);
    expect(cuerpo).toContain(OBJETIVO_DE_SMARTEAM);
    expect(cuerpo).toContain("Su ajuste para esta empresa (lo confirmó el equipo): Confirmar si el desborde de soporte es lo crítico");
    expect(cuerpo).toContain(PISTA_DEL_AJUSTE.hubspot);
    expect(cuerpo).toContain("¿Con quién es la sesión 3? → Con Laura, jefa de ventas");
    expect(cuerpo).toContain("LOS HALLAZGOS QUE DEJÓ LA GUÍA ANTERIOR");
    expect(p.system as string).toMatch(/faltaContexto/);
  });

  it("la herramienta trae los hallazgos, el ajuste y lo que falta saber, sin dejar de exigir la agenda en bloques", () => {
    const t = herramientaDeLaAgenda(ctx());
    const props = (t.input_schema as { properties: Record<string, unknown>; required: string[] }).properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["hallazgos", "ajusteDelObjetivo", "faltaContexto", "bloques"]));
    expect((t.input_schema as { required: string[] }).required).toEqual(["objetivo", "claves", "bloques"]);
  });

  it("lee los hallazgos, el ajuste y hasta 3 preguntas, sin repetidas ni las que ya respondió el equipo", () => {
    const r = leerLoDeLaExploracion(
      respuesta({
        hallazgos: ["CRM con duplicados", "crm con duplicados", "1.200 tickets", "a", "b", "c", "d"],
        ajusteDelObjetivo: { texto: "Confirmar si soporte es lo crítico", porque: "1.200 tickets al mes" },
        faltaContexto: ["¿Con quién es la sesión 3?", "¿Qué quieren ver en la demo?", "¿Quién decide?", "¿Una cuarta?"],
      }),
      { respuestas: [{ pregunta: "¿Con quién es la sesión 3?", respuesta: "Laura" }] },
    );
    expect(r.hallazgos).toEqual(["CRM con duplicados", "1.200 tickets", "a", "b", "c"]);
    expect(r.ajuste).toEqual({ texto: "Confirmar si soporte es lo crítico", porque: "1.200 tickets al mes" });
    expect(r.preguntas).toEqual(["¿Qué quieren ver en la demo?", "¿Quién decide?"]);
    expect(leerLoDeLaExploracion({ content: [] } as unknown as Anthropic.Messages.Message, {})).toEqual({ hallazgos: [], ajuste: null, preguntas: [] });
  });

  it("responder suma las respuestas (la misma pregunta se reemplaza) y saca las preguntas; vacío no se guarda", () => {
    const base = estado({ propuesta: { ...propuestaVacia(), preguntasParaLaGuia: { preguntas: ["¿Con quién es la sesión 3?"], en: EN, corridaId: "r1" } } });
    const r = aplicarOperaciones(base, [{ op: "responderParaLaGuia", respuestas: [{ pregunta: "¿Con quién es la sesión 3?", respuesta: " Con Laura " }] }], validez, VALIDADOR_ESTRICTO, quien);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.contenido.respuestasParaLaGuia).toEqual([{ pregunta: "¿Con quién es la sesión 3?", respuesta: "Con Laura", por: quien.por, en: quien.en }]);
    expect(r.estado.propuesta.preguntasParaLaGuia).toBeNull();
    const otra = aplicarOperaciones(r.estado, [{ op: "responderParaLaGuia", respuestas: [{ pregunta: "¿con quién es la sesión 3?", respuesta: "Con Laura y Fernando" }] }], validez, VALIDADOR_ESTRICTO, quien);
    expect(otra.ok && otra.estado.contenido.respuestasParaLaGuia?.map((x) => x.respuesta)).toEqual(["Con Laura y Fernando"]);
    expect(aplicarOperaciones(base, [{ op: "responderParaLaGuia", respuestas: [{ pregunta: "¿Algo?", respuesta: "  " }] }], validez, VALIDADOR_ESTRICTO, quien).ok).toBe(false);
    const muchas = Array.from({ length: 20 }, (_, i) => ({ pregunta: `P${i}`, respuesta: "R", por: null, en: EN }));
    expect(sumarRespuestas(muchas, [{ pregunta: "Nueva", respuesta: "R", por: null, en: EN }])).toHaveLength(MAX_RESPUESTAS_PARA_LA_GUIA);
  });

  it("lo guardado se vuelve a leer: hallazgos, ajuste, preguntas y respuestas", () => {
    const p = leerPropuesta({
      hallazgos: { lista: ["CRM con duplicados"], en: EN, corridaId: "r1" },
      ajusteDelObjetivo: { texto: "Enfocar en soporte", porque: null, en: EN, corridaId: "r1" },
      preguntasParaLaGuia: { preguntas: ["¿Con quién es?"], en: EN, corridaId: null },
    });
    expect(p.hallazgos?.lista).toEqual(["CRM con duplicados"]);
    expect(p.ajusteDelObjetivo?.texto).toBe("Enfocar en soporte");
    expect(p.preguntasParaLaGuia?.preguntas).toEqual(["¿Con quién es?"]);
    const c = leerContenido({ respuestasParaLaGuia: [{ pregunta: "¿Con quién es?", respuesta: "Laura", por: null, en: EN }, { pregunta: "", respuesta: "x", por: null, en: EN }] });
    expect(c.respuestasParaLaGuia).toEqual([{ pregunta: "¿Con quién es?", respuesta: "Laura", por: null, en: EN }]);
  });

  it("descartar y responder llevan lo que se veía: se reintentan sin pisar nada", () => {
    const a = estado({ propuesta: { ...propuestaVacia(), ajusteDelObjetivo: { texto: "A", porque: null, en: EN, corridaId: "r1" } } });
    const b = estado({ propuesta: { ...propuestaVacia(), ajusteDelObjetivo: { texto: "B", porque: null, en: EN, corridaId: "r2" } } });
    expect(sePuedeReintentar([{ op: "descartarAjusteDelObjetivo", texto: "A" }], a, b)).toBe(true);
    expect(sePuedeReintentar([{ op: "responderParaLaGuia", respuestas: [{ pregunta: "P", respuesta: "R" }] }], a, b)).toBe(true);
  });

  it("responder saca solo las preguntas respondidas: una que llegó con la pantalla abierta se queda", () => {
    const base = estado({ propuesta: { ...propuestaVacia(), preguntasParaLaGuia: { preguntas: ["¿Con quién es?", "¿Qué quieren ver?"], en: EN, corridaId: "r1" } } });
    const r = aplicarOperaciones(base, [{ op: "responderParaLaGuia", respuestas: [{ pregunta: "¿Con quién es?", respuesta: "Laura" }] }], validez, VALIDADOR_ESTRICTO, quien);
    expect(r.ok && r.estado.propuesta.preguntasParaLaGuia?.preguntas).toEqual(["¿Qué quieren ver?"]);
  });

  it("lo que deja la guía: los hallazgos reemplazan (sin ninguno quedan los de antes), el ajuste respeta el confirmado y los descartados, y las preguntas se reemplazan", () => {
    const antes = {
      ...propuestaVacia(),
      hallazgos: { lista: ["Viejo"], en: EN, corridaId: "r0" },
      ajusteDelObjetivo: { texto: "Ajuste viejo", porque: null, en: EN, corridaId: "r0" },
      preguntasParaLaGuia: { preguntas: ["¿Vieja?"], en: EN, corridaId: "r0" },
      ajustesDescartados: ["Enfocar en marketing"],
    };
    const o = { confirmado: "Enfocar en soporte", en: "2026-11-08T13:00:00.000Z", corridaId: "r1" };
    const nuevo = conLoDeLaExploracion(antes, { hallazgos: ["Nuevo"], ajuste: { texto: "Enfocar en ventas", porque: "Sesión 2" }, preguntas: [] }, o);
    expect(nuevo.hallazgos).toEqual({ lista: ["Nuevo"], en: o.en, corridaId: "r1" });
    expect(nuevo.ajusteDelObjetivo).toEqual({ texto: "Enfocar en ventas", porque: "Sesión 2", en: o.en, corridaId: "r1" });
    expect(nuevo.preguntasParaLaGuia).toBeNull();
    const sinHallazgos = conLoDeLaExploracion(antes, { hallazgos: [], ajuste: { texto: "enfocar en SOPORTE", porque: null }, preguntas: ["¿Nueva?"] }, o);
    expect(sinHallazgos.hallazgos?.lista).toEqual(["Viejo"]);
    // Igual al confirmado: no se sugiere; queda el que había.
    expect(sinHallazgos.ajusteDelObjetivo?.texto).toBe("Ajuste viejo");
    expect(sinHallazgos.preguntasParaLaGuia?.preguntas).toEqual(["¿Nueva?"]);
    // Uno descartado no vuelve.
    expect(conLoDeLaExploracion(antes, { hallazgos: [], ajuste: { texto: "enfocar en marketing", porque: null }, preguntas: [] }, o).ajusteDelObjetivo?.texto).toBe("Ajuste viejo");
  });

  it("los descartados se guardan y llegan al pedido para que la guía no los vuelva a sugerir", () => {
    expect(leerPropuesta({ ajustesDescartados: ["Enfocar en marketing"] }).ajustesDescartados).toEqual(["Enfocar en marketing"]);
    const p = pedidoDeLaGuia(ctx({ contextoDeLaExploracion: { base: OBJETIVO_DE_SMARTEAM, objetivo: null, sabemos: null }, ajustesDescartados: ["Enfocar en marketing"] }));
    expect(JSON.stringify(p.messages)).toContain("Ajustes que el equipo descartó");
  });

  it("cuarta vuelta (2026-11-08): la lectura ya no arma la guía; la guía pide el objetivo de la sesión aceptado", () => {
    const agente = leer("lib", "exploraciones", "agente.ts");
    expect(agente, "volvió la guía que se arma sola al leer").not.toMatch(/lanzarCorrida\(exploracionId, "guia"/);
    expect(agente).toMatch(/if \(!objetivoAceptado\(ctx\.contextoDeLaSesion\?\.objetivo\)\) throw new FalloDeLaExploracion\(FALTA_EL_OBJETIVO_DE_LA_SESION\)/);
    expect(agente).not.toMatch(/faltaParaLaGuia/);
  });

  it("una guía en curso no frena una lectura ni una preparación, y la guía que quedó vieja no se guarda", () => {
    const agente = leer("lib", "exploraciones", "agente.ts");
    expect(agente).toMatch(/const cede = !!ultima && modoVivo === "guia" && modo !== "guia";/);
    expect(agente).toMatch(/if \(ultima\?\.status === "RUNNING" && !cede\)/);
    expect(agente).toMatch(/const ultimaGuia = await ultimaCorrida\(exploracionId, clientId, prisma, "guia"\);\s*if \(ultimaGuia && ultimaGuia\.id !== runId\) return/);
  });
});

describe("el seguimiento: cuando la guía arranca detrás de la lectura", () => {
  const corrida = (id: string, estadoDeLaCorrida: CorridaEnCurso["estado"], modo: CorridaEnCurso["modo"]): CorridaEnCurso => ({
    id,
    modo,
    estado: estadoDeLaCorrida,
    etiqueta: null,
    fase: null,
    empezo: "2026-11-08T15:00:00.000Z",
    propuestos: null,
    nadaNuevo: false,
    error: null,
  });

  it("recarga lo leído en cuanto la lectura cede el lugar a la guía, y avisa una vez, al terminar la guía", async () => {
    const respuestas = [corrida("leer1", "RUNNING", "leer"), corrida("guia1", "RUNNING", "guia"), corrida("guia1", "DONE", "guia")];
    let i = 0;
    const consultar = vi.fn(async () => respuestas[Math.min(i++, respuestas.length - 1)]);
    const s = crearSeguimiento({ consultar, esperar: async () => {} });
    const recargar = vi.fn(async () => {});
    const avisos = { success: vi.fn(), error: vi.fn() };
    s.conectar({ recargar, avisos });
    s.montar("2026-11-08T14:00:00.000Z");
    for (let k = 0; k < 50; k++) await Promise.resolve();
    expect(recargar).toHaveBeenCalledTimes(2);
    expect(avisos.success).toHaveBeenCalledTimes(1);
    expect(avisos.success).toHaveBeenCalledWith("La guía de la próxima reunión está lista.");
  });
});

describe("cuarta vuelta: el objetivo de la sesión lo decide el vendedor", () => {
  function ctxDeLaSesion(objetivo: string | null): ContextoDeLaGuia {
    return {
      empresa: "Centauro Solutions",
      industria: "Turismo",
      edicion: "general",
      perfil: null,
      hoy: "2026-11-08",
      proxima: { numero: 3, titulo: null, fecha: null, sesionId: "s-a3" },
      conTest: false,
      desdeCero: false,
      nivelesDeLaEscala: [],
      paraConectar: null,
      hubspotActual: null,
      confirmado: [],
      huecos: [],
      enfoque: [],
      noExplorado: [],
      objecionesDichas: [],
      paraExplorar: [],
      contextoDeLaExploracion: { base: OBJETIVO_DE_SMARTEAM, objetivo: null, sabemos: null },
      contextoDeLaSesion: { conQuien: "Laura (jefa de ventas)", espera: null, objetivo },
    };
  }

  it("solo un objetivo con texto cuenta como aceptado", () => {
    expect(objetivoAceptado("Mapear el proceso de ventas")).toBe(true);
    expect(objetivoAceptado("   ")).toBe(false);
    expect(objetivoAceptado(null)).toBe(false);
    expect(objetivoAceptado(undefined)).toBe(false);
  });

  it("el objetivo de la sesión va PRIMERO en el pedido, como la instrucción que más pesa, antes del contexto de la exploración", () => {
    const cuerpo = (pedidoDeLaGuia(ctxDeLaSesion("Mapear el proceso de ventas; dejar el soporte para el final")).messages[0].content as string);
    const objetivo = cuerpo.indexOf("EL OBJETIVO DE ESTA SESIÓN (lo decidió quien la lleva: es la instrucción que MÁS pesa)");
    expect(objetivo).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("Mapear el proceso de ventas; dejar el soporte para el final")).toBeGreaterThan(objetivo);
    expect(cuerpo.indexOf("EL CONTEXTO DE TODA LA EXPLORACIÓN")).toBeGreaterThan(objetivo);
    // Una sola vez: ya no se repite en «Esta sesión».
    expect(cuerpo).not.toMatch(/El objetivo de la sesión: /);
    expect(cuerpo).toContain("Con quién es: Laura (jefa de ventas)");
    expect(pedidoDeLaGuia(ctxDeLaSesion(null)).system as string).toMatch(/OBJETIVO DE ESTA SESIÓN lo decidió quien la lleva/);
  });

  it("sin objetivo, el pedido no inventa el bloque", () => {
    expect(pedidoDeLaGuia(ctxDeLaSesion(null)).messages[0].content as string).not.toContain("EL OBJETIVO DE ESTA SESIÓN");
  });

  it("el aviso de lo que falta dice qué hacer", () => {
    expect(FALTA_EL_OBJETIVO_DE_LA_SESION).toMatch(/acepta o escribe el objetivo de la sesión/);
  });
});

describe("cuarta vuelta: la guía recuerda con qué objetivo se armó", () => {
  it("se guarda el objetivo aceptado y se vuelve a leer; la Preparación avisa si cambió", () => {
    expect(leer("lib", "exploraciones", "agente.ts")).toMatch(/if \(aceptado\) guia = \{ \.\.\.guia, objetivoAceptado: aceptado\.slice\(0, 400\) \}/);
    expect(leer("lib", "exploraciones", "esquemas.ts")).toMatch(/objetivoAceptado: textoDeGuia\(400\)\.optional\(\)/);
    const antes = leer("components", "exploraciones", "AntesDeLaSesion.tsx");
    expect(antes).toMatch(/!mismoTexto\(guia\.objetivoAceptado, pestana\.sesion\?\.objetivo\)/);
    expect(antes).toContain("Cambiaste el objetivo: la guía todavía es para el anterior");
    // El botón espera a que el objetivo recién aceptado llegue al servidor.
    expect(antes).toMatch(/const armar = \(\) => void alDia\(\)\.then\(\(\) => lanzar\("guia"\)\)/);
  });
});
