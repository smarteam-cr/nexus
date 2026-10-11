import { describe, expect, it } from "vitest";
import {
  TOPES_DE_LA_TARJETA,
  armarTarjeta,
  comoQuedoElDestino,
  loQuePideDecision,
  pedidoCubiertoPorLaReunion,
  tarjetaTieneAlgo,
  type EntradaDeLaTarjeta,
  type PlanDeUsarTodo,
  type QuienMiraLaTarjeta,
} from "./tarjeta";

const HOY = "2026-10-10";
const CSE: QuienMiraLaTarjeta = { email: "cse@smarteamcr.com", esLiderDeCs: false, puedeMoverEtapa: true };
const CSL: QuienMiraLaTarjeta = { ...CSE, esLiderDeCs: true };

function entrada(o: Partial<EntradaDeLaTarjeta> = {}): EntradaDeLaTarjeta {
  return {
    reunion: {
      id: "s1",
      titulo: "Seguimiento",
      fecha: "2026-10-09T15:00:00.000Z",
      clientId: "c1",
      empresa: { kind: "CLIENTE", nombre: "Wherex" },
      proyectos: [{ id: "p1", name: "Implementación" }],
    },
    minuta: {
      id: "m1",
      resumen: "Se revisó el pipeline.",
      acuerdos: ["Mandar la base"],
      decisiones: [],
      riesgos: [],
      status: "DRAFT",
      reviewedByEmail: null,
      reviewedAt: null,
      createdAt: "2026-10-09T16:00:00.000Z",
    },
    pedidos: [
      {
        id: "pe1",
        pedido: "Un portal de clientes",
        quienLoPidio: "Ana",
        cita: "queremos un portal",
        estado: "PEDIDO",
        decididoPor: null,
        decididoAt: null,
        creadoPor: null,
        createdAt: "2026-10-09T16:00:00.000Z",
        projectId: "p1",
        proyecto: "Implementación",
      },
      {
        id: "pe2",
        pedido: "Integrar el ERP",
        quienLoPidio: null,
        cita: null,
        estado: "DESCARTADO",
        decididoPor: "cse@smarteamcr.com",
        decididoAt: "2026-10-09T17:00:00.000Z",
        creadoPor: null,
        createdAt: "2026-10-09T16:00:00.000Z",
        projectId: "p1",
        proyecto: "Implementación",
      },
    ],
    campos: [{ clave: "dolorPrincipal", etiqueta: "Dolor principal", propuesto: "Pierden leads", actual: "", propuestoEn: "2026-10-09T16:00:00.000Z", interno: false }],
    camposDecididos: [],
    etapas: [{ projectId: "p1", proyecto: "Implementación", hasta: "Diagnóstico", desde: "Handoff", cita: "ya arrancamos el diagnóstico", at: "2026-10-09T16:00:00.000Z", href: "/x" }],
    fechas: [{ projectId: "p1", proyecto: "Implementación", fecha: "2026-10-16", fechaEnPalabras: "viernes 16 de octubre", cita: "lo vemos el viernes", en: "2026-10-09T16:00:00.000Z", href: "/y" }],
    tareas: [
      { id: "t1", version: 3, numero: 12, titulo: "Mandar la base", cita: null, contexto: null, estado: "propuesta", decision: null, decididaPorEmail: null, decididaAt: null },
    ],
    alertas: [
      { id: "a1", titulo: "Queja del cliente", razon: "Dijo que va lento", severidad: "MEDIUM", cita: "va lento", status: "OPEN", resolvedByEmail: null, resolvedAt: null, origen: "ia" },
    ],
    compromisos: [{ id: "ai1", texto: "Ana envía la base", lado: "CLIENTE", responsable: "Ana", vence: "2026-10-14", hecho: false }],
    hrefs: { ficha: "/clients/c1?tab=__strategy__", solicitudes: "/clients/c1?tab=__solicitudes__", tareas: "/tareas", exito: "/customer-success/c1" },
    ...o,
  };
}

describe("qué entra a la tarjeta", () => {
  it("cada sección con lo que pide decisión; lo decidido va a «Ya revisado»", () => {
    const t = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSE });
    expect(t.secciones.minuta?.estado).toBe("pendiente");
    expect(t.secciones.fueraDeAlcance.items.map((p) => p.id)).toEqual(["pe1"]);
    expect(t.yaRevisado).toEqual([{ tipo: "pedido-fuera-de-alcance", id: "pe2", texto: "Integrar el ERP", estado: "desestimado", por: "cse@smarteamcr.com" }]);
    expect(t.secciones.ficha.items).toHaveLength(1);
    expect(t.secciones.etapa.items[0]).toMatchObject({ hasta: "Diagnóstico", puedeResponder: true });
    expect(t.secciones.fechaDelDiagnostico.items).toHaveLength(1);
    expect(t.secciones.tareas.items.map((x) => x.id)).toEqual(["t1"]);
    expect(t.secciones.compromisos.items).toHaveLength(1);
  });

  it("pideDecision cuenta la minuta, los pedidos, los campos y tus tareas: no la etapa, la fecha, las alertas ni los compromisos", () => {
    const t = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSL });
    expect(t.pideDecision).toBe(1 + 1 + 1 + 1);
    expect(loQuePideDecision({ minuta: true, pedidos: 2, campos: 3 })).toBe(6);
  });

  it("las alertas, solo para quien lidera Customer Success", () => {
    expect(armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSE }).secciones.alertas).toBeNull();
    expect(armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSL }).secciones.alertas?.items.map((a) => a.id)).toEqual(["a1"]);
  });

  it("una pendiente cerrada por el sistema no aparece como alerta viva", () => {
    const e = entrada({ alertas: [{ ...entrada().alertas[0], status: "RESOLVED", resolvedByEmail: "sistema" }] });
    expect(armarTarjeta(e, { hoyISO: HOY, quienMira: CSL }).secciones.alertas?.items).toEqual([]);
  });

  it("la etapa la responde solo quien puede moverla", () => {
    const t = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: { ...CSE, puedeMoverEtapa: false } });
    expect(t.secciones.etapa.items[0].puedeResponder).toBe(false);
  });

  it("los topes por sección dejan «y N más» con su enlace", () => {
    const pedidos = Array.from({ length: TOPES_DE_LA_TARJETA.pedidos + 3 }, (_, i) => ({ ...entrada().pedidos[0], id: `pe${i}` }));
    const t = armarTarjeta(entrada({ pedidos }), { hoyISO: HOY, quienMira: CSE });
    expect(t.secciones.fueraDeAlcance.items).toHaveLength(TOPES_DE_LA_TARJETA.pedidos);
    expect(t.secciones.fueraDeAlcance.mas).toBe(3);
    expect(t.secciones.fueraDeAlcance.href).toBe("/clients/c1?tab=__solicitudes__");
    // «Usar todo» toca solo lo que se ve.
    expect(t.planDeUsarTodo.pedidos).toHaveLength(TOPES_DE_LA_TARJETA.pedidos);
  });

  it("un pedido de un prospecto o sin proyecto se revisa solo: no entra a «Usar todo»", () => {
    const prospecto = entrada({ reunion: { ...entrada().reunion, empresa: { kind: "PROSPECTO", nombre: "Acme" } } });
    const t = armarTarjeta(prospecto, { hoyISO: HOY, quienMira: CSE });
    expect(t.esProspecto).toBe(true);
    expect(t.secciones.fueraDeAlcance.items[0].nota).toBe("Sin nada vendido: revísalo.");
    expect(t.planDeUsarTodo.pedidos).toEqual([]);
    const sinProyecto = entrada({ pedidos: [{ ...entrada().pedidos[0], projectId: null, proyecto: null }] });
    expect(armarTarjeta(sinProyecto, { hoyISO: HOY, quienMira: CSE }).planDeUsarTodo.pedidos).toEqual([]);
  });
});

describe("«Usar todo»", () => {
  it("trae solo la minuta, los pedidos y tus tareas: nunca la ficha, la etapa, la fecha, las alertas ni los compromisos", () => {
    const t = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSL });
    expect(t.planDeUsarTodo).toEqual({ minuta: "m1", pedidos: ["pe1"], tareas: [{ id: "t1", version: 3 }], novedades: [] });
    // La forma del tipo: cuatro claves, ninguna más (etapa 6: las novedades de los documentos).
    const claves: (keyof PlanDeUsarTodo)[] = ["minuta", "pedidos", "tareas", "novedades"];
    expect(Object.keys(t.planDeUsarTodo).sort()).toEqual([...claves].sort());
    const texto = JSON.stringify(t.planDeUsarTodo);
    for (const prohibido of ["dolorPrincipal", "Diagnóstico", "2026-10-16", "a1", "ai1"]) expect(texto).not.toContain(prohibido);
  });

  it("una minuta revisada no entra", () => {
    const e = entrada({ minuta: { ...entrada().minuta!, status: "REVIEWED", reviewedByEmail: "ana@x" } });
    const t = armarTarjeta(e, { hoyISO: HOY, quienMira: CSE });
    expect(t.planDeUsarTodo.minuta).toBeNull();
    expect(t.secciones.minuta?.estado).toBe("usado");
  });

  it("la huella cambia si cambia lo pendiente, y no si cambia lo que ya se decidió", () => {
    const a = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSE });
    const conOtraVersion = armarTarjeta(entrada({ tareas: [{ ...entrada().tareas[0], version: 4 }] }), { hoyISO: HOY, quienMira: CSE });
    const conUnPedidoMas = armarTarjeta(entrada({ pedidos: [...entrada().pedidos, { ...entrada().pedidos[0], id: "pe9" }] }), { hoyISO: HOY, quienMira: CSE });
    expect(conOtraVersion.huella).not.toBe(a.huella);
    expect(conUnPedidoMas.huella).not.toBe(a.huella);
    const otroDecidido = armarTarjeta(entrada({ pedidos: [entrada().pedidos[0], { ...entrada().pedidos[1], pedido: "Otra cosa" }] }), { hoyISO: HOY, quienMira: CSE });
    expect(otroDecidido.huella).toBe(a.huella);
    expect(a.huella).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("⭐ etapa 6: los hechos de la reunión, con su destino", () => {
  const conHechos = (piezasQueDecide: string[] = ["planning"], piezasConContenidoPorProyecto: Record<string, string[]> = { p1: ["planning"] }) =>
    entrada({
      piezasQueDecide,
      piezasConContenidoPorProyecto,
      hechos: [
        {
          id: "h1",
          tipo: "acuerdo",
          tema: "pipeline",
          frase: "El pipeline queda con seis etapas.",
          cita: "dejemos el pipeline en seis etapas",
          estado: "pendiente",
          createdAt: "2026-10-09T16:00:00.000Z",
          projectId: "p1",
          proyecto: "Implementación",
          destinos: [{ clave: "planning.pipelines", estado: "pendiente", href: "/clients/c1?tab=p1&canvas=planning" }],
        },
        {
          id: "h2",
          tipo: "cuenta",
          tema: null,
          frase: "Usan Zendesk para soporte.",
          cita: "todo el soporte va por Zendesk",
          estado: "pendiente",
          createdAt: "2026-10-09T16:00:00.000Z",
          projectId: null,
          proyecto: null,
          destinos: [{ clave: "ficha", estado: "delegado", href: null }],
        },
        {
          id: "h3",
          tipo: "queja",
          tema: null,
          frase: "El cliente dice que el soporte tarda.",
          cita: "el soporte tarda una semana",
          estado: "pendiente",
          createdAt: "2026-10-09T16:00:00.000Z",
          projectId: null,
          proyecto: null,
          destinos: [{ clave: "alerta.queja", estado: "delegado", href: null }],
        },
        {
          id: "h4",
          tipo: "senal_cronograma",
          tema: null,
          frase: "Se terminó la configuración.",
          cita: "ya quedó configurado",
          estado: "pendiente",
          createdAt: "2026-10-09T16:00:00.000Z",
          projectId: "p1",
          proyecto: "Implementación",
          destinos: [
            { clave: "cronograma.avance", estado: "pendiente", href: null },
            { clave: "etapa.encuesta", estado: "pendiente", href: null },
          ],
        },
      ],
    });

  it("«Usar todo» trae las novedades de los documentos y NUNCA la ficha, la alerta, el avance ni la etapa", () => {
    const t = armarTarjeta(conHechos(), { hoyISO: HOY, quienMira: CSE });
    expect(t.planDeUsarTodo.novedades).toEqual([{ hechoId: "h1", clave: "planning.pipelines" }]);
    const texto = JSON.stringify(t.planDeUsarTodo.novedades);
    for (const prohibido of ["ficha", "alerta", "cronograma.avance", "etapa.encuesta", "h2", "h3", "h4"]) expect(texto).not.toContain(prohibido);
  });

  it("la novedad pide decisión; lo que fue a la ficha o a una alerta dice a dónde fue", () => {
    const t = armarTarjeta(conHechos(), { hoyISO: HOY, quienMira: CSE });
    expect(t.pideDecision).toBe(1 + 1 + 1 + 1 + 1);
    const [h1, h2, h3] = t.secciones.hechos.items;
    expect(h1.pideDecision).toBe(true);
    expect(h1.destinos[0]).toMatchObject({ salida: "novedad", decidible: true, rotulo: "Planificación › Pipelines" });
    expect(h2.pideDecision).toBe(false);
    expect(h2.destinos[0].comoQuedo).toBe("Propuesto a la información del cliente");
    expect(h3.destinos[0].comoQuedo).toBe("Abrió una alerta");
  });

  it("quien no puede generar el documento ve la novedad, pero no la decide ni entra a «Usar todo»", () => {
    const t = armarTarjeta(conHechos([]), { hoyISO: HOY, quienMira: CSE });
    expect(t.secciones.hechos.items[0].pideDecision).toBe(false);
    expect(t.planDeUsarTodo.novedades).toEqual([]);
    expect(t.pideDecision).toBe(4);
  });

  it("⛔ una novedad vencida, o de un documento sin contenido, no pide decisión ni entra a «Usar todo»", () => {
    const sinContenido = armarTarjeta(conHechos(["planning"], { p1: [] }), { hoyISO: HOY, quienMira: CSE });
    expect(sinContenido.secciones.hechos.items[0].pideDecision).toBe(false);
    expect(sinContenido.planDeUsarTodo.novedades).toEqual([]);
    // 30 días después de que Nexus la propuso (2026-10-09), vencida.
    const vencida = armarTarjeta(conHechos(), { hoyISO: "2026-11-10", quienMira: CSE });
    expect(vencida.secciones.hechos.items[0]).toMatchObject({ estado: "vencido", pideDecision: false });
    expect(vencida.planDeUsarTodo.novedades).toEqual([]);
  });

  it("la huella cambia con una novedad nueva por decidir", () => {
    const sin = armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSE });
    const con = armarTarjeta(conHechos(), { hoyISO: HOY, quienMira: CSE });
    expect(con.huella).not.toBe(sin.huella);
  });

  it("cómo quedó cada destino, en palabras", () => {
    expect(comoQuedoElDestino("novedad", "pendiente")).toBe("Pendiente en el documento");
    expect(comoQuedoElDestino("novedad", "usado")).toBe("Se usó");
    expect(comoQuedoElDestino("novedad", "desestimado")).toBe("No aplica");
    expect(comoQuedoElDestino("procesos", "usado")).toBe("Se volvió a mapear");
    expect(comoQuedoElDestino("vigia", "pendiente")).toBe("Evidencia para el vigía");
  });
});

describe("vence a los 30 días de la reunión", () => {
  it("pide revisión hasta el día 29 y después queda vencida, pero se puede decidir igual", () => {
    const a = armarTarjeta(entrada(), { hoyISO: "2026-11-07", quienMira: CSE });
    expect(a.vencida).toBe(false);
    expect(a.pideHasta).toBe("2026-11-07");
    const b = armarTarjeta(entrada(), { hoyISO: "2026-11-08", quienMira: CSE });
    expect(b.vencida).toBe(true);
    expect(b.venceEl).toBe("2026-11-08");
    expect(b.planDeUsarTodo.minuta).toBe("m1");
    expect(b.pideDecision).toBeGreaterThan(0);
  });
});

describe("«Para ti»: cada cosa en un solo renglón", () => {
  it("un pedido de una reunión del renglón ya está cubierto", () => {
    const delRenglon = new Set(["s1"]);
    expect(pedidoCubiertoPorLaReunion({ sessionId: "s1" }, delRenglon)).toBe(true);
    expect(pedidoCubiertoPorLaReunion({ sessionId: "s2" }, delRenglon)).toBe(false);
    expect(pedidoCubiertoPorLaReunion({ sessionId: null }, delRenglon)).toBe(false);
  });
});

describe("una reunión sin nada que mostrar", () => {
  it("sin minuta ni nada propuesto, la página no pinta la tarjeta", () => {
    const vacia = entrada({ minuta: null, pedidos: [], campos: [], camposDecididos: [], etapas: [], fechas: [], tareas: [], alertas: [], compromisos: [] });
    expect(tarjetaTieneAlgo(armarTarjeta(vacia, { hoyISO: HOY, quienMira: CSE }))).toBe(false);
    expect(tarjetaTieneAlgo(armarTarjeta(entrada(), { hoyISO: HOY, quienMira: CSE }))).toBe(true);
  });
});
