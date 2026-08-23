/**
 * lib/canvas/lo-que-el-chat-no-rompe.test.ts — LOS TRES DAÑOS SILENCIOSOS DEL VOCABULARIO.
 *
 * Los tres se descubrieron auditando el chat contra los pedidos de Elías (2026-08-22), los tres
 * estaban VIVOS en producción, y los tres comparten la peor propiedad que puede tener un defecto
 * acá: **el chat decía «aplicado»**. No hay error, no hay log, y lo que se perdió no se nota hasta
 * que alguien abre el documento buscando otra cosa.
 *
 * Ninguno lo cazaba un test: el del ítem comparaba las CLAVES del objeto nuevo sin mirar de qué
 * TIPO nacía cada una, y vaciar y el chip no tenían test.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  aplicarOperacionesDeDocumento,
  describirOperacionesDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";
import { firmaDeSeccion, capacidadDeSeccion, schemaParaElChat } from "./capacidades-de-documento";
import { USE_CASES_DEF } from "@/components/landing/configs/shared-sections.defs";
import { toSectionDef } from "@/components/landing/configs/templates";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";
import { KICKOFF_SECTION_COMPONENTS } from "@/components/landing/configs/kickoff";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const TODO = { puedeOcultar: true, puedeCrear: true };

/** Una sección de plan de sesiones: cada ítem tiene ADENTRO otra lista. */
function seccionDeSesiones(): SeccionActual {
  return {
    id: "s1",
    key: "sesiones",
    label: "Plan de sesiones",
    data: { sesiones: [] },
    schema: {
      type: "object",
      properties: {
        sesiones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              preguntas: {
                type: "array",
                items: { type: "object", properties: { q: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    oculta: false,
    esCreada: false,
    movible: true,
  };
}

describe("lo que el chat no puede romper en silencio", () => {
  it("⛔⭐ un ítem nuevo nace con la FORMA de su esquema — una lista adentro no nace como texto", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       El armado del ítem rellenaba los campos que el modelo no mandó con la string vacía. Cuando
       uno de esos campos era otra LISTA —una sesión de Exploración tiene `preguntas` adentro—, la
       lista nacía como `""`. El render la recorre con `.map`, así que el documento ENTERO dejaba
       de pintarse con «"".map is not a function»… con la data YA GUARDADA: recargar no salvaba,
       Reintentar tampoco, y el PDF caía igual.

       El test viejo comparaba `Object.keys().sort()` — las claves estaban todas, así que pasaba
       en verde con el tipo equivocado. Por eso este afirma el TIPO, no la presencia.

       La edición que lo pone en rojo: volver a `armado[k] = dados[k] ?? ""`. */
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [seccionDeSesiones()],
      [{ op: "seccion.item.agregar", key: "sesiones", lista: "sesiones", valores: { titulo: "Descubrimiento" } }],
      TODO,
    );
    expect(rechazadas, "el agregado se rechazó").toHaveLength(0);
    const escritura = plan.find((e) => e.tipo === "data");
    const nueva = (escritura as { data: { sesiones: Array<Record<string, unknown>> } }).data.sesiones[0];

    expect(nueva.titulo).toBe("Descubrimiento");
    expect(
      Array.isArray(nueva.preguntas),
      "la lista de adentro nació como texto: el documento entero deja de pintarse al abrirlo",
    ).toBe(true);
  });

  it("⛔⭐ vaciar una sección NO se lleva la foto de portada ni los logos", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       Vaciar reemplazaba la data de raíz por el molde del esquema. Pero la foto de portada, los
       logos de marca y la escala del logo viven FUERA del esquema A PROPÓSITO: son de la persona,
       y son exactamente lo que `preserveNonSchemaKeys` conserva cada vez que el agente regenera.
       O sea: el chat era la puerta de atrás por la que se perdía lo único que el motor protege.

       Y el aviso no ayudaba: habla de «vaciar la sección», que nadie lee como «y la foto».

       La edición que lo pone en rojo: volver a `s.data = molde`. */
    const portada: SeccionActual = {
      id: "p1",
      key: "bienvenida",
      label: "Portada",
      data: {
        titulo: "Kickoff Wherex",
        tags: ["Sales Hub"],
        coverImageUrl: "https://cdn/foto.jpg",
        brands: ["@client", "@smarteam"],
        logoScale: 120,
      },
      schema: {
        type: "object",
        properties: { titulo: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
      },
      oculta: false,
      esCreada: false,
      movible: false,
    };

    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [portada],
      [{ op: "seccion.vaciar", key: "bienvenida" }],
      TODO,
    );
    expect(rechazadas).toHaveLength(0);
    const data = (plan.find((e) => e.tipo === "data") as { data: Record<string, unknown> }).data;

    expect(data.titulo, "el texto sí se vacía: para eso es la operación").toBe("");
    expect(data.tags).toEqual([]);
    expect(data.coverImageUrl, "vaciar se llevó la foto de portada").toBe("https://cdn/foto.jpg");
    expect(data.brands, "vaciar se llevó los logos de marca").toEqual(["@client", "@smarteam"]);
    expect(data.logoScale).toBe(120);
  });

  it("⛔⭐ el nombre estable de la sección SOBREVIVE la traducción de la def", () => {
    /* ── EL DAÑO, y es la lección más incómoda de la auditoría ───────────────
       `chatLabel: "Portada"` estaba declarado en la def, con su guarda verde… y el traductor que
       arma la def de runtime NO LO COPIABA. En pantalla el campo era `undefined` siempre, así que
       el chip seguía diciendo el titular del documento («¡Arranquemos juntos!») mientras el
       contexto del modelo la llamaba «Portada»: DOS nombres para la misma sección en el mismo
       pedido — justo lo que ese campo vino a arreglar.

       La guarda vieja probaba la def CRUDA y por eso no vio nada. Ésta prueba la TRADUCIDA, que
       es la que llega a la pantalla.

       La edición que lo pone en rojo: sacar `chatLabel: d.chatLabel` del traductor. */
    const def = toSectionDef(KICKOFF_DEF_BY_KEY.bienvenida, KICKOFF_SECTION_COMPONENTS);
    expect(def, "la portada del kickoff dejó de tener renderer").not.toBeNull();
    expect(
      def!.chatLabel,
      "el nombre estable se pierde al traducir la def: el chip vuelve a decir otro nombre que el contexto",
    ).toBe("Portada");
  });

  it("⭐ el rótulo de arriba se puede cambiar — y no donde sería mudo", () => {
    /* «Que la línea de arriba, que dice LO QUE BUSCAMOS, diga: lo que se resolverá» — el pedido
       real de Elías. No había operación que lo alcanzara, así que el modelo apuntaba al texto
       introductorio y la persona aprobaba un cambio que no era el suyo.

       ⛔ Y no vale en cualquier sección: las que traen su propio encabezado lo ignoran, así que
       escribir la columna ahí diría «aplicado» sin cambiar nada en pantalla.

       La edición que lo pone en rojo: sacar el chequeo de `rotulable`. */
    const base: SeccionActual = {
      id: "o1",
      key: "objetivos",
      label: "Objetivos del proyecto",
      data: { intro: "Esto es lo que acordamos." },
      schema: { type: "object", properties: { intro: { type: "string" } } },
      oculta: false,
      esCreada: false,
      movible: true,
      rotulable: true,
      rotulo: "Lo que buscamos",
    };

    const ok = aplicarOperacionesDeDocumento(
      [structuredClone(base)],
      [{ op: "seccion.rotular", key: "objetivos", rotulo: "Lo que se resolverá" }],
      TODO,
    );
    expect(ok.rechazadas).toHaveLength(0);
    expect(ok.plan).toContainEqual({ tipo: "rotulo", sectionId: "o1", rotulo: "Lo que se resolverá" });

    /* La portada trae su propio encabezado: acá la columna no se lee. */
    const mudo = aplicarOperacionesDeDocumento(
      [{ ...structuredClone(base), key: "bienvenida", rotulable: false }],
      [{ op: "seccion.rotular", key: "bienvenida", rotulo: "Otra cosa" }],
      TODO,
    );
    expect(mudo.plan, "escribió un rótulo que la sección no pinta").toHaveLength(0);
    expect(mudo.rechazadas[0]?.motivo).toContain("su propio encabezado");
  });
});

/**
 * ⭐ LA TABLA — el hueco que fallaba ACEPTANDO, que es el peor de todos.
 *
 * Elías pidió poder crear tablas por chat, y se construyeron. Pero llenarlas era imposible por un
 * camino silencioso: la firma que ve el modelo colapsaba `celdas: string[]` a «celdas(texto)»,
 * indistinguible de un campo de texto. El modelo mandaba el texto de la fila entera, la validación
 * lo ACEPTABA, y la fila se pintaba VACÍA — con el chat diciendo «aplicado».
 */
describe("la tabla se puede llenar, y lo que no se puede se dice", () => {
  const SCHEMA_TABLA = {
    type: "object",
    properties: {
      columnas: { type: "array", items: { type: "object", properties: { titulo: { type: "string" } } } },
      filas: {
        type: "array",
        items: { type: "object", properties: { celdas: { type: "array", items: { type: "string" } } } },
      },
    },
  };

  it("⛔⭐ un texto NO entra en un campo que es lista — se rechaza en vez de pintar la fila vacía", () => {
    /* La edición que lo pone en rojo: sacar el chequeo de tipo del armado del ítem. */
    const tabla: SeccionActual = {
      id: "t1", key: "tabla", label: "Comparativa",
      data: { columnas: [{ titulo: "Nosotros" }], filas: [] },
      schema: SCHEMA_TABLA, oculta: false, esCreada: true, movible: true,
    };
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [tabla],
      [{ op: "seccion.item.agregar", key: "tabla", lista: "filas", valores: { celdas: "A · B · C" } }],
      TODO,
    );
    expect(plan, "guardó un texto donde el render espera una lista: la fila sale vacía").toHaveLength(0);
    expect(rechazadas[0]?.motivo).toContain("casilla por casilla");
  });

  it("⭐ y el camino que SÍ funciona sigue abierto: crear la fila y llenar cada casilla", () => {
    const tabla: SeccionActual = {
      id: "t1", key: "tabla", label: "Comparativa",
      data: { columnas: [{ titulo: "Nosotros" }], filas: [] },
      schema: SCHEMA_TABLA, oculta: false, esCreada: true, movible: true,
    };
    const creada = aplicarOperacionesDeDocumento(
      [tabla],
      [{ op: "seccion.item.agregar", key: "tabla", lista: "filas", valores: {} }],
      TODO,
    );
    expect(creada.rechazadas).toHaveLength(0);
    const data = (creada.plan.find((e) => e.tipo === "data") as { data: { filas: Array<{ celdas: unknown }> } }).data;
    expect(
      Array.isArray(data.filas[0].celdas),
      "la fila nueva no nació con su lista de casillas",
    ).toBe(true);
  });

  it("⭐ la firma le muestra al modelo que ahí hay una LISTA, no un texto", () => {
    /* Es la mitad que evita el error de entrada. Sin ella el rechazo de arriba llega igual, pero
       después de que la persona ya leyó una línea que prometía la fila completa.
       La edición que lo pone en rojo: volver a colapsar la lista anidada a «(texto)». */
    const firma = firmaDeSeccion(SCHEMA_TABLA);
    expect(firma, "las casillas se anuncian como si fueran un campo de texto").not.toContain("celdas(texto)");
    expect(firma).toContain("celdas");
    expect(firma, "la firma no dice que las casillas son varias").toMatch(/celdas\[/);
  });
});

/**
 * ⭐ LA CAJITA HABLA EN CASTELLANO, NO EN RUTAS.
 *
 * «En «Alcance», items.2.detail pasa a: …» no es una frase que alguien pueda aprobar: hay que
 * contar desde cero en una lista para saber de qué tarjeta habla. Y el dato para decirlo bien ya
 * estaba calculado —el ancla, que existe para proteger la operación de un reordenamiento— y no se
 * usaba.
 */
describe("las líneas del acuerdo se leen", () => {
  const CARDS: SeccionActual = {
    id: "a1", key: "alcance", label: "Alcance",
    data: { items: [{ title: "Sales Hub", detail: "viejo" }, { title: "Migración desde Excel", detail: "viejo" }] },
    schema: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } } },
      },
    },
    oculta: false, esCreada: false, movible: true,
  };

  it("⛔⭐ una ruta con índice NUNCA se le muestra a nadie", () => {
    /* La edición que la pone en rojo: volver a interpolar `o.campo` crudo. */
    const [linea] = describirOperacionesDeDocumento(
      [CARDS],
      [{ op: "seccion.campo", key: "alcance", campo: "items.1.detail", valor: "Base completa desde Salesforce" }],
    );
    expect(linea, "la línea nombra la tarjeta por su posición en la lista").not.toContain("items.1");
    expect(linea, "no dice de qué tarjeta habla").toContain("Migración desde Excel");
    expect(linea).toContain("Base completa desde Salesforce");
  });

  it("⭐ un campo de primer nivel se sigue nombrando directo", () => {
    /* Sin ancla que interpolar, la línea no puede inventar una ubicación. */
    const [linea] = describirOperacionesDeDocumento(
      [CARDS],
      [{ op: "seccion.campo", key: "alcance", campo: "intro", valor: "Esto es lo que incluye" }],
    );
    expect(linea).toContain("intro");
    expect(linea).toContain("Esto es lo que incluye");
  });
});

/**
 * ⭐ LOS TRES BLOQUEANTES DEL PRE-PUSH (2026-08-22).
 *
 * Los tres los introdujo o los agravó la tanda que los precede — o sea que salieron de arreglar
 * otra cosa. Es el motivo por el que la auditoría adversarial va ANTES del push y no después.
 */
describe("un lote que entró a medias no se vuelve a escribir", () => {
  it("⛔⭐ el aplicador dice si ESCRIBIÓ, no solo si falló", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       Un lote puede entrar A MEDIAS, y es el caso NORMAL: el prompt pide crear una sección y
       llenarla en un solo acuerdo, y ahí la sección nace pero su contenido se difiere. Si eso se
       anota como fallo, el libro de pendientes conserva el lote ENTERO —incluida la creación que
       ya ocurrió— y el siguiente «Aplicar» crea una SEGUNDA sección. Con un `item.agregar`
       adentro, ítems duplicados. Estas operaciones no son idempotentes.

       La edición que lo pone en rojo: sacar `escribio` del resultado del aplicador, o volver a
       `fallo: rechazadas.length ? … : null` sin mirarlo. */
    const src = leer("components/asistente/ChatDelDocumento.tsx");
    expect(src, "el cajón dejó de distinguir «entró a medias» de «falló»").toContain(
      "if (dicho && escribio)",
    );
    /* Y lo rechazado se sigue diciendo SIEMPRE: si se callara, el modelo re-propondría lo que ya
       entró. Lo que cambia es por cuál canal viaja, no si viaja. */
    expect(src, "lo rechazado dejó de contarse cuando el lote entró a medias").toContain(
      "avisos: [...avisos, dicho]",
    );

    /* Los DOS ejecutores lo informan, o el de rol quedaría siempre en «falló». */
    for (const f of [
      "components/asistente/ejecutar-operaciones.ts",
      "components/asistente/ejecutar-operaciones-de-rol.ts",
    ]) {
      expect(leer(f), `${f} no informa si escribió`).toContain("escribio");
    }
  });

  it("⛔⭐ en documentos, «olvidate de eso» de verdad lo cancela", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       El prompt le pide al modelo que use `descartar`, el bloque de pendientes se lo recuerda y su
       herramienta lo declara — pero la rama de DOCUMENTOS lo leía y lo tiraba. El CSE decía
       «olvidate de eso», el asistente contestaba «descarto lo anterior», y el cambio volvía a la
       cajita CON LA CASILLA MARCADA y se aplicaba igual.

       Prometer un botón de cancelar que no cancela es peor que no tenerlo.

       La edición que lo pone en rojo: componer `arrastradas` sobre `libro.vivas` en vez de sobre
       lo que quedó en pie. */
    const src = leer("lib/asistente/turno.ts");
    const rama = src.slice(src.indexOf("if (!esCronograma)"));
    expect(rama.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(rama, "la rama de documentos volvió a ignorar el descartar").toContain("indiceDeEtiqueta");
    expect(rama, "lo arrastrado no filtra lo cancelado").toContain("cancelados.has");
  });

  it("⛔ una sección que Nexus reescribe no puede anunciarse como intocable", () => {
    /* «Casos de uso» declara que el AGENTE no la escribe, y es cierto — pero la reescribe el
       generate y la pisa el checklist. Sin el flag caía en la clase «la escribió una persona y
       NADA la reescribe», así que el chat invitaba a editar algo que el próximo clic se lleva.
       Fue una regresión de la tanda anterior: en `origin/main` el aviso era el correcto.

       La edición que lo pone en rojo: sacarle `reescritaPorNexus`. */
    expect(
      capacidadDeSeccion(USE_CASES_DEF),
      "«Casos de uso» le dice al chat que nada la reescribe, y el checklist la pisa entera",
    ).toBe("curada");
  });
});

/**
 * ⭐ LO QUE EL CHAT NO PUEDE HACER, LO DICE — los tres «promete y no cumple» del pre-push.
 *
 * Los tres compartían la misma forma: la operación se ACEPTABA, la cajita anunciaba el cambio, el
 * hilo decía «aplicado»… y en pantalla no pasaba nada. Es el modo de falla más caro de este
 * vocabulario, porque la persona archiva un documento creyendo que lo editó.
 */
describe("lo que no se puede, se rechaza con su motivo", () => {
  const base = (extra: Partial<SeccionActual>): SeccionActual => ({
    id: "x1", key: "seccion", label: "Una sección",
    data: { intro: "algo" },
    schema: { type: "object", properties: { intro: { type: "string" } } },
    oculta: false, esCreada: false, movible: true,
    ...extra,
  });

  it("⛔⭐ vaciar una sección SIN CAMPOS no promete un borrado que no ocurre", () => {
    /* La tabla de inversión y la estimación declaran `properties: {}` a propósito — ahí hay plata
       y el agente no la escribe. Vaciarlas era un NO-OP: el merge repone todo lo que el esquema no
       declara, o sea todo. Y la línea decía «⚠ Se borra TODO el contenido».
       La edición que lo pone en rojo: sacar el chequeo de `properties` vacío. */
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [base({ key: "inversion", label: "Inversión", schema: { type: "object", properties: {} }, data: { lineas: [{ monto: "12.000" }] } })],
      [{ op: "seccion.vaciar", key: "inversion" }],
      TODO,
    );
    expect(plan, "escribió un vaciado que no vacía nada").toHaveLength(0);
    expect(rechazadas[0]?.motivo).toContain("se edita en la propia sección");
  });

  it("⛔⭐ renombrar donde el título no se persiste se rechaza (Roles)", () => {
    /* En Roles la lista de secciones es fija y sus títulos salen de la plantilla: el ejecutor de
       ese documento solo escribe contenido, así que el renombrado se descartaba EN SILENCIO.
       La edición que lo pone en rojo: sacar el chequeo de `renombrable`. */
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [base({ renombrable: false })],
      [{ op: "seccion.renombrar", key: "seccion", titulo: "Qué vas a hacer" }],
      TODO,
    );
    expect(plan, "el renombrado se descartó sin decirlo").toHaveLength(0);
    expect(rechazadas[0]?.motivo).toContain("fijos");

    /* Y donde SÍ se persiste sigue funcionando. */
    const ok = aplicarOperacionesDeDocumento(
      [base({})],
      [{ op: "seccion.renombrar", key: "seccion", titulo: "Otro nombre" }],
      TODO,
    );
    expect(ok.rechazadas, "renombrar dejó de funcionar donde sí se ve").toHaveLength(0);
  });

  it("⭐ una sección creada a mano NO queda congelada: su def se sintetiza también en el servidor", () => {
    /* Las `custom:*` no están en la plantilla, así que `defs[key]` es undefined y su esquema salía
       vacío: el modelo la veía «[sin campos editables]» y cualquier cambio moría con «X no es un
       campo de esa sección». O sea que el chat podía CREAR una sección y no tocarla nunca más.
       El navegador ya hacía el fallback; el servidor no — y que las dos mitades resuelvan distinto
       es justo el modo de falla que `schemaParaElChat` existe para impedir.
       La edición que lo pone en rojo: volver a `defs[s.key]` pelado en el contexto. */
    const ctx = leer("lib/asistente/contexto.ts");
    expect(ctx, "el servidor volvió a resolver las defs sin sintetizar las creadas a mano").toContain(
      "defDeSeccion(defs,",
    );
    expect(ctx).toContain("customDef(key, label)");
  });
});

/**
 * ⭐ TRAMO 0 — LA PLOMERÍA, Y LOS DOS DEFECTOS QUE ESTABAN VIVOS.
 *
 * Los dos salieron de la exploración del 2026-08-22 y ninguno lo cazaba un test. El primero
 * BORRA contenido que curó una persona; el segundo le muestra al cliente una nota interna sobre
 * cómo funciona Nexus por dentro.
 */
describe("el esquema del chat es más grande que el del agente, y vaciar lo sabe", () => {
  it("⛔⭐ vaciar una sección CURADA no borra lo que curó la persona", () => {
    /* ── EL DAÑO, y estuvo vivo desde el 2026-08-22 ──────────────────────────
       `equipo`, `horarios` y `canales` del kickoff declaran `schema: {}` —el agente no las
       escribe— y ganaron `schemaDelChat` para que el chat sí pudiera. Pero vaciar leía el
       esquema DEL CHAT: con él, la guarda de «esta sección no tiene campos» dejó de disparar y
       `seccion.vaciar` sobre «El equipo del proyecto» **borraba al equipo entero**.

       Vaciar significa «devolvé la sección a lo que el agente escribiría desde cero». Todo lo que
       el chat alcanza por encima de eso es curaduría.

       La edición que lo pone en rojo: volver `vaciar` a `s.schema`. */
    const equipo: SeccionActual = {
      id: "e1", key: "equipo", label: "El equipo del proyecto",
      data: { members: [{ name: "Heiver Gómez", role: "CSE" }, { name: "Lidia Flores", role: "Marketing" }] },
      /* Lo que el CHAT alcanza. */
      schema: { type: "object", properties: { members: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } } } },
      /* Lo que el AGENTE escribiría: nada. */
      schemaDelAgente: { type: "object", properties: {} },
      oculta: false, esCreada: false, movible: true,
    };
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [equipo],
      [{ op: "seccion.vaciar", key: "equipo" }],
      TODO,
    );
    expect(plan, "vaciar borró al equipo que armó el CSE a mano").toHaveLength(0);
    expect(rechazadas[0]?.motivo).toContain("se edita en la propia sección");
  });

  it("⭐ y donde el agente SÍ escribe, vaciar sigue vaciando", () => {
    /* El converso: sin él, alguien «arregla» el chequeo al revés y vaciar deja de funcionar en
       las 60 secciones normales — igual de malo y más difícil de ver. */
    const prosa: SeccionActual = {
      id: "p1", key: "objetivos", label: "Objetivos",
      data: { intro: "Algo escrito" },
      schema: { type: "object", properties: { intro: { type: "string" } } },
      schemaDelAgente: { type: "object", properties: { intro: { type: "string" } } },
      oculta: false, esCreada: false, movible: true,
    };
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [prosa], [{ op: "seccion.vaciar", key: "objetivos" }], TODO,
    );
    expect(rechazadas, "vaciar dejó de funcionar donde sí corresponde").toHaveLength(0);
    expect((plan[0] as { data: { intro: string } }).data.intro).toBe("");
  });

  it("⛔⭐ el esquema del chat SOBREVIVE la traducción de la def", () => {
    /* La MISMA trampa que `chatLabel`, por tercera vez: declarado en la def, no copiado por el
       traductor, `undefined` en runtime. Hoy no muerde porque el chat lee la def cruda — pero el
       motor resolvería contra el esquema del AGENTE mientras el ejecutor resuelve contra el del
       CHAT, que es la divergencia que `schemaParaElChat` existe para impedir.

       La edición que lo pone en rojo: sacar `schemaDelChat: d.schemaDelChat` del traductor. */
    const traducida = toSectionDef(KICKOFF_DEF_BY_KEY.equipo, KICKOFF_SECTION_COMPONENTS);
    expect(traducida, "«equipo» dejó de tener renderer").not.toBeNull();
    expect(
      schemaParaElChat(traducida!),
      "el esquema del chat se pierde al traducir: el motor y el ejecutor resuelven contra distinto",
    ).toEqual(schemaParaElChat(KICKOFF_DEF_BY_KEY.equipo));
    expect(
      JSON.stringify(schemaParaElChat(traducida!)),
      "la def traducida cayó al esquema del agente, que acá está vacío",
    ).toContain("members");
  });

  it("⛔⭐ la nota interna de cada sección NO cruza al cliente", () => {
    /* ── EL DAÑO ────────────────────────────────────────────────────────────
       El ⓘ era lo ÚNICO del encabezado sin gatear por `editable`. Como el mismo motor sirve al
       editor, al PDF y a la vista pública, un prospecto que pasaba el mouse sobre «Inversión» de
       su propia propuesta leía: «La escribe Ventas: el agente no toca los montos». Y `TipIcon` lo
       pone también en el `aria-label`, o sea que estaba en el DOM sin hover.

       La edición que lo pone en rojo: desgatear `TipIcon`. */
    const src = leer("components/landing/LandingView.tsx");
    expect(src, "el ⓘ volvió a pintarse en la vista del cliente").toContain("{editable && def.tip");
    /* Y el resto del encabezado sigue gateado, que es de donde salió el criterio. */
    expect(src).toContain("{editable ? (");
  });
});

/**
 * ⭐ TRAMO 1 — CREAR Y LLENAR, EN UN SOLO PEDIDO.
 *
 * El caso exacto de Elías (2026-08-22): «creá una sección arriba de Definición de éxito, de tipo
 * cards, que hable de los sistemas a integrar» → **«No se pudieron aplicar 5 de 6: esa sección ya
 * no está en el documento»** ×5, y al refrescar la sección tampoco estaba.
 *
 * Y el diagnóstico sorprendió: las de llenado no fallaban al EJECUTAR — nunca llegaban al plan.
 * `aplicarOperacionesDeDocumento` las rechazaba al construirlo, porque la sección nueva no entraba
 * a la mesa de trabajo. El comentario que lo explicaba prometía «otra pasada» que no existía.
 */
describe("crear y llenar es un solo acuerdo", () => {
  const CREABLE = { puedeOcultar: true, puedeCrear: true };

  it("⛔⭐ las operaciones que nombran la sección nueva NO se rechazan", () => {
    /* La edición que lo pone en rojo: dejar la sección nueva fuera de `trabajo`. */
    const { plan, rechazadas } = aplicarOperacionesDeDocumento(
      [],
      [
        { op: "seccion.crear", tipo: "tarjetas", titulo: "Sistemas a integrar", ref: "s1" },
        { op: "seccion.campo", key: "s1", campo: "intro", valor: "Estos son los sistemas." },
        { op: "seccion.item.agregar", key: "s1", lista: "items", valores: { title: "Aircall", detail: "Telefonía" } },
      ],
      CREABLE,
    );
    expect(
      rechazadas.map((r) => r.motivo),
      "las operaciones de llenado se siguen cayendo sobre la sección que está por nacer",
    ).toEqual([]);

    /* Y el plan trae la creación Y el contenido, apuntado por `ref` (todavía no hay id). */
    expect(plan.some((e) => e.tipo === "crear")).toBe(true);
    const escritura = plan.find((e) => e.tipo === "data") as
      | { tipo: "data"; ref?: string; sectionId?: string; data: { intro: string; items: unknown[] } }
      | undefined;
    expect(escritura, "la sección nace vacía: el contenido no llegó al plan").toBeDefined();
    expect(escritura!.ref, "la escritura no viaja por el ref, así que no hay a quién aplicarla").toBe("s1");
    expect(escritura!.data.intro).toBe("Estos son los sistemas.");
    expect(escritura!.data.items).toHaveLength(1);
  });

  it("⛔ el plan nunca sale ambiguo: o id, o ref, nunca los dos ni ninguno", () => {
    /* La edición que lo pone en rojo: usar `""` como centinela de «todavía no tiene id» —
       silencioso, y el navegador escribiría en una sección inexistente. */
    const existente: SeccionActual = {
      id: "x1", key: "objetivos", label: "Objetivos",
      data: { intro: "" },
      schema: { type: "object", properties: { intro: { type: "string" } } },
      oculta: false, esCreada: false, movible: true,
    };
    const { plan } = aplicarOperacionesDeDocumento(
      [existente],
      [
        { op: "seccion.campo", key: "objetivos", campo: "intro", valor: "Vieja" },
        { op: "seccion.crear", tipo: "tarjetas", titulo: "Nueva", ref: "n1" },
        { op: "seccion.campo", key: "n1", campo: "intro", valor: "Nueva" },
      ],
      CREABLE,
    );
    for (const e of plan) {
      if (e.tipo !== "data") continue;
      /* ⚠ `in`, no truthiness: el centinela que hay que cazar es `sectionId: ""`, que es falsy —
         con `!!` la guarda pasaba en verde sobre la edición que dice prevenir. */
      const tieneId = "sectionId" in e && e.sectionId !== undefined;
      const tieneRef = !!e.ref;
      expect(tieneId !== tieneRef, `una escritura ambigua: id=${e.sectionId} ref=${e.ref}`).toBe(true);
    }
  });

  it("⭐ y una sección que nace se puede colocar: no se cae del orden en silencio", () => {
    /* Antes el orden filtraba toda sección sin id — o sea, justo las que acaban de nacer: pedir
       «creala y ponela primera» la dejaba al final sin decir nada.
       La edición que lo pone en rojo: volver a `sectionIds` con un `filter` de ids. */
    const { plan } = aplicarOperacionesDeDocumento(
      [],
      [
        { op: "seccion.crear", tipo: "tarjetas", titulo: "Nueva", ref: "n1" },
        { op: "seccion.mover", key: "n1", posicion: 0 },
      ],
      CREABLE,
    );
    const orden = plan.find((e) => e.tipo === "orden") as
      | { tipo: "orden"; entradas: ({ ref: string } | { sectionId: string })[] }
      | undefined;
    expect(orden, "mover una sección recién creada no produjo ningún reordenamiento").toBeDefined();
    expect(orden!.entradas).toContainEqual({ ref: "n1" });
  });
});
