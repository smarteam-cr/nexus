import { describe, expect, it } from "vitest";
import {
  CAMPO_QUE_LEE_EL_CLIENTE_EN_DOCUMENTOS,
  FRONTERA_DE_LOS_DOCUMENTOS,
  FRONTERA_INTERNA,
  REGLAS_DE_FRONTERA_POR_PIEZA,
  fronteraDeLaPieza,
  fugaEnDocumento,
  lineasConFronteraDeDocumento,
  reglaDeFronteraDelChat,
} from "./frontera-de-los-documentos";
import { MOTIVOS_DE_FUGA, avisoDeFronteraEnLaLinea, huellasDeFrontera } from "./frontera-del-cronograma";
import { DOCUMENTOS_CON_CONTEXTO } from "./documento";
import { pieceBySlug } from "@/lib/pieces/registry";
import { OPERACIONES_DE_DOCUMENTO_VALIDAS } from "@/lib/canvas/operaciones-de-documento";

/**
 * lib/contexto/frontera-de-los-documentos.test.ts — LA FRONTERA LLEGA A LOS DOCUMENTOS (etapa 4).
 *
 * Dos modos de falla, opuestos, y los dos se ven igual desde afuera («el aviso no sirve»):
 *  · que no marque un precio en el kickoff o un «según la reunión» en cualquier documento;
 *  · que marque lo que en un documento es contenido: las cifras del negocio en el diagnóstico y la
 *    entrega, las fechas y los plazos en todos. Un aviso que salta siempre se aprende a ignorar.
 */

const CON_MONTOS = ["kickoff", "planning", "tech-requirements"] as const;
const SIN_MONTOS = ["diagnosis", "delivery"] as const;
const QUE_APLICAN = [...CON_MONTOS, ...SIN_MONTOS];

describe("la regla que viaja con el material", () => {
  it("las piezas de cara al cliente llevan la regla completa; las internas, solo la de puertas adentro", () => {
    for (const d of DOCUMENTOS_CON_CONTEXTO) {
      const deCara = pieceBySlug(d.pieza)!.clientFacing;
      expect(fronteraDeLaPieza(d.pieza), d.pieza).toBe(deCara ? FRONTERA_DE_LOS_DOCUMENTOS : FRONTERA_INTERNA);
    }
    expect(fronteraDeLaPieza("implementation")).toBe(FRONTERA_INTERNA);
    expect(fronteraDeLaPieza("exploration")).toBe(FRONTERA_INTERNA);
  });

  it("una pieza que no está en el registro recibe la regla completa: el error va por el lado estricto", () => {
    expect(fronteraDeLaPieza("una-pieza-nueva")).toBe(FRONTERA_DE_LOS_DOCUMENTOS);
  });

  it("la regla nombra lo que prohíbe, en tuteo", () => {
    for (const parte of ["precios", "descuentos", "lo que cobra Smarteam", "[PUERTAS ADENTRO]", "de dónde salió"]) {
      expect(FRONTERA_DE_LOS_DOCUMENTOS, parte).toContain(parte);
    }
    expect(FRONTERA_INTERNA).toContain("[PUERTAS ADENTRO]");
    for (const regla of [FRONTERA_DE_LOS_DOCUMENTOS, FRONTERA_INTERNA, ...QUE_APLICAN.map(reglaDeFronteraDelChat)]) {
      expect(regla).not.toMatch(/\b(vos|pasás|escribís|decís|podés|tenés)\b/i);
    }
  });

  it("⛔ una cifra del cliente tampoco dice de dónde salió: la regla no se contradice", () => {
    /* La edición que la pone en rojo: volver a pedir la cifra «con su fuente» en un documento que lee
       el cliente, justo después de prohibir decir de dónde salió cada cosa. */
    expect(FRONTERA_DE_LOS_DOCUMENTOS).toContain("cifras del negocio del cliente");
    expect(FRONTERA_DE_LOS_DOCUMENTOS).toContain("sin decir de dónde salieron");
    for (const regla of [FRONTERA_DE_LOS_DOCUMENTOS, ...QUE_APLICAN.map(reglaDeFronteraDelChat)]) {
      expect(regla).not.toMatch(/con (su|la) fuente|nombra(ndo)? la fuente|cita la fuente/i);
    }
  });

  it("las piezas del chat son exactamente las cinco de cara al cliente con contexto", () => {
    expect(Object.keys(REGLAS_DE_FRONTERA_POR_PIEZA).sort()).toEqual([...QUE_APLICAN].sort());
    for (const pieza of QUE_APLICAN) expect(pieceBySlug(pieza)?.clientFacing, pieza).toBe(true);
  });
});

describe("la línea del chat", () => {
  it("las cinco la llevan; la propuesta comercial, el rol y los documentos internos no", () => {
    for (const pieza of QUE_APLICAN) {
      const regla = reglaDeFronteraDelChat(pieza);
      expect(regla, pieza).toContain("FRONTERA");
      expect(regla, pieza).toContain("⚠ revisa");
      expect(regla.startsWith("- "), pieza).toBe(true);
    }
    for (const pieza of ["business-case", "role", "implementation", "exploration", "timeline"]) {
      expect(reglaDeFronteraDelChat(pieza), pieza).toBe("");
    }
  });

  it("en el diagnóstico y la entrega dice que las cifras del negocio del cliente sí van", () => {
    for (const pieza of SIN_MONTOS) {
      expect(reglaDeFronteraDelChat(pieza)).toContain("cifras del negocio del cliente");
      expect(reglaDeFronteraDelChat(pieza), "la cifra va sin su fuente").toContain("sin decir de dónde salieron");
    }
    for (const pieza of CON_MONTOS) expect(reglaDeFronteraDelChat(pieza)).toContain("trae un monto");
  });
});

describe("⭐ el detector de los documentos", () => {
  it("«según la reunión» se marca en todas las piezas que aplican", () => {
    for (const pieza of QUE_APLICAN) {
      expect(fugaEnDocumento("Según la reunión del lunes, el equipo lo lidera Laura.", pieza, null), pieza).toBe(
        MOTIVOS_DE_FUGA.cita,
      );
      expect(fugaEnDocumento("Las etapas confirmadas en el kick-off.", pieza, null), pieza).toBe(MOTIVOS_DE_FUGA.cita);
    }
  });

  it("un precio se marca en el kickoff, la planificación e integraciones; no en el diagnóstico ni la entrega", () => {
    const texto = "La implementación cuesta US$18.000.";
    for (const pieza of CON_MONTOS) expect(fugaEnDocumento(texto, pieza, null), pieza).toBe(MOTIVOS_DE_FUGA.monto);
    for (const pieza of SIN_MONTOS) expect(fugaEnDocumento(texto, pieza, null), pieza).toBeNull();
    expect(fugaEnDocumento("Pierden US$360.000 al año en leads sin seguimiento.", "diagnosis", null)).toBeNull();
  });

  it("⛔ con una novedad de una reunión que trae un monto, el monto se marca también en el diagnóstico y la entrega", () => {
    const texto = "El alcance acordado es la integración por los 18.000 dólares.";
    for (const pieza of SIN_MONTOS) expect(fugaEnDocumento(texto, pieza, null, "nota", true), pieza).toBe(MOTIVOS_DE_FUGA.monto);
  });

  it("la cifra del cliente pasa en el diagnóstico y la entrega, pero no con su fuente al lado", () => {
    const conFuente = "Pierden US$360.000 al año en leads sin seguimiento, según la reunión del lunes.";
    for (const pieza of SIN_MONTOS) expect(fugaEnDocumento(conFuente, pieza, null), pieza).toBe(MOTIVOS_DE_FUGA.cita);
  });

  it("las fechas, los plazos y los correos NO se marcan: en un documento son contenido", () => {
    for (const pieza of QUE_APLICAN) {
      for (const texto of [
        "El proyecto dura 12 semanas.",
        "El arranque es el 15 de octubre.",
        "Seguimiento a los 30 días del go-live.",
        "Escríbele a laura@cliente.com para coordinar.",
      ]) {
        expect(fugaEnDocumento(texto, pieza, null), `${pieza}: ${texto}`).toBeNull();
      }
    }
  });

  it("una pieza interna y la propuesta comercial no corren el detector", () => {
    for (const pieza of ["implementation", "exploration", "business-case", "role"]) {
      expect(fugaEnDocumento("Según la reunión, cuesta US$18.000.", pieza, null), pieza).toBeNull();
    }
  });

  it("la COPIA de una frase del material, solo con huellas", () => {
    const material = [
      "El cliente pidió dejar la integración de WhatsApp con HubSpot para la segunda etapa del proyecto completo.",
    ];
    const h = huellasDeFrontera(material);
    const copia = "El cliente pidió dejar la integración de WhatsApp con HubSpot para la segunda etapa.";
    expect(fugaEnDocumento(copia, "diagnosis", h)).toBe(MOTIVOS_DE_FUGA.copia);
    expect(fugaEnDocumento(copia, "diagnosis", null)).toBeNull();
    expect(fugaEnDocumento(copia, "diagnosis", huellasDeFrontera([]))).toBeNull();
  });
});

describe("⭐ las líneas del acuerdo del chat de un documento", () => {
  const OPS = [
    { op: "seccion.campo", key: "hero", campo: "intro", valor: "Según la reunión del lunes, arrancamos en octubre." },
    { op: "seccion.texto", key: "alcance", valor: "La implementación cuesta US$18.000." },
    { op: "seccion.item.agregar", key: "equipo", lista: "items", valores: { title: "Laura", detail: "Lidera, confirmado en la llamada" } },
    { op: "seccion.item.agregar", key: "tags", lista: "tags", valor: "US$5.000 de pauta" },
    { op: "seccion.crear", tipo: "texto", titulo: "Plan de 12 semanas" },
    { op: "seccion.renombrar", key: "alcance", titulo: "Lo acordado en la reunión" },
    { op: "seccion.rotular", key: "hero", rotulo: "Según la minuta" },
    { op: "seccion.borrar", key: "vieja" },
  ];
  const LINEAS = OPS.map((_, i) => `línea ${i + 1}`);

  it("⛔ una línea por operación, siempre: también con los valores de un ítem nuevo", () => {
    const out = lineasConFronteraDeDocumento(LINEAS, OPS, "kickoff", null);
    expect(out).toHaveLength(OPS.length);
    expect(out[0]).toBe(`línea 1${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.cita)}`);
    expect(out[1]).toBe(`línea 2${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.monto)}`);
    expect(out[2]).toBe(`línea 3${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.cita)}`);
    expect(out[3]).toBe(`línea 4${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.monto)}`);
    expect(out[4], "un plazo en un título de sección es contenido").toBe("línea 5");
    expect(out[5]).toBe(`línea 6${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.cita)}`);
    expect(out[6]).toBe(`línea 7${avisoDeFronteraEnLaLinea(MOTIVOS_DE_FUGA.cita)}`);
    expect(out[7], "borrar no escribe texto").toBe("línea 8");
  });

  it("en el diagnóstico los montos pasan; la cita no", () => {
    const out = lineasConFronteraDeDocumento(LINEAS, OPS, "diagnosis", null);
    expect(out[0]).toContain("⚠ revisa");
    expect(out[1]).toBe("línea 2");
    expect(out[3]).toBe("línea 4");
  });

  it("una pieza interna y la propuesta comercial devuelven las líneas tal cual", () => {
    for (const pieza of ["implementation", "business-case", "role"]) {
      expect(lineasConFronteraDeDocumento(LINEAS, OPS, pieza, null), pieza).toEqual(LINEAS);
    }
  });

  it("con largos distintos las devuelve tal cual (el contrato de leerAcuerdo)", () => {
    expect(lineasConFronteraDeDocumento(LINEAS.slice(1), OPS, "kickoff", null)).toEqual(LINEAS.slice(1));
  });

  it("toda operación del vocabulario que escribe texto tiene su campo en la tabla", () => {
    /* La edición que la pone en rojo: sumar al vocabulario una operación que escribe texto que lee
       el cliente sin decirle a la frontera dónde está ese texto. */
    const QUE_NO_ESCRIBEN = new Set([
      "seccion.item.borrar",
      "seccion.item.mover",
      "seccion.vaciar",
      "seccion.borrar",
      "seccion.ocultar",
      "seccion.mostrar",
      "seccion.mover",
    ]);
    for (const op of OPERACIONES_DE_DOCUMENTO_VALIDAS) {
      if (QUE_NO_ESCRIBEN.has(op)) continue;
      expect(CAMPO_QUE_LEE_EL_CLIENTE_EN_DOCUMENTOS[op], op).toBeDefined();
    }
  });
});
