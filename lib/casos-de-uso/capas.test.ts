/**
 * El orden de los casos de uso (2026-11-09, Marco y Elías con Centauro Solutions): primero organizar la casa, cada caso
 * después del que lo sostiene, y el agente como desempate. lib/casos-de-uso/capas.ts.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { CATALOGO_DE_CASOS, casoPorId } from "./catalogo";
import {
  capaDelCaso,
  casaParaElAgente,
  conexionesDelCatalogo,
  conexionesEnLaLista,
  explicacionDelOrden,
  laCasa,
  loQueTieneDeHubspot,
  planDeLosCasos,
  REGLAS_DE_LA_CASA,
  validarConexionesDelAgente,
  type ConexionDelCaso,
  type FilaParaElPlan,
} from "./capas";
import { leerLosCasos, pedidoDeCasos, type ContextoDeCasos } from "@/lib/exploraciones/agente-pedido";
import { pedidoDelOrden } from "@/lib/exploraciones/orden-pedido";
import type { CasoDeUsoElegido } from "@/lib/exploraciones/contenido";
import { casosParaLasAreas } from "./en-la-preventa";
import { casosElegidosParaLaPropuesta, casosEnOrden } from "@/lib/exploraciones/para-la-propuesta";
import { ESCALA_DE_PRUEBA, estadoDePrueba, todasEn } from "@/lib/exploraciones/escala-de-prueba.test-helpers";

const fila = (id: string, o: Partial<FilaParaElPlan> = {}): FilaParaElPlan => ({ id, capa: capaDelCaso(id), areaId: casoPorId(id.slice(4))?.areas[0] ?? null, conexiones: [], ...o });
const ids = (filas: FilaParaElPlan[]) => filas.map((f) => f.id);

describe("lo que se sabe de su HubSpot", () => {
  it("«Su CRM actualmente» sin HubSpot (Centauro): no lo usa", () => {
    const h = loQueTieneDeHubspot({
      crmActual: "Luis lleva las interacciones de Customer Success en el CRM actual como tareas, no como tickets.",
      otros: ["Ellos vienen porque llegaron a HubSpot en busca de un CRM que realmente les ayude. Creemos que tienen Zoho"],
    });
    expect(h.usa).toBe(false);
    expect(h.hubs).toEqual([]);
  });

  it("con sus hubs nombrados: los que tiene", () => {
    const h = loQueTieneDeHubspot({ crmActual: "Usan HubSpot con Sales Hub Professional y Service Hub Starter, 12 usuarios." });
    expect(h).toMatchObject({ usa: true, hubs: ["1", "3"] });
  });

  it("HubSpot sin decir cuáles hubs: lo usa, hubs sin saber", () => {
    expect(loQueTieneDeHubspot({ crmActual: "HubSpot desde 2022, lo configuró una agencia." })).toMatchObject({ usa: true, hubs: null });
  });

  it("nombra HubSpot pero dice que no lo usa, u otro CRM: no lo usa", () => {
    expect(loQueTieneDeHubspot({ crmActual: "No usan HubSpot todavía: trabajan en Excel." }).usa).toBe(false);
    expect(loQueTieneDeHubspot({ crmActual: "Salesforce; están evaluando HubSpot." }).usa).toBe(false);
    expect(loQueTieneDeHubspot({ crmActual: "Usan Zoho y quieren migrar a HubSpot." }).usa).toBe(false);
  });

  it("revisión del 9 nov: el CRM de antes, «en busca de» o pasar a otra edición no dicen que no lo usa", () => {
    expect(loQueTieneDeHubspot({ crmActual: "Migraron de Salesforce a HubSpot en 2024." }).usa).toBe(true);
    expect(loQueTieneDeHubspot({ crmActual: "Usan HubSpot, en busca de mejores reportes." }).usa).toBe(true);
    expect(loQueTieneDeHubspot({ crmActual: "Tienen HubSpot Starter y quieren pasar a HubSpot Enterprise." }).usa).toBe(true);
    // Centauro: lo que se sabe dice que llegaron a HubSpot buscando un CRM, y que tienen Zoho.
    expect(loQueTieneDeHubspot({ crmActual: "", otros: ["Llegaron a HubSpot en busca de un CRM. Creemos que tienen Zoho"] }).usa).toBe(false);
  });

  it("sin la casilla: otro CRM en lo que se sabe dice que no; sin nada, no se sabe", () => {
    expect(loQueTieneDeHubspot({ crmActual: "", otros: ["Trabajan en Pipedrive."] }).usa).toBe(false);
    expect(loQueTieneDeHubspot({}).usa).toBeNull();
  });
});

describe("la casa de cada área", () => {
  const sinHubspot = loQueTieneDeHubspot({ crmActual: "Zoho" });
  const conVentas = loQueTieneDeHubspot({ crmActual: "HubSpot Sales Hub Pro" });

  it("sin HubSpot, ninguna está ordenada aunque llegue a Funcional", () => {
    const casa = laCasa([{ id: "1", nombre: "Ventas", nivel: "F" }], sinHubspot);
    expect(casa[0]).toMatchObject({ tieneElHub: false, ordenada: false });
  });

  it("con el hub del área y en Funcional, está ordenada; sin el hub, no", () => {
    const casa = laCasa(
      [
        { id: "1", nombre: "Ventas", nivel: "F" },
        { id: "3", nombre: "Servicio", nivel: "E" },
      ],
      conVentas,
    );
    expect(casa.map((c) => c.ordenada)).toEqual([true, false]);
    expect(casa[1].tieneElHub).toBe(false);
  });

  it("debajo de Funcional o sin ubicar, no está ordenada aunque tenga el hub", () => {
    expect(laCasa([{ id: "1", nombre: "Ventas", nivel: "I" }], conVentas)[0].ordenada).toBe(false);
    expect(laCasa([{ id: "1", nombre: "Ventas", nivel: null }], conVentas)[0].ordenada).toBe(false);
  });

  it("la explicación dice por qué arriba va la base, y con todo ordenado, que manda lo que más conviene", () => {
    const casa = laCasa(
      [
        { id: "1", nombre: "Ventas", nivel: "D" },
        { id: "3", nombre: "Servicio", nivel: "I" },
      ],
      sinHubspot,
    );
    const nivel = (l: string) => ({ D: "Deficiente", I: "Inicial", F: "Funcional" })[l] ?? l;
    const texto = explicacionDelOrden("Centauro Solutions", casa, sinHubspot, nivel as never);
    expect(texto).toContain("Primero, organizar la casa");
    expect(texto).toContain("Centauro Solutions todavía no trabaja en HubSpot");
    expect(texto).toContain("Ventas y Servicio están debajo de Funcional");
    expect(texto).toContain("los agentes y la IA");
    const ordenada = laCasa([{ id: "1", nombre: "Ventas", nivel: "F" }], conVentas);
    expect(explicacionDelOrden("Wherex", ordenada, conVentas)).toContain("ya funciona en HubSpot");
    expect(casaParaElAgente(casa, sinHubspot)).toContain("No trabaja en HubSpot");
  });
});

describe("el orden: primero la casa (Marco, 2026-11-09)", () => {
  // Lo que salió para Centauro el 9 nov: el guion y WhatsApp primero, la base después.
  const lista = [fila("cat-playbooks-secuencias"), fila("cat-whatsapp", { areaId: "3" }), fila("cat-agentes-ia-atencion"), fila("cat-sistematiza-servicio"), fila("cat-sistematiza-ventas")];
  const agente = ids(lista);

  it("sin HubSpot: la base de Ventas y de Servicio arriba, después lo que va encima y al final la IA", () => {
    const casa = laCasa(
      [
        { id: "1", nombre: "Ventas", nivel: "D" },
        { id: "3", nombre: "Servicio", nivel: "I" },
      ],
      loQueTieneDeHubspot({ crmActual: "Zoho" }),
    );
    const { filas, lugar } = planDeLosCasos(lista, (f) => f, { casa, ordenDelAgente: agente });
    expect(ids(filas)).toEqual(["cat-sistematiza-servicio", "cat-sistematiza-ventas", "cat-playbooks-secuencias", "cat-whatsapp", "cat-agentes-ia-atencion"]);
    expect(lugar.get("cat-sistematiza-ventas")).toMatchObject({ capa: "casa", porLaCasa: true });
  });

  it("con la casa ordenada (HubSpot con sus hubs, en Funcional): manda el orden del agente", () => {
    const casa = laCasa(
      [
        { id: "1", nombre: "Ventas", nivel: "F" },
        { id: "3", nombre: "Servicio", nivel: "F" },
      ],
      loQueTieneDeHubspot({ crmActual: "HubSpot con Sales Hub y Service Hub" }),
    );
    const sinBase = lista.filter((f) => f.capa !== "casa");
    const { filas, lugar } = planDeLosCasos(sinBase, (f) => f, { casa, ordenDelAgente: ids(sinBase) });
    expect(ids(filas)).toEqual(ids(sinBase));
    expect(lugar.get("cat-whatsapp")?.porLaCasa).toBe(false);
  });

  it("solo el área sin ordenar va por capas: la otra sigue al agente", () => {
    const casa = laCasa(
      [
        { id: "1", nombre: "Ventas", nivel: "F" },
        { id: "3", nombre: "Servicio", nivel: "I" },
      ],
      loQueTieneDeHubspot({ crmActual: "HubSpot Sales Hub" }),
    );
    const filas = [fila("cat-prospeccion-ia"), fila("cat-agentes-ia-atencion"), fila("cat-sistematiza-servicio")];
    const r = planDeLosCasos(filas, (f) => f, { casa, ordenDelAgente: ids(filas) });
    // La base de Servicio (grupo 0) primero; la IA de Ventas (casa ordenada) va con lo de en medio, antes que la IA de Servicio.
    expect(ids(r.filas)).toEqual(["cat-sistematiza-servicio", "cat-prospeccion-ia", "cat-agentes-ia-atencion"]);
  });

  it("«sostener» siempre al final, también con la casa ordenada", () => {
    const casa = laCasa([{ id: "1", nombre: "Ventas", nivel: "E" }], loQueTieneDeHubspot({ crmActual: "HubSpot Sales Hub" }));
    const filas = [fila("cat-hubspot-administrado", { areaId: "1" }), fila("cat-pronostico")];
    expect(ids(planDeLosCasos(filas, (f) => f, { casa }).filas)).toEqual(["cat-pronostico", "cat-hubspot-administrado"]);
  });

  it("sin orden del agente ni casa conocida: el de llegada dentro de cada capa", () => {
    const filas = [fila("cat-whatsapp", { areaId: null }), fila("cat-cotizaciones", { areaId: null })];
    expect(ids(planDeLosCasos(filas, (f) => f, { casa: [] }).filas)).toEqual(["cat-whatsapp", "cat-cotizaciones"]);
  });
});

describe("casos conectados: el que se apoya en otro, o lo alimenta, va después", () => {
  it("el catálogo los trae: WhatsApp alimenta el centro de ayuda, el agente se apoya en WhatsApp", () => {
    const enLaLista = new Set(["cat-sistematiza-servicio", "cat-whatsapp", "cat-agentes-ia-atencion"]);
    expect(conexionesDelCatalogo("cat-whatsapp", enLaLista)).toEqual([{ con: "cat-sistematiza-servicio", tipo: "alimenta" }]);
    // El agente de atención requiere el centro de ayuda, se apoya en WhatsApp y alimenta el centro de ayuda.
    expect(conexionesDelCatalogo("cat-agentes-ia-atencion", enLaLista)).toEqual([
      { con: "cat-sistematiza-servicio", tipo: "seApoyaEn" },
      { con: "cat-whatsapp", tipo: "seApoyaEn" },
      { con: "cat-sistematiza-servicio", tipo: "alimenta" },
    ]);
    // En la lista, una por caso (la primera).
    expect(conexionesEnLaLista("cat-agentes-ia-atencion", [], enLaLista).map((c) => c.con)).toEqual(["cat-sistematiza-servicio", "cat-whatsapp"]);
    // Solo hacia casos que están en la lista.
    expect(conexionesDelCatalogo("cat-whatsapp", new Set(["cat-whatsapp"]))).toEqual([]);
  });

  it("las propias ganan a las del catálogo con el mismo caso, sin apuntarse a sí mismo ni fuera de la lista", () => {
    const enLaLista = new Set(["cat-whatsapp", "cat-sistematiza-servicio", "ia-x"]);
    const propias: ConexionDelCaso[] = [
      { con: "cat-sistematiza-servicio", tipo: "alimenta", porQue: "Cada chat entra como ticket" },
      { con: "cat-whatsapp", tipo: "seApoyaEn" },
      { con: "cat-no-esta", tipo: "seApoyaEn" },
    ];
    expect(conexionesEnLaLista("cat-whatsapp", propias, enLaLista)).toEqual([{ con: "cat-sistematiza-servicio", tipo: "alimenta", porQue: "Cada chat entra como ticket" }]);
  });

  it("con conexiones propias, del catálogo quedan solo los requisitos (Centauro: WhatsApp de ventas no alimenta el centro de ayuda)", () => {
    const enLaLista = new Set(["cat-whatsapp", "cat-sistematiza-ventas", "cat-sistematiza-servicio", "cat-cotizaciones"]);
    const propias: ConexionDelCaso[] = [{ con: "cat-sistematiza-ventas", tipo: "alimenta", porQue: "Cada chat entra al negocio" }];
    expect(conexionesEnLaLista("cat-whatsapp", propias, enLaLista).map((c) => c.con)).toEqual(["cat-sistematiza-ventas"]);
    expect(conexionesEnLaLista("cat-whatsapp", [], enLaLista).map((c) => c.con)).toEqual(["cat-sistematiza-ventas", "cat-sistematiza-servicio"]);
    // Un requisito del catálogo sigue aunque el agente no lo nombre.
    expect(conexionesEnLaLista("cat-cotizaciones", [{ con: "cat-whatsapp", tipo: "seApoyaEn" }], enLaLista).map((c) => c.con)).toEqual(["cat-whatsapp", "cat-sistematiza-ventas"]);
  });

  it("el orden respeta la conexión aunque el agente la haya puesto antes, y aunque sea de otra capa", () => {
    const casa = laCasa([{ id: "3", nombre: "Servicio", nivel: "F" }], loQueTieneDeHubspot({ crmActual: "HubSpot Service Hub" }));
    const agente = fila("ia-agente-whatsapp", { capa: "ia", areaId: "3", conexiones: [{ con: "cat-base-conocimiento-portal", tipo: "seApoyaEn" }] });
    const portal = fila("cat-base-conocimiento-portal");
    const r = planDeLosCasos([agente, portal], (f) => f, { casa, ordenDelAgente: ["ia-agente-whatsapp", "cat-base-conocimiento-portal"] });
    expect(ids(r.filas)).toEqual(["cat-base-conocimiento-portal", "ia-agente-whatsapp"]);
    expect(r.lugar.get("ia-agente-whatsapp")?.despuesDe).toEqual(["cat-base-conocimiento-portal"]);
  });

  it("dos que se apuntan entre sí no se pierden: gana el orden de arriba", () => {
    const a = fila("ia-a", { capa: "proceso", areaId: null, conexiones: [{ con: "ia-b", tipo: "alimenta" }] });
    const b = fila("ia-b", { capa: "proceso", areaId: null, conexiones: [{ con: "ia-a", tipo: "alimenta" }] });
    expect(ids(planDeLosCasos([a, b], (f) => f, { casa: [] }).filas)).toEqual(["ia-a", "ia-b"]);
  });

  it("el catálogo no tiene conexiones rotas ni ciclos", () => {
    const todos = new Set(CATALOGO_DE_CASOS.map((c) => `cat-${c.id}`));
    for (const c of CATALOGO_DE_CASOS) {
      for (const otro of [...(c.seApoyaEn ?? []), ...(c.alimenta ?? [])]) {
        expect(casoPorId(otro), `${c.id} → ${otro}`).toBeTruthy();
        expect(otro, c.id).not.toBe(c.id);
      }
    }
    // Con todo el catálogo en la lista, cada caso queda después de los que lo sostienen.
    const filas = CATALOGO_DE_CASOS.map((c) => ({ id: `cat-${c.id}`, capa: c.capa, areaId: null, conexiones: conexionesEnLaLista(`cat-${c.id}`, [], todos) }));
    const { filas: enOrden } = planDeLosCasos(filas, (f) => f, { casa: [] });
    const lugar = new Map(enOrden.map((f, i) => [f.id, i]));
    for (const f of filas) for (const c of f.conexiones) expect(lugar.get(c.con)!, `${f.id} va después de ${c.con}`).toBeLessThan(lugar.get(f.id)!);
  });

  it("lo que propone el agente se valida: id o título, sin repetir ni apuntarse a sí mismo", () => {
    const resolver = (ref: string) => ({ "sistematiza-servicio": "cat-sistematiza-servicio", "Estructurar el centro de ayuda": "cat-sistematiza-servicio", whatsapp: "cat-whatsapp" })[ref] ?? null;
    const r = validarConexionesDelAgente(
      [
        { con: "sistematiza-servicio", tipo: "alimenta", porQue: "  Cada chat   entra como ticket " },
        { con: "Estructurar el centro de ayuda", tipo: "seApoyaEn" },
        { con: "whatsapp", tipo: "seApoyaEn" },
        { con: "otro", tipo: "seApoyaEn" },
        { con: "whatsapp", tipo: "rara" },
      ],
      "cat-whatsapp",
      resolver,
    );
    expect(r).toEqual([{ con: "cat-sistematiza-servicio", tipo: "alimenta", porQue: "Cada chat entra como ticket" }]);
  });
});

describe("la propuesta del cliente sale en el mismo orden que la lista", () => {
  const conCasos = (chequeo: ReturnType<typeof todasEn>, crm: string) => {
    const estado = estadoDePrueba(chequeo);
    estado.contenido.casillas = { ...estado.contenido.casillas, hubspotActual: crm };
    estado.contenido.casosDeUso = {
      "cat-playbooks-secuencias": { titulo: "Automatizar la cadencia de seguimiento a prospectos", areaId: "1", plan: { paso: 1 } },
      "cat-sistematiza-ventas": { titulo: "Estandarizar el proceso comercial en HubSpot", areaId: "1", plan: { paso: 2 } },
    };
    return estado;
  };

  it("sin HubSpot y debajo de Funcional: la base primero aunque el plan la pusiera segunda", () => {
    const estado = conCasos(todasEn("I"), "Zoho");
    expect(casosElegidosParaLaPropuesta(estado.contenido, { estado, escala: ESCALA_DE_PRUEBA }).map((c) => c.id)).toEqual(["cat-sistematiza-ventas", "cat-playbooks-secuencias"]);
    // La cadencia se apoya en la base (requiere del catálogo): igual iría después.
    expect(casosEnOrden(estado.contenido.casosDeUso, { estado, escala: ESCALA_DE_PRUEBA }).map(([id]) => id)[0]).toBe("cat-sistematiza-ventas");
  });

  it("sin la escala, el orden del plan de siempre", () => {
    const estado = conCasos(todasEn("I"), "Zoho");
    expect(casosElegidosParaLaPropuesta(estado.contenido).map((c) => c.id)).toEqual(["cat-playbooks-secuencias", "cat-sistematiza-ventas"]);
  });
});

describe("el agente que sugiere: capa, conexiones y la casa", () => {
  const respuesta = (input: unknown) => ({ content: [{ type: "tool_use", id: "t", name: "proponer_casos", input }] }) as unknown as Anthropic.Messages.Message;
  const ctx: ContextoDeCasos = {
    empresa: "Centauro",
    edicion: "escala general",
    areas: [
      { id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", nombre: "Proceso" }] },
      { id: "3", nombre: "Servicio", dimensiones: [{ id: "3.1", nombre: "Proceso" }] },
    ],
    exploracion: "",
    yaEstan: [],
    descartados: [],
    catalogo: casosParaLasAreas(["1", "3"]),
    enLaLista: [{ id: "cat-sistematiza-ventas", titulo: "Estandarizar el proceso comercial en HubSpot" }],
    casa: "No trabaja en HubSpot. Ventas: Deficiente, casa por organizar.",
    negocio: "Vende un software por suscripción a hoteles.",
  };

  it("el pedido trae las reglas de la casa, el estado de hoy, su negocio, las reglas de las actividades y la lista con ids", () => {
    const p = pedidoDeCasos(ctx);
    expect(p.system).toContain(REGLAS_DE_LA_CASA);
    expect(p.system).toContain("Hoy: No trabaja en HubSpot");
    expect(p.system).toContain("alimenta ese mismo centro de ayuda");
    const cuerpo = p.messages[0].content as string;
    expect(cuerpo).toContain("=== SU NEGOCIO");
    expect(cuerpo).toContain("[cat-sistematiza-ventas] Estandarizar el proceso comercial en HubSpot");
    expect(cuerpo).toContain("Capa: casa.");
    const props = (p.tools![0] as { input_schema: { properties: { casos: { items: { properties: Record<string, unknown>; required: string[] } } } } }).input_schema.properties.casos.items;
    expect(Object.keys(props.properties)).toEqual(expect.arrayContaining(["capa", "conexiones"]));
    expect(props.required).toContain("capa");
  });

  it("lee la capa de un caso propio, y las conexiones contra los de la respuesta y los de la lista", () => {
    const r = leerLosCasos(
      respuesta({
        casos: [
          { areaId: "3", catalogo: "sistematiza-servicio", titulo: "Estructurar el centro de ayuda de tu soporte", descripcion: "d", razon: "r", paso: 1, porQue: "p", capa: "ia" },
          {
            areaId: "3",
            catalogo: "",
            titulo: "Filtrar con un agente de WhatsApp el tipo de solicitud",
            descripcion: "d",
            razon: "r",
            paso: 2,
            porQue: "p",
            capa: "ia",
            conexiones: [
              { con: "sistematiza-servicio", tipo: "alimenta", porQue: "Cada chat entra como ticket con su tipo" },
              { con: "cat-sistematiza-ventas", tipo: "seApoyaEn" },
              { con: "No existe", tipo: "seApoyaEn" },
            ],
          },
        ],
      }),
      ctx,
      "run",
    );
    expect(r.items).toHaveLength(2);
    const [base, agente] = r.items.map((it) => it.valor as CasoDeUsoElegido);
    // Uno del catálogo no guarda capa: usa la de su ficha.
    expect(base.capa).toBeUndefined();
    expect(capaDelCaso("cat-sistematiza-servicio", base.capa)).toBe("casa");
    expect(agente.capa).toBe("ia");
    expect(agente.conexiones).toEqual([
      { con: "cat-sistematiza-servicio", tipo: "alimenta", porQue: "Cada chat entra como ticket con su tipo" },
      { con: "cat-sistematiza-ventas", tipo: "seApoyaEn" },
    ]);
  });

  it("el agente que ordena lee la casa, la capa y las conexiones de cada caso", () => {
    const p = pedidoDelOrden({
      empresa: "Centauro",
      objetivo: "",
      exploracion: "",
      interno: "",
      reuniones: "",
      instrucciones: "",
      casa: "No trabaja en HubSpot.",
      negocio: "Hoteles",
      candidatos: [
        { id: "cat-whatsapp", titulo: "Registrar las conversaciones de WhatsApp en HubSpot", origen: "agente", area: "Servicio", queResuelve: "", capa: "proceso", conexiones: [{ con: "cat-sistematiza-servicio", tipo: "alimenta" }] },
        { id: "cat-sistematiza-servicio", titulo: "Estructurar el centro de ayuda en HubSpot", origen: "escala", area: "Servicio", queResuelve: "", capa: "casa" },
      ],
    });
    expect(p.system).toContain(REGLAS_DE_LA_CASA);
    expect(p.system).toContain("Hoy: No trabaja en HubSpot.");
    const cuerpo = p.messages[0].content as string;
    expect(cuerpo).toContain("capa proceso; alimenta [cat-sistematiza-servicio]");
    expect(cuerpo).toContain("=== SU NEGOCIO ===\nHoteles");
  });
});
