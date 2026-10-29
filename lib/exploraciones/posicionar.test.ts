/**
 * «Actualizar escala» (2026-10-18): las reglas puras de lib/exploraciones/posicionar.ts, el pedido del modo
 * «posicionar» y el orden de la historia (versiones-de-la-escala.ts › ordenarVersiones).
 */
import { describe, expect, it } from "vitest";
import type { Edicion } from "@/lib/escala/documento/tipos";
import { leerLaRespuesta, pedidoDePosicionar, FUENTES_DE_POSICIONAR, type ContextoDelPedido } from "./agente-pedido";
import { esFuenteDelCliente, propuestaVacia } from "./contenido";
import { ESCALA_DE_PRUEBA, estadoDePrueba, propuestoDePrueba } from "./escala-de-prueba.test-helpers";
import {
  CLAVE_DE_LA_CUENTA,
  fechaDelMomento,
  modeloDeNegocio,
  nivelesPropuestos,
  objetivosParaUbicar,
  textoDeLaPropuesta,
  textoDeLasTareas,
  textoDeLasVentas,
  textoDelCronograma,
  ordenarVersiones,
  reunionesElegidas,
  type ProyectoParaUbicar,
} from "./posicionar";

const proyecto = (p: Partial<ProyectoParaUbicar> & { id: string }): ProyectoParaUbicar => ({
  nombre: `Proyecto ${p.id}`,
  status: "active",
  contenedor: false,
  hubspotDealId: null,
  servicio: null,
  exploracionId: null,
  creadoEn: "2026-01-01T00:00:00.000Z",
  ...p,
});

describe("objetivosParaUbicar", () => {
  it("ofrece los proyectos vivos primero, después los terminados, la preventa y siempre la cuenta al final", () => {
    const { objetivos, porDefecto } = objetivosParaUbicar({
      proyectos: [
        proyecto({ id: "viejo", status: "inactive", creadoEn: "2025-01-01T00:00:00.000Z" }),
        proyecto({ id: "nuevo", creadoEn: "2026-05-01T00:00:00.000Z" }),
        proyecto({ id: "antes", creadoEn: "2026-02-01T00:00:00.000Z" }),
        proyecto({ id: "info", nombre: "Información del cliente", contenedor: true, exploracionId: "exp-cuenta" }),
      ],
      preventa: { exploracionId: "exp-preventa" },
      ventas: [],
    });
    expect(objetivos.map((o) => o.clave)).toEqual(["proyecto:nuevo", "proyecto:antes", "proyecto:viejo", "preventa:exp-preventa", CLAVE_DE_LA_CUENTA]);
    expect(porDefecto).toBe("proyecto:nuevo");
    // El contenedor no se ofrece como proyecto: es la cuenta, y lleva su exploración.
    const cuenta = objetivos.at(-1)!;
    expect(cuenta).toMatchObject({ tipo: "cuenta", projectId: "info", exploracionId: "exp-cuenta" });
    expect(objetivos.find((o) => o.clave === "proyecto:viejo")?.detalle).toBe("Terminado");
  });

  it("sin proyectos ni preventa, se ubica sobre la cuenta entera (el caso de solo negocios ganados)", () => {
    const { objetivos, porDefecto } = objetivosParaUbicar({
      proyectos: [],
      preventa: null,
      ventas: [
        { id: "v1", nombre: "Licencias 2025", fechaCierre: "2025-03-01", hubspotDealId: "d1" },
        { id: "v2", nombre: "Licencias 2026", fechaCierre: "2026-03-01", hubspotDealId: "d2" },
      ],
    });
    expect(objetivos).toHaveLength(1);
    expect(porDefecto).toBe(CLAVE_DE_LA_CUENTA);
    expect(objetivos[0]).toMatchObject({ projectId: null, exploracionId: null, detalle: "Sin proyecto ni preventa", ventaSugerida: "v2" });
  });

  it("la venta sugerida de un proyecto es la de su mismo trato de HubSpot; sin trato, ninguna", () => {
    const { objetivos } = objetivosParaUbicar({
      proyectos: [proyecto({ id: "a", hubspotDealId: "d1" }), proyecto({ id: "b" })],
      preventa: null,
      ventas: [
        { id: "v1", nombre: "Implementación", fechaCierre: "2025-03-01", hubspotDealId: "d1" },
        { id: "v2", nombre: "Otra", fechaCierre: "2026-03-01", hubspotDealId: "d2" },
      ],
    });
    expect(objetivos.find((o) => o.clave === "proyecto:a")?.ventaSugerida).toBe("v1");
    expect(objetivos.find((o) => o.clave === "proyecto:b")?.ventaSugerida).toBeNull();
  });
});

describe("fechaDelMomento", () => {
  const hoy = "2026-10-18";
  it("hoy es hoy", () => expect(fechaDelMomento("hoy", { venta: null, arranque: null, hoy })).toEqual({ ok: true, dia: hoy }));
  it("al vender es el día en que se ganó la venta", () =>
    expect(fechaDelMomento("al-vender", { venta: { fechaCierre: "2025-06-30" }, arranque: null, hoy })).toEqual({ ok: true, dia: "2025-06-30" }));
  it("al arrancar es el arranque del proyecto", () =>
    expect(fechaDelMomento("al-arrancar", { venta: null, arranque: "2025-07-14T00:00:00.000Z", hoy })).toEqual({ ok: true, dia: "2025-07-14" }));
  it("sin el dato no inventa una fecha", () => {
    expect(fechaDelMomento("al-vender", { venta: null, arranque: null, hoy }).ok).toBe(false);
    expect(fechaDelMomento("al-arrancar", { venta: null, arranque: null, hoy }).ok).toBe(false);
  });
});

describe("nivelesPropuestos", () => {
  it("lista lo propuesto con su porqué, su frase, su fuente y el nivel que tiene hoy", () => {
    const propuesto = propuestoDePrueba("1.2", { nivel: "F", fuente: "reunion", evidencia: "lo dijo en la reunión", porQue: "Ya registran todo en el CRM." });
    const estado = estadoDePrueba({ "1.2": { nivel: "I", fuente: "reunion", evidencia: "antes" } }, { propuesta: { ...propuestaVacia(), items: [propuesto] } });
    const [p, ...resto] = nivelesPropuestos(estado, ESCALA_DE_PRUEBA);
    expect(resto).toHaveLength(0);
    expect(p).toMatchObject({ dimensionId: "1.2", nivel: "F", actual: "I", porQue: "Ya registran todo en el CRM.", cita: "lo dijo en la reunión", fuentes: ["Reunión"], hipotesis: false });
    expect(p.descripcionDelNivel).toBe("Nivel F");
  });

  it("no muestra lo descartado ni lo que no tiene una pista del cliente", () => {
    const descartado = propuestoDePrueba("1.1", { nivel: "F", fuente: "reunion", evidencia: "x" });
    const sinPista = { ...propuestoDePrueba("1.3", { nivel: "E", fuente: "reunion", evidencia: "y" }), fuentes: [{ id: "G1", etiqueta: "Las ventas", cita: "y" }] };
    const estado = estadoDePrueba({}, { propuesta: { ...propuestaVacia(), items: [descartado, sinPista] } });
    estado.contenido.descartadas = [descartado.id];
    expect(nivelesPropuestos(estado, ESCALA_DE_PRUEBA)).toEqual([]);
  });
});

const EDICION: Edicion = {
  slug: "una-industria",
  nombre: "Una industria",
  descripcion: "Para quien vende así.",
  perfilHabitual: { cierre: "transaccional", despues: "recompra" },
  bloque: 101,
  palabras: [
    { general: "Deal", edicion: "Pedido" },
    { general: "Vendedor", edicion: "Asesor" },
  ],
  areas: [
    {
      id: "1",
      nombre: "Ventas",
      descripcion: null,
      panoramica: {},
      dimensiones: [
        { id: "1.1", nombre: "Procesos", pregunta: "¿Cómo atienden un pedido?", descripcion: null, costoDeQuedarse: null, niveles: {}, textos: {}, propios: [], noAplican: ["1.1.F2"], seLeenIgual: [] },
        { id: "1.2", nombre: "Tecnología", pregunta: null, descripcion: null, costoDeQuedarse: null, niveles: {}, textos: {}, propios: [], noAplican: [], seLeenIgual: [] },
      ],
    },
  ],
};

describe("modeloDeNegocio", () => {
  it("dice con qué edición y perfil se mide, por qué y qué cambia frente a la general", () => {
    const m = modeloDeNegocio({ edicion: EDICION, cierre: "con equipo", despues: "continua", elegida: { por: "industria", razon: "Su industria en HubSpot es «Retail»." }, industria: "Retail" });
    expect(m.titulo).toBe("Se mide con la edición Una industria y el perfil con equipo · relación continua");
    expect(m.porQue).toMatch(/^Porque Su industria en HubSpot es «Retail»; vende con un equipo comercial/);
    expect(m.quien).toBe("automatica");
    expect(m.queCambia.join(" ")).toMatch(/«Deal» es «Pedido»/);
    expect(m.queCambia.join(" ")).toMatch(/1 dimensión se pregunta y se lee con sus palabras/);
    expect(m.queCambia.join(" ")).toMatch(/1 criterio de la general no aplica/);
    // Eligieron otro perfil que el habitual de la edición: se dice.
    expect(m.habitualDistinto).toBe("El habitual de Una industria es transaccional · recompra.");
  });

  it("con la escala general dice que no hay una edición de su industria, y sin perfil lo pide", () => {
    const m = modeloDeNegocio({ edicion: null, cierre: null, despues: null, elegida: null, industria: "Software" });
    expect(m.titulo).toBe("Se mide con la escala general");
    expect(m.porQue).toMatch(/«Software»\) no tiene una edición propia/);
    expect(m.porQue).toMatch(/el perfil todavía no está elegido/);
    expect(m.quien).toBeNull();
    expect(m.queCambia).toEqual([]);
  });

  it("una elegida por una persona lo dice", () => {
    expect(modeloDeNegocio({ edicion: EDICION, cierre: "transaccional", despues: "recompra", elegida: { por: "vendedor" }, industria: null }).quien).toBe("persona");
  });
});

describe("los textos de lo vendido y lo que se está haciendo", () => {
  it("las ventas, la más nueva primero, con sobre cuál se ubica", () => {
    const t = textoDeLasVentas(
      [
        { id: "v1", nombre: "Vieja", fechaCierre: "2025-01-01", hubspotDealId: "d1", monto: 1000, moneda: "USD", pipeline: null },
        { id: "v2", nombre: "Nueva", fechaCierre: "2026-01-01", hubspotDealId: "d2", monto: null, moneda: "USD", pipeline: "Ventas" },
      ],
      "v1",
    );
    expect(t.split("\n")).toEqual(["- Nueva · ganada el 2026-01-01 · Ventas", "- Vieja · ganada el 2025-01-01 · USD 1,000 · (se ubica sobre esta venta)"]);
  });

  it("la propuesta separa servicios y licencias, sin las apagadas", () => {
    const t = textoDeLaPropuesta({
      nombre: "Implementación",
      estado: "PUBLISHED",
      aprobadaEl: "2026-02-01T00:00:00.000Z",
      inversion: { lineas: [{ concepto: "Implementación de Sales Hub", monto: "USD 5,000" }, { concepto: "Apagada", monto: "1", activa: "no" }], licencias: [{ concepto: "Sales Hub Pro", monto: "USD 450" }] },
      casosDeUso: ["Ordenar el pipeline"],
    });
    expect(t).toContain("la aprobó el cliente el 2026-02-01");
    expect(t).toContain("Servicios: Implementación de Sales Hub USD 5,000");
    expect(t).not.toContain("Apagada");
    expect(t).toContain("Licencias: Sales Hub Pro USD 450");
    expect(t).toContain("Casos de uso: Ordenar el pipeline");
  });

  it("el cronograma y las tareas", () => {
    expect(textoDelCronograma([{ nombre: "Diagnóstico", estado: "DONE", semanas: 2 }], "2026-03-02T00:00:00.000Z")).toBe("Arrancó el 2026-03-02.\n- Diagnóstico (2 semanas): terminada");
    expect(textoDelCronograma([], null)).toBe("");
    expect(textoDeLasTareas([{ titulo: "Mandar la base", venceEl: "2026-10-20", estado: "pendiente", lado: "cliente" }])).toBe("- Mandar la base (lo prometió el cliente · pendiente · vence 2026-10-20)");
  });
});

describe("ordenarVersiones", () => {
  it("ordena por el día de la posición (o el de guardado), la más nueva primero", () => {
    const v = (id: string, dia: string, diaDeLaPosicion: string | null) => ({ id, dia, diaDeLaPosicion, fecha: `${dia}T12:00:00.000Z` });
    const orden = ordenarVersiones([v("hoy", "2026-10-18", null), v("al-vender", "2026-10-18", "2025-03-01"), v("ayer", "2026-10-17", null)]).map((x) => x.id);
    expect(orden).toEqual(["hoy", "ayer", "al-vender"]);
  });
});

describe("pedidoDePosicionar", () => {
  const ctx: ContextoDelPedido & { objetivo: string } = {
    modo: "leer",
    marco: "cs",
    empresa: "ACME",
    industria: "RETAIL",
    escala: ESCALA_DE_PRUEBA,
    areas: ["1"],
    perfil: "venta con equipo · relación continua",
    contenido: estadoDePrueba().contenido,
    fuentes: [
      { id: "S1", etiqueta: "Reunión del 3 oct (resumen): Seguimiento", texto: "El cliente dijo que cada vendedor lleva su propio Excel de oportunidades." },
      { id: `${FUENTES_DE_POSICIONAR.ventas}1`, etiqueta: "Las ventas ganadas", texto: "- Sales Hub Pro · ganada el 2026-01-01" },
    ],
    hoy: "2026-10-18T12:00:00.000Z",
    objetivo: "el proyecto «Implementación»",
  };

  it("pide solo niveles, con la frase y la escala de su industria", () => {
    const p = pedidoDePosicionar(ctx);
    const props = (p.tools![0] as { input_schema: { properties: Record<string, unknown> } }).input_schema.properties;
    expect(Object.keys(props)).toEqual(["niveles"]);
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("Se ubica sobre: el proyecto «Implementación»");
    expect(cuerpo).toContain("Perfil: venta con equipo · relación continua");
    expect(cuerpo).toContain("=== FUENTE G1: Las ventas ganadas ===");
    expect(String(p.system)).toMatch(/nunca para respaldar un nivel/);
  });

  it("las fuentes nuevas (lo vendido, tareas, cronograma, memoria) no cuentan como lo que dijo el cliente", () => {
    for (const id of ["G1", "B1", FUENTES_DE_POSICIONAR.tareas, FUENTES_DE_POSICIONAR.cronograma, FUENTES_DE_POSICIONAR.memoriaDeLaCuenta, FUENTES_DE_POSICIONAR.memoriaDelProyecto]) {
      expect(esFuenteDelCliente(id), id).toBe(false);
    }
    expect(esFuenteDelCliente("S1")).toBe(true);
  });

  it("un nivel respaldado solo con lo vendido se descarta; con la frase del cliente, entra", () => {
    const respuesta = {
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "proponer",
          input: {
            niveles: [
              { dimensionId: "1.1", nivel: "E", evidencia: "Sales Hub Pro", porQue: "Compró Sales Hub.", fuentes: [{ id: "G1", cita: "Sales Hub Pro · ganada el 2026-01-01" }] },
              { dimensionId: "1.2", nivel: "I", evidencia: "cada vendedor lleva su propio Excel", porQue: "Cada uno lleva lo suyo.", fuentes: [{ id: "S1", cita: "cada vendedor lleva su propio Excel de oportunidades" }] },
            ],
          },
        },
      ],
    } as unknown as Parameters<typeof leerLaRespuesta>[0];
    const r = leerLaRespuesta(respuesta, ctx, "run");
    expect(r.items.map((it) => (it.destino as { dimensionId: string }).dimensionId)).toEqual(["1.2"]);
    expect(r.descartadas).toBe(1);
  });
});

describe("las reuniones que alguien eligió", () => {
  it("la de cada sesión de Meet y las del buscador, sin repetir; las de HubSpot o de un documento no", () => {
    const ids = reunionesElegidas([
      {
        sesiones: [
          { id: "s1", reunion: { id: "m1", origen: "meet" } },
          { id: "s2", reunion: { id: "h1", origen: "hubspot" } },
          { id: "s3" },
        ],
        reunionesElegidas: ["m2", "m1"],
      },
      { sesiones: [{ id: "s4", reunion: { id: "m3", origen: "meet" } }], reunionesElegidas: [] },
    ]);
    expect(ids).toEqual(["m1", "m2", "m3"]);
  });
});
