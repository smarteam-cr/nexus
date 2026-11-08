/**
 * Los tres niveles del contexto de una exploración (2026-11-07, Elías tras la segunda vuelta con Centauro Solutions;
 * DECISIONS «La exploración desde el vendedor»): la EMPRESA en su ficha, el EQUIPO explorado en sus retos y metas, LA
 * COMPRA en el Resumen. Y una sesión sin formulario: con quién es y cuánto dura salen de su reunión.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { fichaVacia, fusionarPropuesta } from "@/lib/clients/ficha";
import { camposDeLaFichaQueToca, esDeUnEquipo, loNuevoParaLaFicha } from "./a-la-ficha";
import { equipoDeLasFuentes } from "./agente-pedido";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import {
  duracionDeLaSesion,
  duracionDelEvento,
  faltaParaLaGuia,
  personasDeLaReunion,
  resultadoDeLaFichaGuardada,
  resultadoEnLosRetos,
  retosConElResultado,
} from "./contexto-de-la-exploracion";
import { compraQueFalta, leerElContexto } from "./contexto-pedido";
import { loNuevoDeLaEstrategia } from "./avance-del-proyecto";
import { CambiosSchema, leerPropuesta, MetaSchema, RetoSchema } from "./esquemas";
import { tieneALaEmpresa } from "./agendadas";

const estado = (casillas: Record<string, unknown> = {}): EstadoDeExploracion => ({
  contenido: { ...contenidoVacio(), casillas },
  propuesta: propuestaVacia(),
  areas: [],
  edicion: null,
  perfilCierre: null,
  perfilDespues: null,
  responsableEmail: null,
  archivada: false,
});

describe("«Cuerpo inválido» al confirmar el contexto (Centauro, 2026-11-07)", () => {
  it("el contexto con tarjetas por averiguar pasa: Zod 4 exigía las seis claves con `record`", () => {
    const r = CambiosSchema.safeParse({
      version: 3,
      operaciones: [{ op: "contexto", valor: { objetivo: "Entender si el desorden del CRM es crítico", tarjetas: { retos: { texto: "CRM con duplicados", fuente: "Lo que dejaron las sesiones" } } } }],
    });
    expect(r.success).toBe(true);
  });
});

describe("la empresa: el resultado del negocio en su ficha", () => {
  it("vive en su línea de «Retos estratégicos» y validarlo conserva lo demás", () => {
    const retos = "- Crecer en Panamá\n- Resultado que buscan: 20 % más cierres";
    expect(resultadoEnLosRetos(retos)).toBe("20 % más cierres");
    expect(retosConElResultado(retos, "30 % más cierres")).toBe("- Crecer en Panamá\n- Resultado que buscan: 30 % más cierres");
    expect(retosConElResultado("", "Bajar el soporte a la mitad")).toBe("- Resultado que buscan: Bajar el soporte a la mitad");
  });

  it("una corrección queda propuesta, esperando que Customer Success la confirme", () => {
    const f = fichaVacia();
    f.valores.retosEstrategicos = "- Resultado que buscan: A";
    expect(resultadoDeLaFichaGuardada(f)).toEqual({ texto: "A", confirmado: true });
    const { ficha } = fusionarPropuesta(f, [{ clave: "retosEstrategicos", valor: retosConElResultado("- Resultado que buscan: A", "B"), fuentes: ["Preventa · x"] }], "Preventa");
    expect(resultadoDeLaFichaGuardada(ficha)).toEqual({ texto: "B", confirmado: false });
    expect(ficha.valores.retosEstrategicos).toBe("- Resultado que buscan: A");
  });

  it("con resultados confirmados de sus proyectos, manda eso y no se edita desde la exploración", () => {
    const f = fichaVacia();
    f.valores.resultadosQuePersigue = "Bajar los tickets de 1.200 a 600 al mes";
    f.valores.retosEstrategicos = "- Resultado que buscan: otra cosa";
    expect(resultadoDeLaFichaGuardada(f)).toEqual({ texto: "Bajar los tickets de 1.200 a 600 al mes", confirmado: true, deLosProyectos: true });
  });

  it("sin nada, la ficha no tiene resultado (Nexus lo propone)", () => {
    expect(resultadoDeLaFichaGuardada(fichaVacia())).toBeNull();
  });
});

describe("el equipo explorado: sus retos y lo que busca", () => {
  it("un reto y una meta guardan su equipo", () => {
    expect(RetoSchema.safeParse({ texto: "Nadie sigue los tickets de WhatsApp", equipo: "servicio" }).success).toBe(true);
    expect(MetaSchema.safeParse({ que: "Responder en menos de 2 horas", equipo: "servicio" }).success).toBe(true);
    expect(RetoSchema.safeParse({ texto: "x", equipo: "contabilidad" }).success).toBe(false);
  });

  it("lo que dijo un equipo en su sesión queda como de ese equipo; con otra fuente, de la empresa entera", () => {
    const equipoDe = equipoDeLasFuentes({ reuniones: [{ fuente: "S1", etiqueta: "Sesión con Servicio", equipo: "servicio" }, { fuente: "S2", etiqueta: "Con la empresa" }] });
    expect(equipoDe([{ id: "S1", etiqueta: "x" }])).toBe("servicio");
    expect(equipoDe([{ id: "S1", etiqueta: "x" }, { id: "S2", etiqueta: "y" }])).toBeUndefined();
    expect(equipoDe([{ id: "N1", etiqueta: "nota" }])).toBeUndefined();
    // Con cita, mandan las fuentes que la traen.
    expect(equipoDe([{ id: "S1", etiqueta: "x", cita: "lo dijo" }, { id: "S2", etiqueta: "y" }])).toBe("servicio");
  });

  it("lo de un equipo no sube a la ficha de la empresa; lo de la empresa entera sí", () => {
    const antes = estado();
    const despues = estado({ retos: [{ texto: "Del equipo", equipo: "ventas" }, { texto: "De la empresa" }] });
    expect(loNuevoParaLaFicha(antes, despues).map((a) => (a.valor as { texto: string }).texto)).toEqual(["De la empresa"]);
    expect(esDeUnEquipo({ texto: "x", equipo: "ventas" })).toBe(true);
    expect(esDeUnEquipo("texto")).toBe(false);
  });
});

describe("el aviso de lo que sube a la ficha (A2)", () => {
  const casilla = (clave: string, valor: unknown) => ({ destino: { tipo: "casilla", clave }, valor });
  it("la preventa nombra los campos de la ficha, sin repetir ni contar lo de un equipo", () => {
    expect(camposDeLaFichaQueToca([casilla("retos", { texto: "a" }), casilla("metas", { que: "b" }), casilla("tiempos", "c")], { proyecto: false })).toEqual(["Retos estratégicos"]);
    expect(camposDeLaFichaQueToca([casilla("retos", { texto: "a", equipo: "ventas" })], { proyecto: false })).toEqual([]);
    expect(camposDeLaFichaQueToca([casilla("consecuencias", "x")], { proyecto: false })).toEqual(["Dolor principal"]);
  });
  it("un proyecto nombra solo los retos estratégicos", () => {
    expect(camposDeLaFichaQueToca([casilla("obstaculos", { texto: "a" }), casilla("metas", { que: "b" })], { proyecto: true })).toEqual(["Retos estratégicos"]);
  });
});

describe("una sesión sin formulario: lo que sale de su reunión", () => {
  it("la duración sale de la reunión, redondeada; sin reunión, 60 minutos", () => {
    expect(duracionDelEvento("2026-11-10T15:00:00.000Z", "2026-11-10T15:45:00.000Z")).toBe(45);
    expect(duracionDelEvento("2026-11-10T15:00:00.000Z", "2026-11-10T15:52:00.000Z")).toBe(50);
    expect(duracionDelEvento("2026-11-10T15:00:00.000Z", null)).toBeNull();
    expect(duracionDeLaSesion(null)).toBe(60);
    expect(duracionDeLaSesion({ evento: { id: "e", calendario: "a@x.com", inicio: "2026-11-10T15:00:00.000Z", fin: "2026-11-10T16:30:00.000Z" } })).toBe(90);
    // Si la alargan en el calendario, manda la reunión sobre lo guardado al asociarla (revisión del 2026-11-07).
    expect(duracionDeLaSesion({ duracion: 30, evento: { id: "e", calendario: "a@x.com", inicio: "2026-11-10T15:00:00.000Z", fin: "2026-11-10T16:30:00.000Z" } })).toBe(90);
    expect(duracionDeLaSesion({ duracion: 45 })).toBe(45);
  });

  it("con quién: solo la gente de la empresa, con el nombre del calendario o el del correo", () => {
    const deCentauro = (c: string) => c.endsWith("@centauro.com");
    expect(personasDeLaReunion(["ana.mora@centauro.com", "marco@smarteam.co", "luis@centauro.com"], { "luis@centauro.com": "Luis Vargas" }, deCentauro)).toEqual([
      { nombre: "Ana Mora" },
      { nombre: "Luis Vargas" },
    ]);
  });

  it("con el filtro real de la asociación: ni Smarteam ni otro cliente entran", () => {
    const gente = { dominios: ["centauro.com"], correos: ["gerente.externo@gmail.com"] };
    const personas = personasDeLaReunion(
      ["ana@centauro.com", "marco.salas@smarteam.co", "luis@otrocliente.com", "gerente.externo@gmail.com", "alguien@gmail.com"],
      {},
      (c) => tieneALaEmpresa([c], gente),
    );
    expect(personas.map((p) => p.nombre)).toEqual(["Ana", "Gerente Externo"]);
  });

  it("la guía solo espera el objetivo de la exploración", () => {
    expect(faltaParaLaGuia({ objetivo: "Ver si les sirve" })).toEqual([]);
  });
});

describe("lo de la compra que propone la llamada única", () => {
  const piezas = [
    { de: "Las notas de HubSpot", texto: "Renuevan Zoho en febrero." },
    { de: "Lo que agregó el equipo", texto: "Parece que no tienen presupuesto." },
  ];
  const respuesta = (input: Record<string, unknown>) =>
    ({ content: [{ type: "tool_use", id: "t", name: "proponer_el_contexto", input }] }) as unknown as Anthropic.Messages.Message;

  it("entra como sugerencia de su casilla, con la fuente del cliente; lo que solo dijo el equipo no", () => {
    const r = leerElContexto(
      respuesta({
        objetivo: "Ver si ordenar su CRM les cambia los números",
        resultado: "Bajar los tickets a la mitad",
        tiempos: [{ texto: "Renuevan Zoho en febrero", fuente: "Las notas de HubSpot" }],
        presupuesto: { texto: "Sin presupuesto definido", fuente: "Lo que agregó el equipo" },
        decide: [{ nombre: "Ana Mora", cargo: "Gerente", rol: "decide", fuente: "Las notas de HubSpot" }],
      }),
      piezas,
    );
    expect(r.objetivo).toBe("Ver si ordenar su CRM les cambia los números");
    expect(r.resultado).toBe("Bajar los tickets a la mitad");
    expect(r.compra.map((it) => [it.destino, it.valor, it.fuentes[0].id])).toEqual([
      [{ tipo: "casilla", clave: "tiempos" }, "Renuevan Zoho en febrero", "N0"],
      [{ tipo: "casilla", clave: "autoridad" }, { nombre: "Ana Mora", cargo: "Gerente", rol: "decide" }, "N0"],
    ]);
  });

  it("sin la herramienta, nada", () => {
    expect(leerElContexto({ content: [] } as unknown as Anthropic.Messages.Message, piezas)).toEqual({ objetivo: null, desafio: null, resultado: null, compra: [] });
  });
});

describe("lo que se guarda de la propuesta del contexto se lee completo", () => {
  it("el resultado del negocio sobrevive a guardar y volver a leer (si no, se pedía otra llamada en cada visita)", () => {
    const guardada = { ...propuestaVacia(), contextoPropuesto: { tarjetas: {}, objetivo: "x", desafio: null, resultado: "Bajar los tickets", en: "2026-11-07T12:00:00.000Z" } };
    const leida = leerPropuesta(JSON.parse(JSON.stringify(guardada)));
    expect(leida.contextoPropuesto).toEqual(guardada.contextoPropuesto);
  });
});

describe("la llamada del contexto solo llena lo vacío", () => {
  const it_ = (clave: string, valor: unknown) => ({
    id: `casilla:${clave}:${JSON.stringify(valor)}`,
    destino: { tipo: "casilla" as const, clave: clave as "tiempos" },
    valor,
    fuentes: [{ id: "N0", etiqueta: "Las notas de HubSpot" }],
    corridaId: null,
    en: "2026-11-07T12:00:00.000Z",
  });

  it("no toca una casilla confirmada ni una con sugerencia pendiente; sí una vacía", () => {
    const e = estado({ tiempos: ["Antes de febrero"] });
    e.propuesta = { ...e.propuesta, items: [it_("presupuesto", "USD 20k, lo comparan con Salesforce")] };
    const nuevas = compraQueFalta(e, [it_("tiempos", "En marzo"), it_("presupuesto", "Sin presupuesto"), it_("consecuencias", "Siguen perdiendo tickets")], []);
    expect(nuevas.map((x) => (x.destino.tipo === "casilla" ? x.destino.clave : null))).toEqual(["consecuencias"]);
  });

  it("una sugerencia descartada no cuenta como pendiente", () => {
    const e = estado();
    const vieja = it_("presupuesto", "x");
    e.propuesta = { ...e.propuesta, items: [vieja] };
    e.contenido = { ...e.contenido, descartadas: [vieja.id] };
    expect(compraQueFalta(e, [it_("presupuesto", "y")], []).length).toBe(1);
  });

  it("nadie de Smarteam entra como decisor del cliente", () => {
    const nuevas = compraQueFalta(estado(), [it_("autoridad", { nombre: "Marco Salas", rol: "decide" }), it_("autoridad", { nombre: "Ana Mora", rol: "decide" })], ["Marco Salas"]);
    expect(nuevas.map((x) => (x.valor as { nombre: string }).nombre)).toEqual(["Ana Mora"]);
  });
});

describe("en la exploración de un proyecto, lo de un equipo tampoco sube a la ficha", () => {
  it("solo los retos y las metas de la empresa entera", () => {
    const nuevo = loNuevoDeLaEstrategia(estado(), estado({ retos: [{ texto: "De Servicio", equipo: "servicio" }, { texto: "De la empresa" }], metas: [{ que: "De Ventas", equipo: "ventas" }] }));
    expect(nuevo.map((x) => x.respuesta)).toEqual(["De la empresa"]);
  });
});
