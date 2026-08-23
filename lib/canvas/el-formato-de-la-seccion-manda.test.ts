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
import { datosDeSeccion, formatoDeSeccion, markdownDeBloques } from "@/lib/landing/formato-de-seccion";
import {
  cuerpoDeSeccionParaElChat,
  camposMudosDe,
  firmaDeSeccion,
  FIRMA_DE_TEXTO_CORRIDO,
  schemaParaElChat,
} from "@/lib/canvas/capacidades-de-documento";
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

  /**
   * ⚠ ESTE TEST SE INVIRTIÓ EL 2026-08-23, Y EL RAZONAMIENTO VIEJO VA ACÁ PORQUE HAY QUE VERLO.
   *
   * Afirmaba lo contrario: que con más de un bloque la operación se RECHAZA, «porque escribir el
   * primero y dejar el otro sería la misma pérdida por otra puerta». Sonaba prudente y era falso.
   * El motor UNE todos los bloques de texto con una línea en blanco y los pinta como UN cuerpo
   * (`landingRowData`): en pantalla hay un texto, no dos. La persona lee uno y aprueba uno.
   *
   * ⛔ El error de razonamiento fue confundir PERDER contenido que no se ve —grave— con REEMPLAZAR
   * contenido que sí se ve, que es literalmente lo que la operación dice hacer y lo que la línea
   * del acuerdo declara. Elías se topó con el rechazo sobre una sección de texto puro: «esta es
   * una sección de texto, debería ser lo más sencillo». Tenía razón.
   */
  it("⭐ con VARIOS bloques de texto se reescribe el cuerpo entero, que es lo que se ve", () => {
    const r = aplicarOperacionesDeDocumento(
      [conTexto({ bloquesDeTexto: [{ id: "b1", contenido: "uno" }, { id: "b2", contenido: "dos" }] })],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "el resumen" }],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
    /* El cuerpo nuevo al primero; los demás en blanco —el motor descarta los vacíos al pintar—.
       Se VACÍAN y no se borran: una fila vacía la recupera el deshacer del editor. */
    expect(r.plan).toEqual([
      { tipo: "texto", sectionId: "s1", blockId: "b1", contenido: "el resumen" },
      { tipo: "texto", sectionId: "s1", blockId: "b2", contenido: "" },
    ]);
  });

  it("⛔ y la línea dice que reemplaza TODO, no que agrega", () => {
    /* Con varios bloques unidos en pantalla, «el texto pasa a» se puede leer como «se suma». */
    const [linea] = describirOperacionesDeDocumento(
      [conTexto()],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "el resumen" }],
    );
    expect(linea).toContain("TODO el texto");
  });

  it("⛔ pero sin ningún bloque de texto se para: no hay dónde escribir", () => {
    const r = aplicarOperacionesDeDocumento(
      [conTexto({ bloquesDeTexto: [] })],
      [{ op: "seccion.texto", key: "recomendaciones", valor: "texto" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("no tiene un bloque de texto");
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

describe("⛔ el chat VE el texto de una sección en prosa (no dice que está vacía)", () => {
  /**
   * El fallo en pantalla, textual: con el chip sobre «Impacto del gap» —que la pantalla estaba
   * pintando entera— el chat contestó *«No hay texto que resumir: está vacía hoy (sin bajada, sin
   * introducción y sin tarjetas)»*.
   *
   * ⛔ Y la causa no era que faltara el contenido: era que `renderSeccionParaElChat` sobre
   * `data = {}` NO devuelve vacío — devuelve un renglón por campo del esquema. Le daba al modelo
   * una descripción CONFIADA de una sección vacía, no un silencio. Por eso afirmaba en vez de
   * dudar. Este test es de comportamiento a propósito: los de fuente no habrían visto la
   * diferencia entre «no dice nada» y «dice que no hay nada».
   */
  const enProsaConTexto = {
    formato: "prosa" as const,
    schema: PROSA_SCHEMA,
    data: {},
    bloquesDeTexto: [{ contenido: "Gap 1 (Alcance indefinido) → Riesgo de relación y reputación." }],
  };

  it("⭐ el cuerpo que recibe el modelo TRAE el texto", () => {
    const cuerpo = cuerpoDeSeccionParaElChat(enProsaConTexto);
    expect(cuerpo).toContain("Gap 1 (Alcance indefinido)");
    expect(cuerpo).toContain("TEXTO CORRIDO");
  });

  it("⛔ y NO describe una sección vacía por los campos del esquema", () => {
    /* Ésta es la assert que importa: lo que rompía no era la ausencia del texto, era la PRESENCIA
       de «intro: (vacío) · items: (lista vacía)», que el modelo leyó como un hecho. */
    const cuerpo = cuerpoDeSeccionParaElChat(enProsaConTexto);
    expect(cuerpo, "volvió el render por esquema: el modelo va a afirmar que está vacía").not.toContain(
      "(vacío)",
    );
  });

  it("…y sobre una sección de CAMPOS sigue rindiendo por esquema, igual que siempre", () => {
    const cuerpo = cuerpoDeSeccionParaElChat({
      formato: "estructurado",
      schema: PROSA_SCHEMA,
      data: { intro: "Una intro", items: [] },
    });
    expect(cuerpo).toContain("Una intro");
    expect(cuerpo).not.toContain("TEXTO CORRIDO");
  });
});

describe("⛔ y las tres LEEN LO MISMO, no solo deciden con la misma función", () => {
  /**
   * ── EL FALLO QUE SE ESCAPÓ DE LA PRIMERA VERSIÓN DE ESTAS GUARDAS ─────────────────────────
   * El predicado ya tenía un solo dueño y las guardas verificaban que los tres lo llamaran. Lo que
   * NO verificaban era con QUÉ lo llamaban: cada mitad armaba «la data tipada» a mano. El motor y
   * el navegador usaban `find(CARD)`; el servidor usaba `find(CARD) ?? bloques[0]` —una tolerancia
   * legacy— y sobre una sección SIN CARD eso devuelve el bloque de TEXTO. Su `data` entraba como
   * contenido tipado y el servidor concluía «estructurado» sobre lo que el motor pintaba en prosa.
   *
   * ⛔ Elías lo vio DOS VECES: la segunda después de que arreglé el renderer, porque el renderer
   * nunca fue el problema. Compartir la decisión no alcanza si no se comparte la LECTURA.
   */
  const LEGACY_CON_DATA = [
    /* El caso real: una sección anterior al motor, sin CARD, cuyo único bloque de texto arrastra
       algo en `data`. Sin ese `data` el fixture no reproduce nada — y ésa fue la trampa. */
    { id: "b1", blockType: "TEXT", content: "Gap 1 (Alcance indefinido) → Riesgo…", data: { titulo: "viejo" } },
  ];

  it("⭐ una sección legacy con `data` en su bloque de TEXTO sigue siendo PROSA", () => {
    expect(formatoDeSeccion(datosDeSeccion(LEGACY_CON_DATA))).toBe("prosa");
  });

  it("⛔ y la lectura ignora el bloque que no es CARD, como hace el motor", () => {
    /* La edición que la pone en rojo: devolverle el respaldo `?? bloques[0]`. */
    expect(datosDeSeccion(LEGACY_CON_DATA).dataTipada).toEqual({});
    expect(datosDeSeccion(LEGACY_CON_DATA).markdown).toContain("Gap 1");
  });

  it("⭐ y ninguna de las dos mitades vuelve a armar los argumentos a mano", () => {
    for (const p of ["lib/asistente/contexto.ts", "components/asistente/ejecutar-operaciones.ts"]) {
      const src = leer(p);
      expect(src, `${p}: volvió a leer los bloques por su cuenta`).toContain(
        "formatoDeSeccion(datosDeSeccion(s.blocks))",
      );
      expect(src, `${p}: quedó una lectura paralela de la data tipada`).not.toContain("dataTipada:");
    }
  });
});

describe("las CUATRO mitades leen el mismo predicado", () => {
  /* Si cada una lo dedujera por su cuenta, la primera divergencia sería una pérdida de contenido
     silenciosa: el chat acordaría escribir campos sobre algo que el motor está pintando como
     texto. Por eso el predicado tiene un solo dueño y ninguna copia.
     ⚠ ERAN CUATRO, NO TRES, y el que faltaba era el que rompió: el bloque del CHIP (`turno.ts`)
     rendía la sección solo por esquema, y como va pegado al mensaje del CSE le GANABA al prefijo.
     Contar mal los consumidores es cómo esta guarda quedó verde mientras el chat afirmaba que una
     sección llena estaba vacía. */
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
    /* ⚠ Los argumentos salen de `datosDeSeccion`, no se arman acá — ver el describe de arriba. */
    expect(src).toContain("formato: formatoDeSeccion(datosDeSeccion(s.blocks))");
    /* El aviso ya no está escrito acá: sale de `AVISO_DE_TEXTO_CORRIDO`, el renderer único. */
    expect(src).toContain("cuerpoDeSeccionParaElChat(");
  });

  it("el ejecutor del NAVEGADOR lo calcula igual", () => {
    expect(leer("components/asistente/ejecutar-operaciones.ts")).toContain(
      "formato: formatoDeSeccion(datosDeSeccion(s.blocks))",
    );
  });

  it("⭐ el CUARTO: el bloque del chip y el del reintento rinden el cuerpo REAL", () => {
    /* Elías puso el chip sobre «Impacto del gap» —una sección en prosa que la pantalla pintaba
       entera— y el chat contestó que estaba VACÍA. `renderSeccionParaElChat` recorre solo el
       esquema: sobre `data = {}` no devuelve vacío, devuelve «intro: (vacío) · items: (lista
       vacía)», así que el modelo no dudaba — afirmaba.
       La edición que la pone en rojo: volver a `renderSeccionParaElChat(s.schema, s.data)`. */
    const src = leer("lib/asistente/turno.ts");
    expect(src, "el bloque del chip volvió a rendir solo por esquema").not.toContain(
      "renderSeccionParaElChat(s.schema, s.data)",
    );
    expect((src.match(/cuerpoDeSeccionParaElChat\(/g) ?? []).length, "falta el del chip o el del reintento").toBe(2);
  });

  it("el modelo recibe la regla, y `convertir` está declarado en su herramienta", () => {
    const src = leer("lib/asistente/turno.ts");
    expect(src).toContain("EL FORMATO EN EL QUE ESTÁ LA SECCIÓN MANDA");
    expect(src).toContain("convertir: {");
  });
});

describe("⛔ el chat no escribe campos que este documento NO PINTA", () => {
  /**
   * Elías pidió cambiar el título del panel oscuro del diagnóstico —«QUÉ TE CUESTA HOY»— y el chat
   * contestó «Aplicado». En pantalla no cambió nada, y no iba a cambiar nunca: ese rótulo vive en
   * la DEF (`chips.panel`) y ninguna operación lo alcanza.
   *
   * ⛔ Lo que el chat SÍ escribió es un campo FANTASMA: `plataforma`, el texto que ese rótulo
   * reemplazó. Estaba en la firma que el modelo lee, `seccion.campo` lo escribía sin rechazo, y el
   * renderer no lo pinta cuando hay chips. Es la asimetría del vocabulario: `rotular` y
   * `renombrar` ya tenían su guarda de «si no se va a ver, se rechaza»; `campo` era la única sin.
   */
  const conChips = { schema: { type: "object", properties: { intro: { type: "string" }, plataforma: { type: "string" } } }, chips: { panel: "Qué te cuesta hoy" } };
  const sinChips = { schema: { type: "object", properties: { intro: { type: "string" }, plataforma: { type: "string" } } } };

  it("⭐ con `chips.panel`, el modelo ya no ve `plataforma` en la firma", () => {
    expect(firmaDeSeccion(schemaParaElChat(conChips))).not.toContain("plataforma");
    expect(camposMudosDe(conChips)).toEqual(["plataforma"]);
  });

  it("⛔ y sin chips SIGUE viéndolo — ahí el campo es real y se pinta", () => {
    /* Es la propuesta de SITIO WEB, el único de estos documentos que se publica al cliente. Si el
       predicado se equivocara, esa propuesta perdería el nombre de la plataforma. */
    expect(firmaDeSeccion(schemaParaElChat(sinChips))).toContain("plataforma");
    expect(camposMudosDe(sinChips)).toEqual([]);
  });

  it("⭐ y el ejecutor lo rechaza solo, porque resuelve contra el MISMO esquema", () => {
    /* No hace falta una guarda nueva en el ejecutor: las rutas se resuelven contra
       `schemaParaElChat`, así que sacar el campo de ahí cierra las dos puertas de una. */
    const seccion: SeccionActual = {
      id: "s1",
      key: "gap_analysis",
      label: "Qué te separa del siguiente nivel",
      data: { intro: "x", plataforma: "" },
      schema: schemaParaElChat(conChips),
      oculta: false,
      esCreada: false,
      movible: true,
    };
    const r = aplicarOperacionesDeDocumento(
      [seccion],
      [{ op: "seccion.campo", key: "gap_analysis", campo: "plataforma", valor: "Lo que estás perdiendo" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("plataforma");
  });
});

describe("⛔ la firma no le ofrece al modelo lo que el ejecutor rechaza", () => {
  /**
   * Una sección en prosa TIENE un esquema —el de prosa: `intro`, `items`…— pero escribir cualquiera
   * de esos campos crea el bloque CARD y el texto desaparece. Anunciárselos al modelo es ofrecerle
   * exactamente lo que el ejecutor va a rebotar: dos señales opuestas en el mismo renglón, y la que
   * gana se decide por suerte. La firma tiene que describir lo que se PUEDE hacer.
   */
  it("⭐ una sección en prosa se firma como texto corrido, no con sus campos", () => {
    expect(FIRMA_DE_TEXTO_CORRIDO).toContain("seccion.texto");
    expect(FIRMA_DE_TEXTO_CORRIDO, "sigue anunciando campos").not.toContain("campos:");
  });

  it("⭐ y el contexto la elige POR FORMATO, no siempre la de campos", () => {
    /* La edición que la pone en rojo: volver a `firmaDeSeccion(...)` incondicional. */
    const src = leer("lib/asistente/contexto.ts");
    expect(src).toContain('formatoDeEsta === "prosa"');
    expect(src).toContain("? FIRMA_DE_TEXTO_CORRIDO");
  });

  it("⚠ y una sección de CAMPOS conserva su firma de siempre", () => {
    const firma = firmaDeSeccion({
      type: "object",
      properties: { intro: { type: "string" }, items: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } } },
    });
    expect(firma).toContain("campos:");
    expect(firma).toContain("items");
  });
});

