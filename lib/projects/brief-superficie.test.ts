import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/projects/brief-superficie.test.ts — EL RESUMEN NO PUEDE MENTIR SOBRE SU PROPIA EDAD.
 *
 * ── LAS DOS FORMAS EN QUE ESTA PANTALLA SE VUELVE INÚTIL ─────────────────────
 *
 * 1. **El veredicto de frescura se calcula en el navegador.** Es lo natural cuando alguien
 *    necesita el dato en otra pantalla: mandar las cuatro fechas y decidir del lado del cliente.
 *    Con dos consumidores, cada uno saca su propia conclusión y terminan diciendo cosas distintas
 *    sobre el MISMO resumen — sin que ninguno esté roto. Por eso viaja el veredicto, no los
 *    insumos.
 *
 * 2. **Se esconde cuántas afirmaciones se descartaron.** Es el único indicador de calidad que
 *    este circuito produce: un descarte alto significa que el modelo citó fuentes inexistentes,
 *    o sea que el prompt está flojo. Sin él, un resumen corto se lee como «este proyecto está
 *    tranquilo», que es la conclusión opuesta a la verdadera.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** MENCIONAR NO ES USAR: la sección EXPLICA en un comentario que el veredicto lo resuelve el
 *  servidor, y ese texto haría fallar un escaneo ingenuo — dejándolo verde solo si alguien borra
 *  la explicación, que es premiar lo contrario de lo que se quiere. */
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
const SECCION = "components/projects/ProjectBriefSection.tsx";
const GPS_API = "app/api/projects/[projectId]/gps/route.ts";
const WIDGET = "components/clients/ProjectGPS.tsx";

describe("⭐ la frescura se resuelve en el SERVIDOR", () => {
  it("el GPS llama a `evaluarFrescura` y manda el veredicto", () => {
    const src = leer(GPS_API);
    expect(src).toContain("evaluarFrescura(");
    expect(src, "el veredicto no viaja en el DTO").toContain("vencido: frescura.vencido");
    expect(src, "el motivo no viaja: el aviso quedaría genérico").toContain(
      "motivoDeVencimiento: frescura.motivo",
    );
  });

  it("⚠ la sección NO la recalcula: solo la pinta", () => {
    /* Si el componente importara el evaluador, existirían dos verdades sobre el mismo resumen y
       la del cliente se desincronizaría el día que el servidor sume una señal. */
    expect(sinComentarios(SECCION), "la pantalla recalcula la frescura por su cuenta").not.toContain(
      "evaluarFrescura",
    );
  });

  it("el aviso muestra el MOTIVO, no un «quedó viejo» genérico", () => {
    /* «Hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa» piden reacciones
       distintas; un cartel genérico las aplana en la misma y se termina ignorando. */
    expect(leer(SECCION)).toContain("brief.motivoDeVencimiento");
  });
});

describe("⭐ las afirmaciones descartadas se dicen", () => {
  it("el endpoint las devuelve", () => {
    expect(leer("app/api/projects/[projectId]/brief/route.ts")).toContain("discarded: r.discarded");
  });

  it("y la pantalla las anuncia cuando pesan", () => {
    /* Decirlo SIEMPRE sería ruido —un descarte de 1 sobre 10 no es noticia—; no decirlo nunca
       escondería que el resumen salió corto porque el modelo citó mal. */
    const src = leer(SECCION);
    expect(src).toContain("r.discarded");
    expect(src, "el aviso no explica qué hacer con un descarte alto").toContain(
      "el prompt del agente necesita ajuste",
    );
  });
});

/**
 * ⭐ LA CITA SE PINTA — y esta guarda es la que más falta hacía.
 *
 * Todo lo que hace explícita la procedencia (nombre de la reunión, fecha, hora, enlace) YA viajaba
 * al navegador antes de esta tanda: el `id` de una fuente `sesion` es el id de la FirefliesSession
 * y la fecha guardada es un timestamp completo. No se pintaba, y por eso era indistinguible de un
 * dato que no llega. El modo de falla no es que alguien lo rompa: es que alguien «simplifique» la
 * cita de vuelta al chip compartido y el enlace desaparezca sin un solo error — ni de tipos, ni de
 * build, ni de backend, porque el endpoint sigue mandando todo perfecto para nadie.
 */
describe("⭐ la procedencia se PINTA, no solo se manda", () => {
  /** El `<li>` de cada afirmación. Anclar acá y no en el archivo entero es lo que impide que la
   *  guarda quede verde con un `<Cita>` definido y nunca renderizado — el fallo más plausible. */
  const filaDeAfirmacion = () => {
    const src = sinComentarios(SECCION);
    const i = src.indexOf("brief.statements.map");
    expect(i, "no se encontró el render de las afirmaciones").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("</ul>", i));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(100);
    return tramo;
  };

  it("la fila RENDERIZA la cita descompuesta, no el label crudo", () => {
    expect(
      filaDeAfirmacion(),
      "la cita volvió al chip crudo: sin nombre limpio, sin hora, sin enlace",
    ).toMatch(/<Cita\b/);
  });

  it("y la cita descompone de verdad: nombre, fecha con su significado, y enlace", () => {
    /* El enlace es el gesto que Elías pidió para poder verificar de dónde salió cada punto. Sin
       el `href` la cita es más linda y exactamente igual de ciega que antes. Y sin `describirCita`
       vuelven el `[CON EL CLIENTE]` pegado, el enum `ATRASO` crudo y la fecha de sync disfrazada
       de fecha del hecho. */
    const src = sinComentarios(SECCION);
    expect(src, "la cita dejó de descomponerse").toContain("describirCita(");
    expect(src, "se cayó el <svg> del enlace externo").toContain("M10 6H6a2 2 0 00-2 2v10a2");
    expect(src, "el ícono no navega a ningún lado").toContain("c.href");
  });

  it("⚠ la cita NO se delega al chip compartido de Customer Success", () => {
    /* `SourceChip` lo importan 8 archivos con 16 puntos de render y no tiene un solo test propio.
       Meterle hora, sala y enlace ahí adentro le cambiaría la cara al dashboard de CS, a las KPI
       cards y al resumen de CUENTA sin que nadie lo haya pedido. La cita rica es una decisión de
       ESTA sección, y tiene que seguir viviendo acá. */
    expect(sinComentarios(SECCION)).not.toMatch(/<SourceChip\b/);
  });
});

describe("dónde vive y cómo degrada", () => {
  it("va montado en el widget del proyecto", () => {
    expect(leer(WIDGET)).toContain("<ProjectBriefSection");
  });

  it("⚠ distingue «no hay resumen» de «respuesta vieja sin el campo»", () => {
    /* `null` = nunca se generó, y eso SÍ se pinta (con su CTA). `undefined` = una respuesta
       cacheada de antes de este cambio, y ahí no hay nada honesto que decir. Tratarlos igual
       haría aparecer un «generá el resumen» sobre proyectos que quizá ya lo tienen. */
    expect(leer(WIDGET)).toContain("data.brief !== undefined");
  });

  it("un fallo se ve como fallo", () => {
    expect(leer(SECCION)).toContain("toast.error");
  });

  it("usa tokens del tema, no colores crudos", () => {
    const src = leer(SECCION);
    expect(src).toContain("border-warn-line bg-warn-surface text-warn-ink");
    expect(src).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|amber)-\d/);
  });
});

/**
 * ⭐ EL RESUMEN EN PROSA — Y EL VIAJE COMPLETO DE UN CAMPO NUEVO (2026-09-22)
 *
 * Elías pidió un texto arriba de los hallazgos que entienda el recorrido del cliente y el último
 * handoff. El modo de falla de un campo así no es que se rompa: es que se genere, se PAGUE y no
 * llegue. Son cuatro saltos —el parser, el upsert, el select del GPS, el DTO— y cada uno falla en
 * silencio por separado. Por eso la guarda recorre el viaje entero, no la pantalla sola.
 */
describe("⭐ la narrativa llega de punta a punta", () => {
  it("el runner la desestructura y la escribe en las DOS ramas del upsert", () => {
    /* Con `narrativa` solo en `create`, el primer resumen la tendría y cada regeneración la
       dejaría congelada: un párrafo que envejece mientras la fecha de arriba dice «recién
       generado». Es el mismo defecto que el upsert de este archivo ya evita para `headline`. */
    const src = leer("lib/projects/project-brief.ts");
    expect(src, "el runner no lee la narrativa que el parser devuelve").toContain(
      "const { headline, narrativa, statements, discarded }",
    );
    const i = src.indexOf("prisma.projectBrief.upsert");
    const upsert = src.slice(i, src.indexOf("});", i));
    const enCreate = upsert.slice(upsert.indexOf("create:"), upsert.indexOf("update:"));
    const enUpdate = upsert.slice(upsert.indexOf("update:"));
    expect(enCreate, "la narrativa no se guarda al crear").toContain("narrativa");
    expect(enUpdate, "la narrativa no se actualiza al regenerar").toContain("narrativa");
  });

  it("el GPS la SELECCIONA y la manda en el DTO", () => {
    /* El select es campo por campo: agregar la columna a la base y al parser sin tocarlo deja el
       párrafo escrito en Postgres y nunca leído. */
    const src = leer(GPS_API);
    expect(src, "el select del resumen no pide la narrativa").toContain("narrativa: true");
    expect(src, "la narrativa no viaja al navegador").toContain("narrativa: briefRow.narrativa");
  });

  it("la pantalla la pinta ARRIBA de los hallazgos", () => {
    /* El párrafo existe para volver interpretable a la lista. Debajo es una coda que nadie lee.
       ⚠ La primera versión de esta guarda buscaba el literal `brief.narrativa` en cualquier parte
       del archivo: quedaba VERDE con el bloque apagado (`{false && brief.narrativa && …}`), que es
       exactamente cómo se apaga algo «un rato» y se olvida. Ahora se ancla en la condición EXACTA
       y se mira el tramo que pinta, igual que la fila de las afirmaciones. */
    const src = sinComentarios(SECCION);
    const iNarrativa = src.indexOf("{brief.narrativa && (");
    const iLista = src.indexOf("brief.statements.map");
    expect(iNarrativa, "la sección dejó de pintar la narrativa (o la condición cambió)").toBeGreaterThan(-1);
    expect(iNarrativa, "la narrativa quedó DEBAJO de los hallazgos").toBeLessThan(iLista);
    const tramo = src.slice(iNarrativa, iLista);
    expect(tramo, "la narrativa no se pinta como texto").toMatch(/<p\b/);
  });
});

/**
 * ⭐ EL TOGGLE NO PUEDE ESCONDER LO QUE HAY QUE VER
 *
 * Una sección colapsable es una forma de esconder cosas, y lo primero que se esconde suele ser
 * justo lo que avisa. Colapsado se tienen que seguir leyendo el titular y el «quedó viejo».
 */
describe("⭐ la sección se colapsa sin perder el aviso", () => {
  const encabezado = () => {
    const src = sinComentarios(SECCION);
    const i = src.indexOf("aria-expanded");
    expect(i, "el encabezado dejó de ser un toggle accesible").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf('className={abierto ? "', i));
    expect(tramo.length, "la guarda no está mirando el encabezado").toBeGreaterThan(100);
    return tramo;
  };

  it("el titular y el aviso de vencido viven FUERA del cuerpo colapsable", () => {
    const h = encabezado();
    expect(h, "el titular quedó adentro del cuerpo: colapsado no se lee nada").toContain(
      "brief.headline",
    );
    expect(h, "colapsado ya no se ve que el resumen quedó viejo").toContain("brief.vencido");
  });

  it("el cuerpo se OCULTA, no se desmonta", () => {
    /* Desmontarlo tira el estado de «generando» y cualquier scroll: el toggle pasaría a tener
       efectos que nadie pidió. Mismo criterio que la sección de Contexto. */
    expect(sinComentarios(SECCION)).toContain('className={abierto ? "');
  });
});

describe("⭐ el cartel de alta no deja un hueco cuando no tiene nada que decir", () => {
  it("el widget pregunta si HAY algo que mostrar, no si existe el estado", () => {
    /* `altaEstado` es "listo" en todo proyecto bien dado de alta, así que la condición vieja
       pintaba un envoltorio con `p-4` mientras `AltaTrabada` devolvía null: 16 px de aire arriba
       del resumen, en cada ficha, sin que nada fallara. */
    const src = sinComentarios(WIDGET);
    expect(src, "volvió el envoltorio que se pinta con el cartel vacío").toContain(
      "altaEnCurso(parseEstadoDeAlta(data.alta.estado))",
    );
  });
});

describe("⭐ regenerar el handoff vence el resumen", () => {
  it("el GPS alimenta la señal en vez de mandar null", () => {
    /* La narrativa se apoya en el handoff: con la señal apagada, el resumen se sigue diciendo
       fresco mientras cuenta una versión vieja de lo que se vendió. */
    const src = sinComentarios(GPS_API);
    expect(src, "la señal del handoff volvió a viajar apagada").toContain(
      "handoffActualizadoEn: handoffRow?.updatedAt ?? null",
    );
  });
});
