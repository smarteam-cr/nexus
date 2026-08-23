/**
 * lib/canvas/el-formato-de-la-seccion-manda.test.ts — LA REGLA DE ELÍAS, HECHA MECÁNICA.
 *
 * ── QUÉ CIERRA ───────────────────────────────────────────────────────────────────────────────
 * Elías pidió «agregale títulos más grandes y resumí el texto» sobre una sección del diagnóstico
 * y el chat **la convirtió en tarjetas**. Su regla, textual: *«cada sección debe ser editada en el
 * mismo formato en el que está inicialmente, a no ser que se indique algún otro formato»*.
 *
 * ⛔ Y no era una preferencia de estilo: es la ÚNICA pérdida IRREVERSIBLE del vocabulario. El
 * cuerpo de un documento anterior al motor vive como markdown en bloques TEXT; el motor lo pinta
 * solo mientras NO haya bloque CARD. Escribir un campo crea ese CARD, y desde ahí el texto queda
 * en la base sin ninguna pantalla que lo muestre y ningún botón que lo recupere.
 *
 * Dos causas, las dos tapadas acá:
 *   1. El contexto no seleccionaba `content`, así que para el modelo esa sección NO TENÍA
 *      contenido — «— sin contenido legible» sobre una sección que se lee entera en pantalla.
 *      Pedirle resumirla lo empujaba a escribir campos, que era lo único que sí veía.
 *   2. Nada en el ejecutor distinguía los dos formatos: el predicado vivía en tres líneas sueltas
 *      adentro de `LandingView`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatoDeSeccion, markdownDeBloques } from "@/lib/landing/formato-de-seccion";
import {
  aplicarOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const TODO = { puedeOcultar: true, puedeCrear: true };

const PROSA_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    items: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } },
  },
};

const enProsa = (over: Partial<SeccionActual> = {}): SeccionActual => ({
  id: "s1",
  key: "recomendaciones",
  label: "Recomendaciones",
  data: {},
  schema: PROSA_SCHEMA,
  oculta: false,
  esCreada: false,
  movible: true,
  formato: "prosa",
  ...over,
});

describe("qué formato tiene una sección", () => {
  it("⛔ un bloque CARD apaga la prosa, aunque los TEXT sigan ahí con su texto", () => {
    /* Es la regla EXACTA de `landingRowData`: arma `__legacyMd` solo cuando NO hay CARD. Si esta
       función devolviera el markdown igual, el chat vería «prosa» sobre una sección que en
       pantalla es de campos, y rechazaría ediciones perfectamente válidas. */
    const bloques = [
      { blockType: "TEXT", content: "## Recomendaciones\n\nMigrar el CRM." },
      { blockType: "CARD", content: null },
    ];
    expect(markdownDeBloques(bloques)).toBe("");
    expect(
      formatoDeSeccion({ markdown: markdownDeBloques(bloques), dataTipada: {} }),
    ).toBe("estructurado");
  });

  it("sin CARD, los TEXT unidos SON el cuerpo — y la sección está en prosa", () => {
    const bloques = [
      { blockType: "TEXT", content: "## Recomendaciones" },
      { blockType: "TEXT", content: "Migrar el CRM." },
    ];
    expect(markdownDeBloques(bloques)).toBe("## Recomendaciones\n\nMigrar el CRM.");
    expect(
      formatoDeSeccion({ markdown: markdownDeBloques(bloques), dataTipada: {} }),
    ).toBe("prosa");
  });

  it("con data tipada escrita, manda la data: el markdown viejo ya no se ve", () => {
    expect(
      formatoDeSeccion({ markdown: "texto viejo", dataTipada: { intro: "hola" } }),
    ).toBe("estructurado");
  });

  it("⛔ una PORTADA con markdown viejo SÍ está en prosa — y eso es el arreglo", () => {
    /* La excepción de la portada vivía ACÁ ADENTRO y le decía al chat «una portada nunca está en
       prosa». Con eso el ejecutor concluía que escribirle un campo era seguro: sobre un kickoff
       anterior al motor, «cambiá el titular» creaba el bloque CARD y el cuerpo legacy del hero
       desaparecía para siempre. Lo que la portada tiene distinto es QUIÉN pinta el markdown —su
       propio componente— y eso es una regla de render: vive en `LandingView`, con su `isHero`. */
    expect(formatoDeSeccion({ markdown: "texto viejo", dataTipada: {} })).toBe("prosa");
  });
});

describe("el ejecutor no convierte una sección sin que se lo pidan", () => {
  it("⭐ escribir un campo sobre una sección en prosa se RECHAZA, y el motivo dice qué se pierde", () => {
    const r = aplicarOperacionesDeDocumento(
      [enProsa()],
      [{ op: "seccion.campo", key: "recomendaciones", campo: "intro", valor: "Resumen corto" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas).toHaveLength(1);
    expect(r.rechazadas[0].motivo).toContain("formato anterior");
    expect(r.rechazadas[0].motivo).toContain("deja de verse");
  });

  it("agregar un ítem a una lista también se rechaza — es la misma conversión", () => {
    const r = aplicarOperacionesDeDocumento(
      [enProsa()],
      [
        {
          op: "seccion.item.agregar",
          key: "recomendaciones",
          lista: "items",
          valores: { title: "X" },
        },
      ],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("formato anterior");
  });

  it("⭐ con `convertir` SÍ pasa — y la línea que se aprueba dice que el texto se pierde", () => {
    const ops = [
      {
        op: "seccion.campo" as const,
        key: "recomendaciones",
        campo: "intro",
        valor: "Resumen corto",
        convertir: true,
      },
    ];
    const r = aplicarOperacionesDeDocumento([enProsa()], ops, TODO);
    expect(r.rechazadas).toEqual([]);
    expect(r.plan).toHaveLength(1);
    expect(describirOperacionesDeDocumento([enProsa()], ops)[0]).toContain("DEJA DE VERSE");
  });

  it("y sobre una sección ESTRUCTURADA no cambia absolutamente nada", () => {
    const secs = [enProsa({ formato: "estructurado", data: { intro: "hola" } })];
    const ops = [
      { op: "seccion.campo" as const, key: "recomendaciones", campo: "intro", valor: "chau" },
    ];
    expect(aplicarOperacionesDeDocumento(secs, ops, TODO).rechazadas).toEqual([]);
    /* Y la línea NO lleva el aviso: gritar sobre una sección que no pierde nada enseña a ignorar
       el aviso justo donde importa. */
    expect(describirOperacionesDeDocumento(secs, ops)[0]).not.toContain("DEJA DE VERSE");
  });
});

describe("⭐ y una sección en prosa SÍ se puede editar: `seccion.texto`", () => {
  /**
   * ⛔ LA REGLA DEL FORMATO CASI DEJA ESAS SECCIONES INEDITABLES, y eso habría sido peor que el
   * fallo que vino a arreglar. El rechazo de arriba es correcto, pero el vocabulario no tenía
   * NINGUNA operación que escribiera prosa: la única salida que le quedaba al modelo era
   * `convertir` — o sea, la pérdida irreversible que el rechazo existe para impedir. Lo encontró
   * la revisión adversarial del rango: el prompt mandaba usar `seccion.campo` ahí y el ejecutor la
   * rebotaba siempre; dos frases que se contradecían en renglones consecutivos.
   */
  const conTexto = (over: Partial<SeccionActual> = {}): SeccionActual =>
    enProsa({
      bloquesDeTexto: [{ id: "b1", contenido: "## Recomendaciones\n\nMigrar el CRM." }],
      ...over,
    });

  it("⭐ reescribe el cuerpo sobre el bloque de TEXTO, no sobre el CARD", () => {
    const r = aplicarOperacionesDeDocumento(
      [conTexto()],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "## Resumen\n\nMigrar el CRM en dos fases." }],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.plan).toEqual([
      {
        tipo: "texto",
        sectionId: "s1",
        blockId: "b1",
        contenido: "## Resumen\n\nMigrar el CRM en dos fases.",
      },
    ]);
  });

  it("la línea lleva el TEXTO NUEVO, no «se reescribe el cuerpo»", () => {
    const [linea] = describirOperacionesDeDocumento(
      [conTexto()],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "Migrar el CRM en dos fases." }],
    );
    expect(linea).toContain("Migrar el CRM en dos fases.");
  });

  it("⛔ sobre una sección de CAMPOS se rechaza: el markdown quedaría debajo, invisible", () => {
    const r = aplicarOperacionesDeDocumento(
      [conTexto({ formato: "estructurado", data: { intro: "hola" } })],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "texto" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("está escrita en CAMPOS");
  });

  it("⛔ con DOS bloques de texto no se elige uno: se dice y se para", () => {
    /* Escribir el primero y dejar el otro sería la misma pérdida por otra puerta. */
    const r = aplicarOperacionesDeDocumento(
      [conTexto({ bloquesDeTexto: [{ id: "b1", contenido: "uno" }, { id: "b2", contenido: "dos" }] })],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "texto" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("2 bloques de texto");
  });

  it("⛔ y el rechazo por formato manda a `seccion.texto`, no a un callejón", () => {
    /* El motivo decía «Redacta el cambio como TEXTO», que era una instrucción para hacer algo que
       no existía. Ahora nombra la operación que sí. */
    const r = aplicarOperacionesDeDocumento(
      [conTexto()],
      [{ op: "seccion.campo", key: "recomendaciones", campo: "intro", valor: "x" }],
      TODO,
    );
    expect(r.rechazadas[0].motivo).toContain("seccion.texto");
  });

  it("⭐ y el prompt manda lo mismo que el ejecutor acepta", () => {
    /* La contradicción vivía acá: el prompt decía `seccion.campo` para las secciones en prosa. */
    const src = fs.readFileSync(path.join(process.cwd(), "lib/asistente/turno.ts"), "utf8");
    const i = src.indexOf("EL FORMATO EN EL QUE ESTÁ LA SECCIÓN MANDA");
    const tramo = src.slice(i, src.indexOf("⭐ TÚ ESCRIBES EL TEXTO", i));
    expect(tramo.length, "se movió la regla del formato: la guarda no mira nada").toBeGreaterThan(400);
    expect(tramo).toContain("seccion.texto");
    expect(
      tramo,
      "el prompt vuelve a mandar la operación que el ejecutor rechaza siempre en esas secciones",
    ).not.toContain("se editan\nreescribiendo el texto con `seccion.campo`");
  });
});

describe("las TRES mitades leen el mismo predicado", () => {
  /* Si cada una lo dedujera por su cuenta, la primera divergencia sería una pérdida de contenido
     silenciosa: el chat acordaría escribir campos sobre algo que el motor está pintando como
     texto. Por eso el predicado tiene tres consumidores y ninguna copia. */
  it("el motor que PINTA usa `formatoDeSeccion`, no una condición local", () => {
    const src = leer("components/landing/LandingView.tsx");
    expect(src).toContain("formatoDeSeccion({ markdown: legacyMd, dataTipada: typedData })");
    /* Y la excepción de la portada sigue acá, del lado del render. */
    expect(src, "el hero perdería su marca, su imagen y sus métricas").toContain("!isHero &&");
    expect(src, "volvió la condición inline: el motor y el chat ya pueden divergir").not.toContain(
      "!!legacyMd && !isHero && isBlank(typedData)",
    );
  });

  it("el contexto del SERVIDOR lo calcula, y para eso trae `content`", () => {
    const src = leer("lib/asistente/contexto.ts");
    expect(src, "sin `content` el modelo no ve el cuerpo de una sección en prosa").toContain(
      "blockType: true, content: true",
    );
    expect(src).toContain("formato: formatoDeSeccion({");
    expect(src).toContain("FORMATO: TEXTO CORRIDO");
  });

  it("el ejecutor del NAVEGADOR lo calcula igual", () => {
    expect(leer("components/asistente/ejecutar-operaciones.ts")).toContain(
      "formato: formatoDeSeccion({",
    );
  });

  it("el modelo recibe la regla, y `convertir` está declarado en su herramienta", () => {
    const src = leer("lib/asistente/turno.ts");
    expect(src).toContain("EL FORMATO EN EL QUE ESTÁ LA SECCIÓN MANDA");
    expect(src).toContain("convertir: {");
  });
});
