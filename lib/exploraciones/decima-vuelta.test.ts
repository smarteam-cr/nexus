/**
 * La décima vuelta de la Preparación de una sesión de preventa (2026-11-08, Elías con Centauro Solutions › Sesión 3):
 *   · «Editar con IA»: una instrucción libre que rehace la guía con la misma corrida que la arma, con la guía de ahora de
 *     base. El formato no cambia (es la misma herramienta) y la instrucción queda en la guía hasta que se cambie o se quite.
 *   · Al guardar un objetivo nuevo, «Actualizar la guía» sale ahí mismo; si no, el aviso va arriba de todo y se cierra.
 *   · Lo que Nexus necesita saber, como las preguntas de Claude Code: 4 opciones con su descripción, «Otra respuesta…», la
 *     elegida se nota, y el botón se activa con todo respondido.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { leerGuia, leerPropuesta, VALIDADOR_ESTRICTO } from "./esquemas";
import { conLoDeLaExploracion, leerOpciones, leerPreguntasConOpciones, preguntasConOpciones, preguntasDeLaSesion } from "./objetivo-y-hallazgos";
import { conLaInstruccion, instruccionDeLaGuia, pedidoDeLaGuia, pedidoDeLoDeLaExploracion, textoDeLaGuiaActual, type ContextoDeLaGuia } from "./guia-pedido";
import { MAX_INSTRUCCION_DE_LA_GUIA, type GuiaDeLaSesion } from "./guia";

const RAIZ = path.resolve(__dirname, "..", "..");
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), "utf8").replace(/\r\n/g, "\n");
const EN = "2026-11-08T10:00:00.000Z";

describe("las respuestas probables traen su descripción", () => {
  it("se leen como { etiqueta, descripcion } o como texto solo (las de antes), sin repetidas y hasta 4", () => {
    expect(
      leerOpciones([
        { etiqueta: "Sí, ya lo tenemos", descripcion: "Nexus lo usa tal cual en la guía." },
        { etiqueta: "sí, ya lo tenemos", descripcion: "repetida" },
        "No, sigue sin confirmar",
        { etiqueta: "  ", descripcion: "sin etiqueta" },
        { etiqueta: "Fernando lo trae", descripcion: 7 },
        { etiqueta: "Todavía no lo sé", descripcion: "  La guía lo pregunta al abrir.  " },
        { etiqueta: "Una quinta de más", descripcion: "no entra" },
      ]),
    ).toEqual({
      opciones: ["Sí, ya lo tenemos", "No, sigue sin confirmar", "Fernando lo trae", "Todavía no lo sé"],
      descripciones: ["Nexus lo usa tal cual en la guía.", "", "", "La guía lo pregunta al abrir."],
    });
  });

  it("la descripción viaja pegada a su opción: si una opción vacía se cae, no corre las descripciones", () => {
    expect(preguntasConOpciones(["A?"], [[" ", "a1", "a2"]], [["de la vacía", "de a1", "de a2"]])).toEqual([
      { pregunta: "A?", opciones: ["a1", "a2"], descripciones: ["de a1", "de a2"] },
    ]);
    // Sin ninguna descripción, el campo no aparece (las de antes se ven igual que antes).
    expect(preguntasConOpciones(["A?"], [["a1", "a2"]], [["", ""]])).toEqual([{ pregunta: "A?", opciones: ["a1", "a2"] }]);
  });

  it("lo que deja la guía las guarda, se leen de la base y siguen a su pregunta al responder otra", () => {
    const dejo = {
      hallazgos: [],
      ajuste: null,
      preguntas: ["A?", "B?"],
      opciones: [
        ["a1", "a2"],
        ["b1", "b2"],
      ],
      descripciones: [
        ["de a1", "de a2"],
        ["de b1", ""],
      ],
    };
    const p = conLoDeLaExploracion(propuestaVacia(), dejo, { confirmado: null, en: EN, corridaId: "r1", sesionId: "s-3" });
    expect(p.preguntasParaLaGuia?.descripciones).toEqual(dejo.descripciones);
    const leida = leerPropuesta({ preguntasParaLaGuia: p.preguntasParaLaGuia }).preguntasParaLaGuia;
    expect(leida).toEqual(p.preguntasParaLaGuia);
    expect(preguntasDeLaSesion({ pedido: leida, sesionId: "s-3", conGuiaPropia: true })[1]).toEqual({ pregunta: "B?", opciones: ["b1", "b2"], descripciones: ["de b1", ""] });

    const estado: EstadoDeExploracion = {
      contenido: contenidoVacio(),
      propuesta: p,
      areas: [],
      edicion: null,
      perfilCierre: null,
      perfilDespues: null,
      responsableEmail: null,
      archivada: false,
    };
    const validez = { dimensiones: new Set<string>(), criterios: new Set<string>(), areas: new Set<string>(), ediciones: new Set<string>(), perfilesHabituales: {}, escalaVersion: "1" };
    const r = aplicarOperaciones(estado, [{ op: "responderParaLaGuia", respuestas: [{ pregunta: "A?", respuesta: "a2" }] }], validez, VALIDADOR_ESTRICTO, { por: "ana@smarteam.co", en: EN });
    expect(r.ok && r.estado.propuesta.preguntasParaLaGuia).toMatchObject({ preguntas: ["B?"], opciones: [["b1", "b2"]], descripciones: [["de b1", ""]] });
  });

  it("una lista de descripciones que no calza se pierde sola, sin llevarse las preguntas", () => {
    const leida = leerPropuesta({ preguntasParaLaGuia: { preguntas: ["A?"], opciones: [["a1", "a2"]], descripciones: "no es una lista", sesionId: "s-3", en: EN, corridaId: null } });
    expect(leida.preguntasParaLaGuia?.preguntas).toEqual(["A?"]);
    expect(leida.preguntasParaLaGuia?.descripciones).toBeUndefined();
  });

  it("la lectura de la sesión también las lee con su descripción", () => {
    expect(leerPreguntasConOpciones([{ pregunta: "¿Quién va?", opciones: [{ etiqueta: "Laura", descripcion: "La guía se arma para ella." }, { etiqueta: "El equipo", descripcion: "" }] }])).toEqual([
      { pregunta: "¿Quién va?", opciones: ["Laura", "El equipo"], descripciones: ["La guía se arma para ella.", ""] },
    ]);
  });
});

describe("«Editar con IA»: una instrucción libre que rehace la guía", () => {
  const guia = (cambios: Partial<GuiaDeLaSesion> = {}): GuiaDeLaSesion => ({
    en: EN,
    corridaId: "r1",
    huecos: [],
    enfoque: [],
    objetivo: "Cuantificar dónde pierde rendimiento Ventas",
    apertura: [],
    preguntas: [],
    objeciones: [],
    pocaApertura: null,
    escalaEnSimple: null,
    cierre: null,
    agenda: {
      claves: ["Sus retos", "Cómo los mide hoy"],
      bloques: [
        { desde: 0, hasta: 10, titulo: "Abrir", tipo: "apertura", abre: "«Gracias por el tiempo»", averiguar: [] },
        {
          desde: 10,
          hasta: 50,
          titulo: "Cuánto cuesta el desorden",
          tipo: "cuerpo",
          central: true,
          abre: "¿Qué pasa con un lead que entra hoy?",
          averiguar: [{ id: "av:1", que: "Cómo se asignan los interesados", preguntas: ["¿Quién decide a quién va?"] }],
        },
        { desde: 50, hasta: 60, titulo: "Cerrar", tipo: "cierre", abre: "Resumo lo que entendí", averiguar: [] },
      ],
    },
    ...cambios,
  }) as GuiaDeLaSesion;

  it("la nueva reemplaza a la de antes, null la quita, y sin una nueva se conserva la de la guía", () => {
    expect(instruccionDeLaGuia("  Hazla   más corta ", "Empieza por el presupuesto")).toBe("Hazla más corta");
    expect(instruccionDeLaGuia(null, "Empieza por el presupuesto")).toBeNull();
    expect(instruccionDeLaGuia(undefined, "Empieza por el presupuesto")).toBe("Empieza por el presupuesto");
    expect(instruccionDeLaGuia(undefined, undefined)).toBeNull();
    expect(instruccionDeLaGuia("   ", "la de antes")).toBeNull();
    expect(instruccionDeLaGuia("x".repeat(MAX_INSTRUCCION_DE_LA_GUIA + 50), null)).toHaveLength(MAX_INSTRUCCION_DE_LA_GUIA);
  });

  it("la guía de ahora va en texto: objetivo, claves y cada bloque con lo que hay que averiguar", () => {
    const t = textoDeLaGuiaActual(guia())!;
    expect(t).toContain("Objetivo: Cuantificar dónde pierde rendimiento Ventas");
    expect(t).toContain("Sus retos · Cómo los mide hoy");
    expect(t).toContain("2. Cuánto cuesta el desorden (10–50 min, cuerpo, central) — abre con: «¿Qué pasa con un lead que entra hoy?»");
    expect(t).toContain("1. Abrir (0–10 min, apertura) — abre con: «Gracias por el tiempo»");
    expect(t).toContain("   - Averiguar: Cómo se asignan los interesados (¿Quién decide a quién va?)");
    expect(textoDeLaGuiaActual(guia({ agenda: undefined }))).toBeNull();
  });

  it("el pedido pone la instrucción justo después del objetivo de la sesión, con la guía de ahora de base, con la misma herramienta", () => {
    const base = {
      empresa: "Centauro Solutions",
      industria: "Turismo",
      edicion: "general",
      perfil: null,
      hoy: "2026-11-08",
      proxima: { numero: 3, titulo: null, fecha: null, sesionId: "s-3" },
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
      contextoDeLaSesion: { conQuien: null, espera: null, objetivo: "Mapear el proceso de Ventas" },
    } as unknown as ContextoDeLaGuia;
    const sin = pedidoDeLaGuia(base);
    const con = pedidoDeLaGuia({ ...base, instruccion: { texto: "Hazla más corta: cuatro bloques", guiaActual: textoDeLaGuiaActual(guia()) } });
    const cuerpo = con.messages[0].content as string;
    const objetivo = cuerpo.indexOf("EL OBJETIVO DE ESTA SESIÓN");
    const instruccion = cuerpo.indexOf("CÓMO QUIERE LA GUÍA QUIEN LLEVA LA SESIÓN");
    const deAhora = cuerpo.indexOf("LA GUÍA DE AHORA");
    expect(objetivo).toBeGreaterThan(-1);
    expect(instruccion).toBeGreaterThan(objetivo);
    expect(cuerpo.indexOf("Hazla más corta: cuatro bloques")).toBeGreaterThan(instruccion);
    expect(deAhora).toBeGreaterThan(instruccion);
    expect(cuerpo).toContain("manda el formato");
    // El formato no cambia: la misma herramienta, el mismo sistema.
    expect(con.tools).toEqual(sin.tools);
    expect(con.system).toEqual(sin.system);
    expect(sin.messages[0].content as string).not.toContain("CÓMO QUIERE LA GUÍA");
    // Una instrucción que se conserva (sin una nueva) va sin la guía de ahora.
    const conservada = pedidoDeLaGuia({ ...base, instruccion: { texto: "Hazla más corta", guiaActual: null } }).messages[0].content as string;
    expect(conservada).toContain("CÓMO QUIERE LA GUÍA");
    expect(conservada).not.toContain("LA GUÍA DE AHORA");
  });

  it("la guía guarda con qué instrucción se rehízo (el esquema no la descarta)", () => {
    const leida = leerGuia(JSON.parse(JSON.stringify(guia({ instruccion: "Empieza por el presupuesto", objetivoAceptado: "Mapear el proceso" }))));
    expect(leida?.instruccion).toBe("Empieza por el presupuesto");
  });

  it("la ruta la acepta solo con «guia», y la corrida la pasa al pedido y la deja en la guía", () => {
    const ruta = leer("app", "api", "sales", "exploraciones", "[id]", "agente", "route.ts");
    expect(ruta).toMatch(/instruccion: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(MAX_INSTRUCCION_DE_LA_GUIA\)\.nullable\(\)\.optional\(\)/);
    expect(ruta).toMatch(/\.\.\.\(modo === "guia" && instruccion !== undefined \? \{ instruccion \} : \{\}\)/);
    const agente = leer("lib", "exploraciones", "agente.ts");
    expect(agente).toMatch(/const \{ ctx, instruccion \} = conLaInstruccion\(ctxBase, opts\.instruccion, actualDeLaSesion\);/);
    // La de la sesión o, sin una, la general: la misma que muestra la pantalla.
    expect(agente).toMatch(/estado\.propuesta\.guias\[ctxBase\.proxima\.sesionId\] : undefined\) \?\? estado\.propuesta\.guia;/);
    expect(agente).toMatch(/if \(instruccion\) guia = \{ \.\.\.guia, instruccion \};/);
    // Los hallazgos van sin la instrucción: es sobre la guía.
    expect(agente).toMatch(/pedidoDeLoDeLaExploracion\(ctxBase\)/);
  });

  it("conLaInstruccion: nueva con bloques (con la guía de base), nueva sin bloques, conservada y sin ninguna", () => {
    const ctx = { empresa: "Centauro" } as unknown as ContextoDeLaGuia;
    const conBloques = conLaInstruccion(ctx, "Hazla más corta", guia({ instruccion: "la de antes" }));
    expect(conBloques.instruccion).toBe("Hazla más corta");
    expect(conBloques.ctx.instruccion?.texto).toBe("Hazla más corta");
    expect(conBloques.ctx.instruccion?.guiaActual).toContain("Cuánto cuesta el desorden");

    const sinBloques = conLaInstruccion(ctx, "Hazla más corta", guia({ agenda: undefined }));
    expect(sinBloques.ctx.instruccion).toEqual({ texto: "Hazla más corta", guiaActual: null });

    const conservada = conLaInstruccion(ctx, undefined, guia({ instruccion: "Empieza por el presupuesto" }));
    expect(conservada.ctx.instruccion).toEqual({ texto: "Empieza por el presupuesto", guiaActual: null });

    const quitada = conLaInstruccion(ctx, null, guia({ instruccion: "Empieza por el presupuesto" }));
    expect(quitada).toEqual({ ctx, instruccion: null });
    expect(conLaInstruccion(ctx, undefined, null)).toEqual({ ctx, instruccion: null });
  });

  it("el pedido de los hallazgos pide 4 respuestas con su descripción, también en su sistema (sin un «3» que contradiga)", () => {
    const p = pedidoDeLoDeLaExploracion({
      empresa: "x", industria: null, edicion: "general", perfil: null, hoy: "2026-11-08", proxima: { numero: 1, titulo: null, fecha: null, sesionId: null },
      conTest: false, desdeCero: false, nivelesDeLaEscala: [], paraConectar: null, hubspotActual: null, confirmado: [], huecos: [], enfoque: [], noExplorado: [], objecionesDichas: [], paraExplorar: [],
    } as unknown as ContextoDeLaGuia);
    expect(p.system as string).toMatch(/Cada pregunta lleva siempre 4 respuestas probables/);
    expect(p.system as string).not.toMatch(/siempre 3 respuestas/);
  });

  it("la pantalla: «Editar con IA» en la cabecera de la guía de la próxima sesión, y rehace con la instrucción", () => {
    const antes = leer("components", "exploraciones", "AntesDeLaSesion.tsx");
    expect(antes).toMatch(/acciones=\{esLaProxima \? <EditarLaGuiaConIA guia=\{guia\} \/> : null\}/);
    const editar = antes.slice(antes.indexOf("function EditarLaGuiaConIA("), antes.indexOf("/** Un tramo de la sesión"));
    expect(editar).toContain("Editar con IA");
    expect(editar).toMatch(/lanzar\("guia", \{ instruccion \}\)/);
    expect(editar).toMatch(/void rehacer\(null\)/);
    expect(leer("components", "exploraciones", "AgendaDeLaGuia.tsx")).toMatch(/\{acciones\}/);
  });
});

describe("cambiar el objetivo: «Actualizar la guía» ahí mismo, y el aviso arriba y cerrable", () => {
  const antes = leer("components", "exploraciones", "AntesDeLaSesion.tsx");
  const pantalla = antes.slice(antes.indexOf("export default function AntesDeLaSesion("));

  it("el aviso va arriba de todo, con su X y su botón", () => {
    expect(pantalla.indexOf("<AvisoDeOtroObjetivo")).toBeGreaterThan(-1);
    expect(pantalla.indexOf("<AvisoDeOtroObjetivo")).toBeLessThan(pantalla.indexOf("<Objetivo\n"));
    const aviso = antes.slice(antes.indexOf("function AvisoDeOtroObjetivo("), antes.indexOf("// ── Editar la guía con IA"));
    expect(aviso).toMatch(/<Alert\s+variant="warning"/);
    expect(aviso).toMatch(/onDismiss=\{cerrar\}/);
    expect(aviso).toContain("Actualizar la guía");
    expect(aviso).toContain("Cambiaste el objetivo: la guía todavía es para el anterior");
  });

  it("abajo, el estado de la guía ya no repite el aviso amarillo: queda en calma, con su botón", () => {
    const estado = antes.slice(antes.indexOf("function EstadoDeLaGuia("), antes.indexOf("/**\n * Las preguntas de Nexus de ESTA sesión"));
    expect(estado).not.toMatch(/titulo = "Cambiaste el objetivo/);
    expect(estado).toMatch(/para el objetivo anterior`;[\s\S]{0,400}tono = "neutro";/);
  });

  it("al guardar un objetivo distinto, ahí mismo sale «Actualizar la guía»; «Ahora no» deja el aviso de arriba", () => {
    const objetivo = antes.slice(antes.indexOf("function Objetivo("), antes.indexOf("function ObjetivosSugeridos("));
    expect(objetivo).toMatch(/if \(cambio\) alGuardar\(t\);/);
    expect(objetivo).toMatch(/const conCta = esLaProxima && puedeEditar && !!deOtroObjetivo && !armando && mismoTexto\(recienGuardado, confirmado\);/);
    expect(objetivo).toMatch(/onClick=\{\(\) => alGuardar\(null\)\}>Ahora no</);
    expect(pantalla).toMatch(/oculto=\{mismoTexto\(recienGuardado, pestana\.sesion\?\.objetivo\)\}/);
  });
});

describe("las preguntas, como las de Claude Code", () => {
  const preguntas = leer("components", "exploraciones", "PreguntasParaLaGuia.tsx");

  it("un título que pide responder, tarjetas elegibles con su descripción y «Otra respuesta…»", () => {
    expect(preguntas).toContain("Responde esto para armar la guía");
    expect(preguntas).toContain("Responde esto para afinar la guía");
    expect(preguntas).toMatch(/role="radiogroup"/);
    expect(preguntas).toMatch(/role="radio"\s+aria-checked=\{esta\}/);
    expect(preguntas).toMatch(/p\.descripciones\?\.\[k\]/);
    expect(preguntas).toContain("Otra respuesta…");
  });

  it("la elegida se nota: borde, fondo y anillo azules, y el círculo lleno con su marca", () => {
    expect(preguntas).toMatch(/const ELEGIDA = "border-brand bg-info-surface ring-2 ring-brand\/30";/);
    expect(preguntas).toMatch(/elegida \? "border-brand bg-primary text-primary-fg"/);
    expect(preguntas).toMatch(/<IconCheck/);
  });

  it("solo tokens: ningún gris crudo ni blanco", () => {
    expect(preguntas).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral)-\d|text-white|bg-white/);
  });
});
