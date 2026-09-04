/**
 * lib/canvas/confirmar-releyendo.test.ts — LOS DOS «ACTIVAR» DE ELÍAS, DEL 2026-08-23.
 *
 * Textual: *«no importa si esto gasta más tokens, pero que sea rápido y funcione bien»*. De ahí
 * salieron dos decisiones, y las dos viven acá:
 *
 *   1. **Que el modelo vea la sección entera.** No en cada turno —eso sí costaría— sino cuando se
 *      equivoca: el rechazo típico del dry-run («esa lista tiene 5 ítems y pediste el 6») es el
 *      modelo trabajando sobre un recorte del prefijo. En el reintento se le manda entera la
 *      sección que ÉL nombró, así el segundo intento no es un segundo tiro a ciegas.
 *   2. **Confirmar releyendo.** ⭐ Y esto no cuesta un token: no hay modelo. Se relee la base
 *      después de escribir y se compara contra lo que las operaciones dijeron que iban a hacer.
 *
 * ── POR QUÉ LA SEGUNDA, Y NO ES PARANOIA ─────────────────────────────────────────────────────
 * Tres veces seguidas el chat dijo «aplicado» y la pantalla no cambió: tres editores del kickoff
 * sembraban su borrador una vez y no volvían a mirar la prop. Se arregló en su raíz — pero el
 * patrón «escribí y confié» seguía intacto en los otros diez documentos, y su modo de falla es el
 * peor que existe: silencioso Y con acuse de recibo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  verificarOperacionesDeDocumento,
  type OperacionDeDocumento,
  type SeccionActual,
} from "./operaciones-de-documento";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const seccion = (over: Partial<SeccionActual> = {}): SeccionActual => ({
  id: "s1",
  key: "objetivos",
  label: "Objetivos del proyecto",
  data: { intro: "Lo viejo", items: [{ title: "Migrar el CRM" }] },
  schema: {
    type: "object",
    properties: {
      intro: { type: "string" },
      items: {
        type: "array",
        items: { type: "object", properties: { title: { type: "string" } } },
      },
    },
  },
  oculta: false,
  esCreada: false,
  movible: true,
  rotulo: "LO QUE BUSCAMOS",
  ...over,
});

describe("releer la base y comparar", () => {
  it("⭐ un campo que NO quedó escrito produce un aviso que nombra la sección", () => {
    const avisos = verificarOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "objetivos", campo: "intro", valor: "Lo nuevo" }],
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("Objetivos del proyecto");
  });

  it("…y uno que SÍ quedó no dice nada", () => {
    expect(
      verificarOperacionesDeDocumento(
        [seccion({ data: { intro: "Lo nuevo", items: [] } })],
        [{ op: "seccion.campo", key: "objetivos", campo: "intro", valor: "Lo nuevo" }],
      ),
    ).toEqual([]);
  });

  it("un ítem que se agregó y no está, y uno que se borró y sigue", () => {
    const agregado = verificarOperacionesDeDocumento(
      [seccion()],
      [
        {
          op: "seccion.item.agregar",
          key: "objetivos",
          lista: "items",
          valores: { title: "Capacitar al equipo" },
        },
      ],
    );
    expect(agregado[0]).toContain("Capacitar al equipo");

    const borrado = verificarOperacionesDeDocumento(
      [seccion()],
      [
        {
          op: "seccion.item.borrar",
          key: "objetivos",
          lista: "items",
          posicion: 0,
          ancla: "Migrar el CRM",
        },
      ],
    );
    expect(borrado[0]).toContain("sigue en");
  });

  it("⛔ NO avisa en falso cuando el orden de las claves no es el del esquema", () => {
    /* `identidadDeItem` recorre el esquema; `Object.values` recorría el orden en que el modelo
       escribió las claves. Con `{role, name}` buscaba «CSE» mientras el ítem vivo se llama
       «Ana Pérez», y avisaba de un fallo que no ocurrió. */
    const conEquipo = seccion({
      key: "equipo",
      label: "El equipo del proyecto",
      schema: {
        type: "object",
        properties: {
          members: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" } } },
          },
        },
      },
      data: { members: [{ name: "Ana Pérez", role: "CSE" }] },
    });
    expect(
      verificarOperacionesDeDocumento(
        [conEquipo],
        [
          {
            op: "seccion.item.agregar",
            key: "equipo",
            lista: "members",
            valores: { role: "CSE", name: "Ana Pérez" },
          },
        ],
      ),
    ).toEqual([]);
  });

  it("⛔ y NO verifica el ítem cuya identidad reescribe la app", () => {
    /* «agregá a Elías» entra como `{name:"Elías"}` y sale como «Elías González», el nombre del
       directorio. Buscar el que se escribió produce un fallo inventado sobre un cambio perfecto. */
    const conEquipo = seccion({
      key: "equipo",
      label: "El equipo del proyecto",
      schema: {
        type: "object",
        properties: {
          members: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
        },
      },
      data: { members: [{ name: "Elías González" }] },
    });
    const ops: OperacionDeDocumento[] = [
      { op: "seccion.item.agregar", key: "equipo", lista: "members", valores: { name: "Elías" } },
    ];
    expect(verificarOperacionesDeDocumento([conEquipo], ops), "sin completador sí avisa").toHaveLength(1);
    expect(
      verificarOperacionesDeDocumento([conEquipo], ops, (k) => k === "equipo"),
      "con completador NO puede afirmar nada, y callarse es lo honesto",
    ).toEqual([]);
  });

  it("el ojo, el título y el rótulo también se releen", () => {
    expect(
      verificarOperacionesDeDocumento([seccion()], [{ op: "seccion.ocultar", key: "objetivos" }])[0],
    ).toContain("se sigue viendo");
    expect(
      verificarOperacionesDeDocumento(
        [seccion()],
        [{ op: "seccion.renombrar", key: "objetivos", titulo: "Metas" }],
      )[0],
    ).toContain("conserva su nombre");
    expect(
      verificarOperacionesDeDocumento(
        [seccion()],
        [{ op: "seccion.rotular", key: "objetivos", rotulo: "QUÉ CAMBIA" }],
      )[0],
    ).toContain("rótulo");
  });

  it("una sección que se creó y no aparece, y una que se borró y sigue", () => {
    expect(
      verificarOperacionesDeDocumento(
        [seccion()],
        [{ op: "seccion.crear", tipo: "tarjetas", titulo: "Sistemas a integrar" }],
      )[0],
      /* ⚠ Por TÍTULO y no por key: la key la genera el servidor y el acuerdo no la conoce. */
    ).toContain("Sistemas a integrar");
    expect(
      verificarOperacionesDeDocumento([seccion()], [{ op: "seccion.borrar", key: "objetivos" }])[0],
    ).toContain("sigue en el documento");
  });

  it("cinco operaciones que fallan por lo mismo son UN solo aviso", () => {
    const ops: OperacionDeDocumento[] = [
      { op: "seccion.campo", key: "objetivos", campo: "intro", valor: "A" },
      { op: "seccion.campo", key: "objetivos", campo: "intro", valor: "B" },
    ];
    /* La primera no quedó y la segunda tampoco: el síntoma es el mismo y la persona tiene UNA cosa
       que revisar. Repetirlo cinco veces convierte un aviso útil en ruido. */
    expect(verificarOperacionesDeDocumento([seccion()], ops)).toHaveLength(1);
  });

  it("⛔ una sección que ya no está NO produce aviso: no se puede afirmar nada sobre ella", () => {
    expect(
      verificarOperacionesDeDocumento(
        [],
        [{ op: "seccion.campo", key: "objetivos", campo: "intro", valor: "Lo nuevo" }],
      ),
    ).toEqual([]);
  });

  it("⛔ mover y vaciar quedan AFUERA, y es una decisión — no un olvido", () => {
    /* Mover exige comparar posiciones contra una lista que el normalizador del motor pudo
       compactar; vaciar, contra el `empty` del esquema que `preserveNonSchemaKeys` re-puebla a
       propósito. Los dos producirían falsos «no se aplicó» — y un aviso falso enseña a ignorar los
       avisos justo donde importan. Si algún día se cubren, este test es el que hay que cambiar. */
    expect(
      verificarOperacionesDeDocumento(
        [seccion()],
        [
          { op: "seccion.item.mover", key: "objetivos", lista: "items", posicion: 0, a: 1 },
          { op: "seccion.vaciar", key: "objetivos" },
        ],
      ),
    ).toEqual([]);
  });
});

describe("las piezas siguen conectadas", () => {
  it("⭐ `refetch` DEVUELVE lo que trajo, y `null` cuando no se puede afirmar nada", () => {
    /* Sin el valor de vuelta, la verificación tendría que leer `cs.sections` — que dentro del mismo
       callback sigue siendo la foto VIEJA, porque `setSections` es asíncrono. O sea: compararía
       contra lo de antes y avisaría siempre. */
    const src = leer("components/canvas/useCanvasSections.ts");
    expect(src).toContain("Promise<SectionWithBlocks[] | null>");
    expect(src, "el refetch viejo cortaba con `return;` y dejaba la lectura sin valor").toContain(
      "return null; // hubo escrituras más nuevas",
    );
  });

  it("⭐ el aplicador ESPERA las escrituras antes de releer", () => {
    /* Los verbos guardan optimista y sin esperar. Releer sin `flushPending` leería la base ANTES
       de la última escritura y avisaría de un fallo inventado — que es peor que no verificar. */
    const src = leer("components/asistente/ejecutar-operaciones.ts");
    const i = src.indexOf("await hook.flushPending()");
    const j = src.indexOf("await hook.refetch()");
    expect(i, "el aplicador dejó de esperar las escrituras pendientes").toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it("⛔ y el aplicador le pasa CUÁLES tienen completador, no una constante", () => {
    /* Con `() => false` la guarda de arriba sigue verde —prueba la función, no el cableado— y el
       equipo del kickoff vuelve a avisar en falso en cada alta. */
    expect(leer("components/asistente/ejecutar-operaciones.ts")).toContain("(key) => !!comps?.[key]");
  });

  it("⛔ solo se verifica lo ACEPTADO: lo rechazado ya viaja con su motivo", () => {
    const src = leer("components/asistente/ejecutar-operaciones.ts");
    expect(src).toContain("const aplicadas = ops.filter(");
    expect(src).toContain("verificarOperacionesDeDocumento(");
    expect(src).toContain("seccionesParaElEjecutor(frescas, defs),");
  });

  it("⛔ `rechazadas` se declara UNA sola vez en el objeto de retorno", () => {
    /* Estaban las dos: un spread condicional con los «no se pudo crear «X»» y, debajo, la
       propiedad literal. La última clave gana, así que el spread era código muerto y una sección
       que el servidor rechazó crear no llegaba al hilo — con el contenido que la persona había
       aprobado perdido en silencio, porque las escrituras apuntaban a un `ref` que no nació.
       ⚠ `tsc` no lo ve: con un spread en el medio, repetir una clave es LEGAL.
       La edición que la pone en rojo: volver a partirlo en dos. */
    const src = leer("components/asistente/ejecutar-operaciones.ts");
    const desde = src.lastIndexOf("    return {");
    const retorno = src.slice(desde, src.indexOf("\n    };", desde));
    expect(retorno.length, "se movió el retorno del aplicador: la guarda no mira nada").toBeGreaterThan(300);
    expect(
      (retorno.match(/\brechazadas:/g) ?? []).length,
      "hay más de un `rechazadas:` en el mismo objeto: el de abajo pisa al de arriba",
    ).toBe(1);
    /* Y que siga llevando las dos fuentes: lo que rechazó el ejecutor y lo que no se pudo crear. */
    expect(retorno).toContain("sinNacer.map(");
  });

  it("⭐ el mapeo de secciones es UNO SOLO para el render y para la verificación", () => {
    /* Con dos, la verificación compararía contra una forma distinta de la que se acordó — y ese
       fallo se leería como «el editor hizo algo distinto» sobre un editor que hizo lo correcto. */
    const src = leer("components/asistente/ejecutar-operaciones.ts");
    expect(src).toContain("export function seccionesParaElEjecutor(");
    expect(src).toContain("() => seccionesParaElEjecutor(cs.sections, defsByKey),");
  });
});

describe("la sección entera en el reintento", () => {
  const TURNO = leer("lib/asistente/turno.ts");
  const TRAMO = TURNO.slice(
    TURNO.indexOf("function bloqueDeSeccionesNombradas("),
    TURNO.indexOf("export const SLUG_DEL_ASISTENTE"),
  );

  it("⭐ las secciones salen de las OPERACIONES, no de una heurística sobre la prosa del CSE", () => {
    expect(TRAMO.length, "la guarda no está mirando nada").toBeGreaterThan(400);
    expect(TRAMO).toContain('(o as { key?: unknown }).key');
  });

  it("⛔ y NO se manda la que ya viajó con el chip: sería la misma sección dos veces", () => {
    expect(TRAMO).toContain("yaMandada");
    expect(TURNO).toContain("seccionReferida?.key,");
  });

  it("⛔ el tope se DICE: un recorte callado se lee como «éstas son todas»", () => {
    expect(TRAMO).toContain("no entran acá");
  });

  it("⭐ el bloque va en `messages`, JAMÁS en el prefijo cacheado", () => {
    /* El breakpoint de caché está al final del bloque de contexto: meter algo que cambia por turno
       adentro del prefijo lo invalida sin error, sin log, y se descubre en la factura. */
    const i = TURNO.indexOf("const secciones = bloqueDeSeccionesNombradas(");
    const j = TURNO.indexOf("messages.push({ role: \"assistant\"", i);
    expect(i, "se movió el armado del bloque del reintento").toBeGreaterThan(0);
    expect(j, "el bloque dejó de viajar por `messages`").toBeGreaterThan(i);
  });

  it("⚠ y viaja como bloque de TEXTO junto al `tool_result`, no como un mensaje aparte", () => {
    /* Dos mensajes de usuario seguidos no son un turno válido: la llamada fallaría entera. */
    expect(TURNO).toContain('...(secciones ? [{ type: "text" as const, text: secciones }] : [])');
  });
});

describe("el canvas no se relee cada 5 s sin corridas activas (C-09)", () => {
  /**
   * Medido el 2026-09-03: con un canvas abierto y ningún agente corriendo, la pestaña Network
   * mostraba una lectura del canvas entero cada 5 s, para nadie. El poll existe para captar los
   * bloques DRAFT que un agente escribe async — y `useAgentRuns()` ya sabe si hay alguno en
   * curso. Sin provider (fuera del shell) se conserva el poll: el fallo seguro es «poll de más».
   */
  const ARCHIVOS = ["components/canvas/useCanvasSections.ts", "components/canvas/SectionBlockList.tsx"];

  it("los dos polls están condicionados a running.length, y el intervalo no arranca sin corridas", () => {
    /* La edición que lo pone en rojo: sacar el `if (!hayEnCurso) return;` «porque a veces el
       provider se atrasa» — vuelve la lectura cada 5 s para nadie, sin error y sin log. */
    for (const rel of ARCHIVOS) {
      const src = leer(rel);
      expect(src, `${rel}: tiene que preguntarle al provider`).toContain("useAgentRuns()");
      expect(src, `${rel}: la condición es que haya corridas en curso`).toContain("corridas.running.length > 0");
      const i = src.indexOf("setInterval(");
      expect(i, `${rel}: el escaneo no encontró el poll`).toBeGreaterThan(-1);
      const efecto = src.slice(src.lastIndexOf("useEffect(", i), i);
      expect(efecto, `${rel}: el intervalo arranca aunque no haya corridas`).toContain("if (!hayEnCurso) return;");
      const deps = src.slice(i, src.indexOf("]);", src.indexOf("return () => clearInterval", i)));
      expect(deps, `${rel}: hayEnCurso tiene que estar en las deps, o el poll no se apaga al terminar`).toContain("hayEnCurso");
    }
  });

  it("y al terminar la última corrida hacen UNA relectura más (el último bloque pudo caer entre ticks)", () => {
    for (const rel of ARCHIVOS) {
      const src = leer(rel);
      expect(src, `${rel}: sin la relectura de cierre el último bloque del agente se ve recién al recargar`).toContain(
        "habiaEnCurso.current && !hayEnCurso",
      );
    }
  });
});
