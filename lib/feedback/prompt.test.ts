import { describe, expect, it } from "vitest";
import {
  MAX_MENSAJES_EN_EL_PROMPT,
  MAX_REPORTES_EN_EL_PROMPT,
  promptDeReporte,
  promptDeTema,
  reporteParaPromptDesdeElDetalle,
  rutaParaElCodigo,
  type ReporteParaPrompt,
  type TemaParaPrompt,
} from "./prompt";

const CUID = "cmabcdefghijklmnopqrstu12";

function reporte(over: Partial<ReporteParaPrompt> = {}): ReporteParaPrompt {
  return {
    numero: 12,
    tipo: "falla",
    cuerpo: "La etapa de Ferretería El Pino quedó atrás y no la puedo cambiar desde la ficha",
    meFrena: false,
    pantalla: "Clientes",
    ruta: `/clients/${CUID}?pieza=resumen`,
    rol: "CSE",
    marcas: [],
    errores: [],
    mensajes: [],
    tieneCaptura: false,
    escala: null,
    ...over,
  };
}

const VOSEO = /\b(tenés|podés|querés|sabés|elegí|revisá|mirá|hacé|tocá|contá|escribí|mandá|buscá|aplicá|decime|avisame|mostrame|pedime|pegalo)\b/i;

describe("la ruta, como se llama la carpeta", () => {
  it("cambia los ids por [id], en el camino y en la consulta", () => {
    expect(rutaParaElCodigo(`/clients/${CUID}?pieza=resumen`)).toBe("/clients/[id]?pieza=resumen");
    expect(rutaParaElCodigo(`/sales/exploraciones/${CUID}/x?proyecto=${CUID}`)).toBe("/sales/exploraciones/[id]/x?proyecto=[id]");
    expect(rutaParaElCodigo("/empresa/58805575479")).toBe("/empresa/[id]");
    expect(rutaParaElCodigo("/x/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b")).toBe("/x/[id]");
  });

  it("no toca lo que no es un id: carpetas, años, la escala", () => {
    expect(rutaParaElCodigo("/finanzas/punto-de-equilibrio?anio=2026")).toBe("/finanzas/punto-de-equilibrio?anio=2026");
    expect(rutaParaElCodigo("/escala/ventas?industria=ecommerce-retail&vista=matriz&c=1.7.F1")).toBe(
      "/escala/ventas?industria=ecommerce-retail&vista=matriz&c=1.7.F1",
    );
    expect(rutaParaElCodigo("/para-ti")).toBe("/para-ti");
  });
});

describe("el prompt de un reporte", () => {
  it("una falla: qué pasa, dónde, lo que marcó, los errores, lo que se habló y cómo cerrar", () => {
    const p = promptDeReporte(
      reporte({
        meFrena: true,
        marcas: [{ n: 1, descripcion: "botón «Cambiar etapa»" }],
        errores: [{ mensaje: "TypeError: x is undefined", hace: "hace 2 min" }],
        mensajes: [
          { deQuienReporto: false, cuerpo: "¿Te pasa en todos los clientes?" },
          { deQuienReporto: true, cuerpo: "Solo en los que tienen dos proyectos." },
        ],
        tieneCaptura: true,
      }),
    );
    expect(p.startsWith("Arregla esta falla de Nexus (F-12")).toBe(true);
    expect(p).toContain("Lo que escribió quien lo reportó (CSE):");
    expect(p).toContain("«La etapa de Ferretería El Pino quedó atrás");
    expect(p).toContain("Le frena el trabajo: es urgente.");
    expect(p).toContain("Dónde: «Clientes» (ruta /clients/[id]?pieza=resumen).");
    expect(p).toContain("1. botón «Cambiar etapa»");
    expect(p).toContain("- «TypeError: x is undefined» (hace 2 min)");
    expect(p).toContain("- Dirección: ¿Te pasa en todos los clientes?");
    expect(p).toContain("- Quien lo reportó: Solo en los que tienen dos proyectos.");
    expect(p).toContain("Busca la causa");
    expect(p).toContain("pídeme la captura del F-12");
    // El id del cliente no sale en el prompt.
    expect(p).not.toContain(CUID);
  });

  it("sin marcas, errores, conversación ni captura, no aparecen esos bloques", () => {
    const p = promptDeReporte(reporte());
    expect(p).not.toContain("señaló");
    expect(p).not.toContain("consola");
    expect(p).not.toContain("se habló");
    expect(p).not.toContain("captura");
    expect(p).not.toContain("urgente");
  });

  it("una mejora y una duda cierran distinto", () => {
    const mejora = promptDeReporte(reporte({ tipo: "mejora" }));
    expect(mejora.startsWith("Aplica esta mejora en Nexus (F-12")).toBe(true);
    expect(mejora).toContain("docs/DECISIONS.md");
    const duda = promptDeReporte(reporte({ tipo: "duda", meFrena: true }));
    expect(duda.startsWith("Alguien no entendió esta parte de Nexus")).toBe(true);
    expect(duda).toContain("texto, rótulo o ayuda");
    // Que le frene solo cuenta en una falla.
    expect(duda).not.toContain("urgente");
  });

  it("de la conversación van solo los últimos mensajes, y lo dice", () => {
    const mensajes = Array.from({ length: MAX_MENSAJES_EN_EL_PROMPT + 2 }, (_, i) => ({ deQuienReporto: i % 2 === 0, cuerpo: `mensaje ${i + 1}` }));
    const p = promptDeReporte(reporte({ mensajes }));
    expect(p).toContain(`los últimos ${MAX_MENSAJES_EN_EL_PROMPT} mensajes`);
    expect(p).not.toContain("mensaje 1\n");
    expect(p).not.toContain("mensaje 2\n");
    expect(p).toContain(`mensaje ${MAX_MENSAJES_EN_EL_PROMPT + 2}`);
  });

  it("uno de la escala: el criterio, lo que se leía, lo que dice hoy si cambió, la fila del manual, y no publicar", () => {
    const escala = {
      ancla: "1.7.F1",
      donde: "Ventas · Procesos y Rutinas · Funcional",
      textoAnclado: "Cada vendedor registra la siguiente acción.",
      textoDeHoy: "Cada vendedor registra la siguiente acción con fecha.",
      version: "8.6.0",
      edicion: "Ecommerce y retail",
      cambio: { que: "Pedir la fecha", caso: "", decision: "Se mide distinto en el diagnóstico" },
    };
    const p = promptDeReporte(reporte({ tipo: "mejora", pantalla: "Escala · Ventas", ruta: "/escala/ventas?vista=matriz&c=1.7.F1", escala }));
    expect(p.startsWith("Cambio pedido a la Escala de Rendimiento (F-12")).toBe(true);
    expect(p).toContain("Sobre: 1.7.F1 (Ventas · Procesos y Rutinas · Funcional), edición «Ecommerce y retail», versión 8.6.0.");
    expect(p).toContain("Lo que decía cuando lo leyó: «Cada vendedor registra la siguiente acción.»");
    expect(p).toContain("Lo que dice hoy:");
    expect(p).toContain("- Qué cambiaría: Pedir la fecha");
    expect(p).not.toContain("Caso que lo originó");
    expect(p).toContain("docs/escala/");
    expect(p).toContain("No la publiques");
    expect(p).not.toContain("Dónde:");

    const igual = promptDeReporte(reporte({ escala: { ...escala, textoDeHoy: escala.textoAnclado, cambio: null } }));
    expect(igual).not.toContain("Lo que dice hoy");
    expect(igual).not.toContain("fila del manual");
  });

  it("desde lo que cargó la bandeja: sin rol conocido no inventa uno, y la captura se cuenta", () => {
    const r = reporteParaPromptDesdeElDetalle({
      numero: 3,
      tipo: "mejora",
      cuerpo: "Algo",
      meFrena: false,
      pantalla: "Para ti",
      ruta: "/para-ti",
      autor: { rol: "Miembro" },
      marcas: [],
      errores: [],
      mensajes: [{ deQuienReporto: true, cuerpo: "hola" }],
      capturaUrl: "https://firmado.example/x.jpg",
      escala: null,
    });
    expect(r.rol).toBeNull();
    expect(r.tieneCaptura).toBe(true);
    expect(promptDeReporte(r)).toContain("Lo que escribió quien lo reportó:");
    // El enlace firmado de la captura no viaja en el prompt.
    expect(promptDeReporte(r)).not.toContain("firmado.example");
  });
});

describe("el prompt de un tema", () => {
  function tema(over: Partial<TemaParaPrompt> = {}): TemaParaPrompt {
    return {
      titulo: "Cambiar la etapa desde la ficha",
      detalle: "Que el CSE pueda corregir la etapa sin ir a HubSpot.",
      pantalla: "Clientes",
      columna: "planeado",
      reportes: [reporte({ meFrena: true }), reporte({ numero: 15, tipo: "mejora", rol: "Sales" })],
      personas: 2,
      ...over,
    };
  }

  it("dice qué hacer, cuántos lo pidieron y trae cada reporte", () => {
    const p = promptDeTema(tema());
    expect(p.startsWith("Implementa esto en Nexus: «Cambiar la etapa desde la ficha» (tema de la hoja de ruta de Feedback · Planeado).")).toBe(true);
    expect(p).toContain("Que el CSE pueda corregir la etapa sin ir a HubSpot.");
    expect(p).toContain("Dónde se nota: Clientes.");
    expect(p).toContain("Lo pidieron 2 personas en 2 reportes; a 1 le frena el trabajo:");
    expect(p).toContain("F-12 · Algo falla · CSE · «Clientes» (ruta /clients/[id]?pieza=resumen)");
    expect(p).toContain("F-15 · Una mejora · Sales ·");
    expect(p).toContain("docs/DECISIONS.md");
    expect(p).not.toContain("docs/escala/");
  });

  it("un tema cargado a mano, sin reportes, lo dice", () => {
    const p = promptDeTema(tema({ reportes: [], personas: 0, detalle: null, pantalla: null }));
    expect(p).toContain("Lo cargó dirección a mano");
    expect(p).not.toContain("Lo pidieron");
  });

  it("con muchos reportes, entran los primeros y del resto se dice cuántos", () => {
    const muchos = Array.from({ length: MAX_REPORTES_EN_EL_PROMPT + 1 }, (_, i) => reporte({ numero: 100 + i }));
    const p = promptDeTema(tema({ reportes: muchos, personas: 5 }));
    expect(p).toContain(`F-${100 + MAX_REPORTES_EN_EL_PROMPT - 1} ·`);
    expect(p).not.toContain(`F-${100 + MAX_REPORTES_EN_EL_PROMPT} ·`);
    expect(p).toContain("Y 1 reporte más, en Nexus › Feedback.");
  });

  it("si trae reportes de la escala, también dice cómo cambiarla", () => {
    const escala = { ancla: "2.6.F1", donde: null, textoAnclado: "x", textoDeHoy: null, version: "8.6.0", edicion: null, cambio: null };
    const p = promptDeTema(tema({ reportes: [reporte(), reporte({ numero: 20, escala })] }));
    expect(p).toContain("F-20 · Algo falla · CSE · Escala · 2.6.F1");
    expect(p).toContain("escala general");
    expect(p).toContain("docs/DECISIONS.md");
    expect(p).toContain("docs/escala/");
  });
});

describe("cómo habla", () => {
  it("tuteo en todo lo que arma, y nunca un correo", () => {
    const textos = [
      promptDeReporte(reporte({ tieneCaptura: true, mensajes: [{ deQuienReporto: false, cuerpo: "ok" }] })),
      promptDeReporte(reporte({ tipo: "mejora" })),
      promptDeReporte(reporte({ tipo: "duda" })),
      promptDeTema({ titulo: "T", detalle: null, pantalla: null, columna: "decidir", reportes: [reporte({ tieneCaptura: true })], personas: 1 }),
    ];
    for (const t of textos) {
      expect(t).not.toMatch(VOSEO);
      expect(t).not.toMatch(/@/);
    }
  });
});
