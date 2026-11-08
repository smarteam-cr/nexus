/**
 * lib/casos-de-uso/armado.test.ts — los casos de la preventa armados con la biblioteca de actividades (2026-11-08):
 * el precio mínimo es horas × tarifa, se quitan y se ponen actividades, el agente solo usa actividades de la biblioteca
 * y «Regenerar» se deshace.
 */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import datos from "./actividades-de-los-casos.json";
import { leerActividades } from "./actividades";
import {
  actividadesDelElegido,
  actividadesPorDefecto,
  apartarCasosSinArmar,
  bibliotecaLigera,
  cambiarVeces,
  casosSinArmar,
  cifraDelCliente,
  horasDeLaVenta,
  horasDelCaso,
  precioMinimo,
  quitarActividad,
  sumarActividad,
  tarifaDe,
  validarActividadesDelAgente,
  validarValorDelAgente,
  versionesQueSeAplicanSolas,
  type ActividadDelCaso,
} from "./armado";
import { casosParaLasAreas } from "./en-la-preventa";
import {
  conElValor,
  leerElValor,
  leerLosCasos,
  pedidoDeCasos,
  pedidoDelValor,
} from "@/lib/exploraciones/agente-pedido";
import {
  aplicarOperaciones,
  contenidoVacio,
  fusionarPropuestas,
  idDelItem,
  propuestaVacia,
  propuestaVigente,
  type CasoDeUsoElegido,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type Validez,
} from "@/lib/exploraciones/contenido";
import {
  leerPropuesta,
  VALIDADOR_ESTRICTO,
} from "@/lib/exploraciones/esquemas";

const TODO = leerActividades(datos);
const BIBLIOTECA = bibliotecaLigera(TODO.biblioteca);
const POR_ID = new Map(BIBLIOTECA.map((a) => [a.id, a]));
const lib = (id: string) => POR_ID.get(id)!;
const AHORA = new Date("2026-11-08T15:00:00.000Z");

describe("el precio mínimo: horas × tarifa del segmento", () => {
  it("las actividades por defecto de cada caso del catálogo suman las horas de su ficha", () => {
    for (const c of TODO.casos)
      expect(
        horasDelCaso(actividadesPorDefecto(c), POR_ID).horas,
        c.id,
      ).toBeCloseTo(c.horasPorDefecto, 6);
  });

  it("multiplica por la tarifa del segmento; sin segmento, la Estándar y lo dice", () => {
    expect(tarifaDe("corporativo")).toEqual({
      clave: "corporativo",
      nombre: "Corporativo",
      usdPorHora: 100,
      supuesta: false,
    });
    expect(tarifaDe(null)).toMatchObject({
      clave: "estandar",
      usdPorHora: 80,
      supuesta: true,
    });
    expect(tarifaDe("otro")).toMatchObject({
      clave: "estandar",
      supuesta: true,
    });
    const caso = TODO.casos.find((c) => c.id === "sistematiza-ventas")!;
    const { horas } = horasDelCaso(actividadesPorDefecto(caso), POR_ID);
    expect(precioMinimo(horas, tarifaDe("gobierno"))).toBe(
      Math.round(horas * 120),
    );
    expect(precioMinimo(10.5, tarifaDe(null))).toBe(840);
  });

  it("lo que define Dev o Diseño cuenta 0 y se nombra", () => {
    const dev = BIBLIOTECA.find((a) => a.horasPendientes)!;
    const r = horasDelCaso(
      [{ actividadId: dev.id, nombre: dev.nombre, veces: 1 }],
      POR_ID,
    );
    expect(r.horas).toBe(0);
    expect(r.sinTiempo.length).toBe(1);
  });

  it("en la venta entera, lo que se comparte en la venta se cuenta una vez", () => {
    const compartida = BIBLIOTECA.find(
      (a) => a.comparte === "venta" && !a.horasPendientes,
    )!;
    const propia = BIBLIOTECA.find(
      (a) => a.comparte === "no" && !a.horasPendientes,
    )!;
    const a: ActividadDelCaso[] = [
      { actividadId: compartida.id, nombre: "x", veces: 1 },
      { actividadId: propia.id, nombre: "y", veces: 1 },
    ];
    const uno = horasDelCaso(a, POR_ID).horas;
    expect(horasDeLaVenta([a, a], POR_ID)).toBeCloseTo(
      2 * uno - horasDelCaso([a[0]], POR_ID).horas,
      6,
    );
  });
});

describe("quitar y poner actividades", () => {
  const base: ActividadDelCaso[] = [
    { actividadId: "kickoff", nombre: "Kickoff", veces: 1 },
    {
      actividadId: "enviar-un-cuestionario",
      nombre: "Enviar un cuestionario",
      veces: 1,
    },
  ];
  const caso: CasoDeUsoElegido = { titulo: "Caso", areaId: "1" };

  it("quitar deja el caso editado a mano y las horas bajan", () => {
    const quitado = quitarActividad(caso, base, 1);
    expect(quitado.actividades).toEqual([base[0]]);
    expect(quitado.aMano).toBe(true);
    expect(horasDelCaso(quitado.actividades!, POR_ID).horas).toBeLessThan(
      horasDelCaso(base, POR_ID).horas,
    );
  });

  it("poner suma de la biblioteca con su nombre; si ya está y se repite, suma una vez; si no se repite, no cambia", () => {
    const nueva = BIBLIOTECA.find(
      (a) => !base.some((b) => b.actividadId === a.id) && !a.horasPendientes,
    )!;
    const puesto = sumarActividad(caso, base, nueva);
    expect(puesto.actividades!.at(-1)).toEqual({
      actividadId: nueva.id,
      nombre: nueva.nombre,
      veces: 1,
    });
    expect(horasDelCaso(puesto.actividades!, POR_ID).horas).toBeGreaterThan(
      horasDelCaso(base, POR_ID).horas,
    );
    expect(lib("enviar-un-cuestionario").seRepite).toBe(true);
    expect(
      sumarActividad(caso, base, lib("enviar-un-cuestionario")).actividades![1]
        .veces,
    ).toBe(2);
    expect(lib("kickoff").seRepite).toBe(false);
    expect(sumarActividad(caso, base, lib("kickoff"))).toBe(caso);
  });

  it("las veces van de 1 a 20", () => {
    const dos = [base[0], { ...base[1], veces: 2 }];
    expect(cambiarVeces(caso, dos, 1, 0).actividades![1].veces).toBe(1);
    expect(cambiarVeces(caso, base, 1, 99).actividades![1].veces).toBe(20);
    expect(cambiarVeces(caso, base, 1, 1)).toBe(caso);
  });

  it("un caso del catálogo sin actividades propias usa las de su ficha", () => {
    expect(actividadesDelElegido({}, base)).toEqual(base);
    expect(actividadesDelElegido({ actividades: [] }, base)).toEqual([]);
  });
});

describe("el agente solo usa actividades de la biblioteca", () => {
  it("descarta las que no están, y respeta si se repite", () => {
    const r = validarActividadesDelAgente(
      [
        { actividadId: "kickoff", nombre: "Kickoff con Ventas", veces: 3 },
        { actividadId: "inventada", nombre: "Hacer magia", veces: 1 },
        {
          actividadId: "enviar-un-cuestionario",
          nombre: "Cuestionario",
          veces: 2.6,
          sobreQue: "Ventas",
        },
        "basura",
      ],
      POR_ID,
    );
    expect(r.descartadas).toBe(2);
    expect(r.actividades).toEqual([
      { actividadId: "kickoff", nombre: "Kickoff con Ventas", veces: 1 },
      {
        actividadId: "enviar-un-cuestionario",
        nombre: "Cuestionario",
        veces: 3,
        sobreQue: "Ventas",
      },
    ]);
  });

  it("el argumento de valor no inventa cifras: la que no está en lo que se sabe pasa a «falta averiguar»", () => {
    const contexto =
      "Reciben ~1.200 tickets al mes por WhatsApp, fuera del sistema.";
    const v = validarValorDelAgente(
      {
        palanca: "Costo de la mala calidad",
        argumento: "Cada ticket sin registrar es un cliente que nadie sigue.",
        numeros: [
          {
            dato: "1200 tickets al mes por WhatsApp",
            fuente: "Reunión del 6 nov",
          },
          { dato: "Pierden 35 % de los leads", fuente: "?" },
        ],
        falta: ["Cuánto vale un ticket perdido"],
      },
      contexto,
    )!;
    expect(v.numeros).toEqual([
      { dato: "1200 tickets al mes por WhatsApp", fuente: "Reunión del 6 nov" },
    ]);
    expect(v.falta).toEqual([
      "Cuánto vale un ticket perdido",
      "Confirmar con el cliente: Pierden 35 % de los leads",
    ]);
    expect(
      validarValorDelAgente(
        { argumento: "Le cuesta 50.000 USD al año." },
        contexto,
      )!.argumento,
    ).toMatch(/Ojo/);
    expect(validarValorDelAgente({ argumento: "" }, contexto)).toBeUndefined();
  });

  it("una cifra vale si aparece en una frase que habla de lo mismo: «30 % de los leads» no sale de «a los 30 días»", () => {
    const frases = [
      "La revisión es a los 30 días del arranque.",
      "Hoy pierden 30 leads por semana sin seguimiento.",
    ];
    expect(
      cifraDelCliente("30", "Pierden 30 % de los leads", frases.slice(0, 1)),
    ).toBe(false);
    expect(cifraDelCliente("30", "30 leads perdidos por semana", frases)).toBe(
      true,
    );
    const v = validarValorDelAgente(
      {
        argumento: "x",
        numeros: [{ dato: "Pierden 30 % de los leads", fuente: "?" }],
        falta: [],
      },
      frases[0],
    )!;
    expect(v.numeros).toEqual([]);
    expect(v.falta[0]).toMatch(/^Confirmar con el cliente/);
  });

  it("un dato larguísimo pasado a «Falta averiguar» no pasa del largo permitido (y no tumba el caso)", () => {
    const v = validarValorDelAgente(
      {
        argumento: "x",
        numeros: [{ dato: `${"a".repeat(290)} 99999`, fuente: "?" }],
        falta: [],
      },
      "",
    )!;
    expect(v.falta[0].length).toBeLessThanOrEqual(300);
  });

  const CTX = {
    empresa: "Centauro",
    edicion: "escala general",
    areas: [
      {
        id: "1",
        nombre: "Ventas",
        dimensiones: [{ id: "1.1", nombre: "Proceso" }],
      },
    ],
    exploracion: "Reciben 1.200 tickets por WhatsApp.",
    yaEstan: [],
    descartados: [],
    catalogo: casosParaLasAreas(["1"]),
    biblioteca: BIBLIOTECA,
    porDefecto: Object.fromEntries(
      TODO.casos.map((c) => [c.id, actividadesPorDefecto(c)]),
    ),
  };
  const respuesta = (casos: unknown[]) =>
    ({
      content: [
        {
          type: "tool_use",
          id: "tu",
          name: "proponer_casos",
          input: { casos },
        },
      ],
    }) as unknown as Anthropic.Messages.Message;

  it("el pedido manda la biblioteca y las actividades por defecto, y obliga a las de la biblioteca", () => {
    const p = pedidoDeCasos(CTX);
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("=== LA BIBLIOTECA DE ACTIVIDADES");
    expect(cuerpo).toContain("[kickoff]");
    expect(cuerpo).toContain("Actividades por defecto: kickoff");
    const tool = p.tools![0] as Anthropic.Messages.Tool;
    const items = (
      tool.input_schema.properties as Record<
        string,
        {
          items: {
            properties: Record<
              string,
              { items?: { properties: Record<string, { enum?: string[] }> } }
            >;
          };
        }
      >
    ).casos.items;
    expect(
      items.properties.actividades.items!.properties.actividadId.enum,
    ).toEqual(BIBLIOTECA.map((a) => a.id));
  });

  it("cada caso trae sus actividades de la biblioteca (o las de su ficha si no dejó ninguna) y la marca de armado", () => {
    const r = leerLosCasos(
      respuesta([
        {
          areaId: "1",
          catalogo: "sistematiza-ventas",
          titulo: "x",
          descripcion: "Qué consigue",
          razon: "Por qué",
          actividades: [{ actividadId: "no-existe", nombre: "Nada", veces: 1 }],
        },
        {
          areaId: "1",
          catalogo: "",
          titulo: "Uno propio",
          descripcion: "Qué consigue",
          razon: "Por qué",
          actividades: [
            { actividadId: "kickoff", nombre: "Kickoff", veces: 1 },
          ],
          valor: {},
        },
        {
          areaId: "1",
          catalogo: "",
          titulo: "Sin nada",
          descripcion: "Qué consigue",
          razon: "Por qué",
          actividades: [],
          valor: {},
        },
      ]),
      CTX,
      "run-1",
      AHORA,
    );
    const [delCatalogo, propio, vacio] = r.items.map(
      (i) => i.valor as CasoDeUsoElegido,
    );
    expect(delCatalogo.actividades).toEqual(
      CTX.porDefecto["sistematiza-ventas"],
    );
    expect(delCatalogo.valorDeVenta).toBeUndefined();
    expect(delCatalogo.armado).toBe(AHORA.toISOString());
    expect(propio.actividades).toEqual([
      { actividadId: "kickoff", nombre: "Kickoff", veces: 1 },
    ]);
    expect(vacio.actividades).toEqual([]);
    expect(vacio.sinActividad).toMatch(/Ninguna actividad de la biblioteca/);
    for (const it of r.items)
      for (const a of (it.valor as CasoDeUsoElegido).actividades ?? [])
        expect(POR_ID.has(a.actividadId)).toBe(true);
  });

  it("lo interno no entra al pedido de los casos (que escribe lo que ve el cliente): va solo al del valor", () => {
    const interno = "Presupuesto de 3.000 USD, decide el gerente Pérez.";
    expect(JSON.stringify(pedidoDeCasos(CTX))).not.toContain("Pérez");
    const cv = {
      empresa: "Centauro",
      exploracion: CTX.exploracion,
      interno,
      casos: [
        { id: "cat-cobranza", titulo: "Cobranza", actividades: ["Kickoff"] },
      ],
    };
    expect(String(pedidoDelValor(cv).messages[0].content)).toContain("Pérez");
    const r = leerElValor(
      {
        content: [
          {
            type: "tool_use",
            id: "v",
            name: "argumentar_valor",
            input: {
              valores: [
                {
                  id: "cat-cobranza",
                  palanca: "Riesgo",
                  argumento: "Con 1.200 tickets al mes por WhatsApp…",
                  numeros: [
                    { dato: "1.200 tickets por WhatsApp", fuente: "Retos" },
                  ],
                  falta: [],
                },
                {
                  id: "otro",
                  palanca: "Riesgo",
                  argumento: "No es de esta lista.",
                  numeros: [],
                  falta: [],
                },
              ],
            },
          },
        ],
      } as unknown as Anthropic.Messages.Message,
      cv,
    );
    expect([...r.keys()]).toEqual(["cat-cobranza"]);
    expect(r.get("cat-cobranza")!.numeros).toEqual([
      { dato: "1.200 tickets por WhatsApp", fuente: "Retos" },
    ]);
    const destino: DestinoDePropuesta = {
      tipo: "casoDeUso",
      useCaseId: "cat-cobranza",
    };
    const [it] = conElValor(
      [
        {
          id: "x",
          destino,
          valor: { titulo: "Cobranza", areaId: "1" },
          fuentes: [],
          corridaId: "r",
          en: "",
        },
      ],
      r,
    );
    expect((it.valor as CasoDeUsoElegido).valorDeVenta?.palanca).toBe("Riesgo");
  });

  it("al regenerar, un caso elegido vuelve con su id y su título, aunque el modelo escriba otro", () => {
    const ctx = {
      ...CTX,
      yaEstan: ["Mi caso"],
      rearmar: [
        { id: "ia-123", titulo: "Mi caso", areaId: "1", actividades: [] },
      ],
    };
    const r = leerLosCasos(
      respuesta([
        {
          rearma: "ia-123",
          areaId: "1",
          titulo: "Otro título",
          descripcion: "d",
          razon: "r",
          actividades: [
            { actividadId: "kickoff", nombre: "Kickoff", veces: 1 },
          ],
          valor: {},
        },
      ]),
      ctx,
      "run-2",
      AHORA,
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].destino).toEqual({
      tipo: "casoDeUso",
      useCaseId: "ia-123",
    });
    expect((r.items[0].valor as CasoDeUsoElegido).titulo).toBe("Mi caso");
  });
});

describe("regenerar y deshacer", () => {
  const VALIDEZ: Validez = {
    dimensiones: new Set(["1.1"]),
    criterios: new Set(),
    areas: new Set(["1"]),
    ediciones: new Set(),
    escalaVersion: "9",
  };
  const estado = (
    p: Partial<EstadoDeExploracion> = {},
  ): EstadoDeExploracion => ({
    contenido: {
      ...contenidoVacio(),
      chequeo: { "1.1": { nivel: "I", fuente: "reunion" } },
    },
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
    ...p,
  });
  const item = (
    useCaseId: string,
    valor: CasoDeUsoElegido,
    corridaId: string,
  ): ItemPropuesto => {
    const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId };
    return {
      id: idDelItem(destino, valor),
      destino,
      valor,
      fuentes: [],
      corridaId,
      en: AHORA.toISOString(),
    };
  };
  const quien = { por: "vendedor@smarteam.cr", en: AHORA.toISOString() };
  const aplicar = (
    e: EstadoDeExploracion,
    ops: Parameters<typeof aplicarOperaciones>[1],
  ) => {
    const r = aplicarOperaciones(e, ops, VALIDEZ, VALIDADOR_ESTRICTO, quien);
    if (!r.ok) throw new Error(r.error);
    return r.estado;
  };

  it("cuenta lo que falta armar (sin los editados a mano ni los de un área fuera de juego) y aparta las sugerencias sin armar", () => {
    const viejo = item("ia-1", { titulo: "Viejo", areaId: "1" }, "run-0");
    const armado = item(
      "ia-2",
      { titulo: "Nuevo", areaId: "1", armado: AHORA.toISOString() },
      "run-0",
    );
    expect(
      casosSinArmar([{ armado: "x" }, {}], [viejo.valor as CasoDeUsoElegido]),
    ).toBe(2);
    expect(
      casosSinArmar(
        [{ aMano: true }, { areaId: "2" }, { areaId: "1" }, { areaId: null }],
        [],
        ["1"],
      ),
    ).toBe(2);
    const r = apartarCasosSinArmar(
      [viejo, armado],
      "run-1",
      AHORA.toISOString(),
    );
    expect(r.items).toEqual([armado]);
    expect(r.casosAnteriores).toEqual({
      corridaId: "run-1",
      en: AHORA.toISOString(),
      items: [viejo],
    });
  });

  it("la versión nueva de un elegido se ve, se usa, y Deshacer devuelve la de antes y las sugerencias viejas", () => {
    const antes: CasoDeUsoElegido = { titulo: "Cobranza", areaId: "1" };
    const viejo = item(
      "ia-9",
      { titulo: "Sugerencia vieja", areaId: "1" },
      "run-0",
    );
    const nueva = item(
      "cat-cobranza",
      {
        titulo: "Cobranza",
        areaId: "1",
        actividades: [{ actividadId: "kickoff", nombre: "Kickoff", veces: 1 }],
        armado: AHORA.toISOString(),
      },
      "run-1",
    );
    const e0 = estado({
      contenido: {
        ...estado().contenido,
        casosDeUso: { "cat-cobranza": antes },
      },
      propuesta: {
        ...propuestaVacia(),
        items: [nueva],
        casosAnteriores: {
          corridaId: "run-1",
          en: AHORA.toISOString(),
          items: [viejo],
        },
      },
    });
    expect(propuestaVigente(e0).map((i) => i.id)).toEqual([nueva.id]);
    const usado = aplicar(e0, [
      { op: "usarVarias", items: [{ itemId: nueva.id, valor: nueva.valor }] },
    ]);
    expect(usado.contenido.casosDeUso["cat-cobranza"].armado).toBe(
      AHORA.toISOString(),
    );
    // Deshacer: primero vuelve el caso como estaba (y la versión nueva a la lista), después vuelven las de antes.
    const deshecho = aplicar(
      aplicar(usado, [{ op: "deshacerUso", ids: [nueva.id] }]),
      [{ op: "devolverCasosAnteriores", corridaId: "run-1" }],
    );
    expect(deshecho.contenido.casosDeUso["cat-cobranza"]).toEqual(antes);
    expect(deshecho.propuesta.items.map((i) => i.id)).toEqual([viejo.id]);
    expect(deshecho.propuesta.casosAnteriores).toBeNull();
    // Un segundo «Deshacer» ya no tiene qué devolver.
    expect(
      aplicarOperaciones(
        deshecho,
        [{ op: "devolverCasosAnteriores", corridaId: "run-1" }],
        VALIDEZ,
        VALIDADOR_ESTRICTO,
        quien,
      ).ok,
    ).toBe(false);
  });

  it("al terminar «Regenerar» se aplican solas las versiones de esa corrida, nunca las de un caso editado a mano", () => {
    const nueva = (id: string, corrida: string) =>
      item(
        id,
        { titulo: id, areaId: "1", armado: AHORA.toISOString() },
        corrida,
      );
    const pendientes = [
      nueva("cat-a", "run-1"),
      nueva("cat-b", "run-1"),
      nueva("cat-c", "run-0"),
      nueva("ia-nuevo", "run-1"),
    ];
    const elegidos = { "cat-a": {}, "cat-b": { aMano: true }, "cat-c": {} };
    expect(
      versionesQueSeAplicanSolas(pendientes, elegidos, "run-1").map(
        (i) => i.destino,
      ),
    ).toEqual([{ tipo: "casoDeUso", useCaseId: "cat-a" }]);
  });

  it("una lápida vieja del caso no tapa su versión nueva si ya está elegido", () => {
    const sinArmar: CasoDeUsoElegido = {
      titulo: "Cobranza",
      areaId: "1",
      armado: AHORA.toISOString(),
    };
    const nueva = item("cat-cobranza", sinArmar, "run-1");
    const base = estado({
      contenido: { ...estado().contenido, descartadas: [nueva.id] },
    });
    // Sin elegir: la lápida manda (lo descartó).
    expect(fusionarPropuestas(base, [nueva]).items).toEqual([]);
    // Elegido después desde la lista: la versión nueva entra y se ve.
    const elegido = {
      ...base,
      contenido: {
        ...base.contenido,
        casosDeUso: { "cat-cobranza": { titulo: "Cobranza", areaId: "1" } },
      },
    };
    const p = fusionarPropuestas(elegido, [nueva]);
    expect(p.items.map((i) => i.id)).toEqual([nueva.id]);
    expect(
      propuestaVigente({ ...elegido, propuesta: p }).map((i) => i.id),
    ).toEqual([nueva.id]);
  });

  it("descartar la versión nueva de un elegido no deja lápida ni lo marca como descartado", () => {
    const nueva = item(
      "cat-cobranza",
      { titulo: "Cobranza", areaId: "1", armado: AHORA.toISOString() },
      "run-1",
    );
    const e0 = estado({
      contenido: {
        ...estado().contenido,
        casosDeUso: {
          "cat-cobranza": { titulo: "Cobranza", areaId: "1", aMano: true },
        },
      },
      propuesta: { ...propuestaVacia(), items: [nueva] },
    });
    const e1 = aplicar(e0, [{ op: "descartar", itemIds: [nueva.id] }]);
    expect(e1.propuesta.items).toEqual([]);
    expect(e1.contenido.descartadas).toEqual([]);
    expect(e1.contenido.casosDescartados).toEqual([]);
    expect(e1.contenido.casosDeUso["cat-cobranza"].aMano).toBe(true);
  });

  it("lo armado (actividades, valor, marca) sobrevive a guardar y leer", () => {
    const valor: CasoDeUsoElegido = {
      titulo: "Cobranza",
      areaId: "1",
      actividades: [
        {
          actividadId: "kickoff",
          nombre: "Kickoff",
          veces: 1,
          partes: { sesion: 1 },
        },
      ],
      valorDeVenta: {
        palanca: "Riesgo",
        argumento: "Algo.",
        numeros: [{ dato: "1.200 tickets", fuente: "Reunión" }],
        falta: ["Cuánto vale uno"],
      },
      armado: AHORA.toISOString(),
      aMano: true,
    };
    const it = item("cat-cobranza", valor, "run-1");
    const leida = leerPropuesta(
      JSON.parse(
        JSON.stringify({
          ...propuestaVacia(),
          items: [it],
          casosAnteriores: {
            corridaId: "run-1",
            en: AHORA.toISOString(),
            items: [it],
          },
        }),
      ),
    );
    expect(leida.items[0].valor).toEqual(valor);
    expect(leida.casosAnteriores?.items[0].valor).toEqual(valor);
  });
});
