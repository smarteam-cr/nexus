/**
 * lib/canvas/capacidades-de-documento.test.ts — LAS CAPACIDADES SE INTERPOLAN, NO SE TRANSCRIBEN.
 *
 * Correr: `npx vitest run lib/canvas/capacidades-de-documento.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE, Y NO ES HIPOTÉTICO ───────────────────────────────────────────────────────────
 * Elías pidió que se le pueda preguntar al chat de qué es capaz. Eso se contesta con una fuente
 * única que leen los dos lados —el que ejecuta y el que conversa—, y la trampa es siempre la
 * misma: copiar el texto «para que quede más claro».
 *
 * ⛔ Hasta el 2026-08-22 esa copia YA EXISTÍA. La restricción estaba escrita a mano dos veces, en
 * el prompt del chat y en el contexto, **y una de las dos ya estaba equivocada**: afirmaba que no
 * se pueden crear secciones nuevas, cuando la propuesta comercial las creaba desde el 2026-08-12.
 * O sea que el sistema le estaba diciendo al CSE, por escrito, que algo no se podía hacer.
 *
 * Espejo de `lib/timeline/capacidades.test.ts`, que existe por la misma razón del lado cronograma.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import {
  ADVERTENCIAS_DEL_DOCUMENTO,
  REGLAS_DURAS_DEL_DOCUMENTO,
  advertenciasParaElPedido,
  capacidadDeSeccion,
  catalogoParaElChat,
  operacionesParaElChat,
  ROTULO_DE_CAPACIDAD,
} from "./capacidades-de-documento";
import { CATALOGO_DE_SECCIONES } from "@/lib/landing/catalogo-de-secciones";
import { OPERACIONES_DE_DOCUMENTO_VALIDAS } from "./operaciones-de-documento";

const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const CONTEXTO = "lib/asistente/contexto.ts";
const PROMPT = "lib/asistente/turno.ts";

describe("⛔ una sola copia de las reglas", () => {
  it("el contexto las INTERPOLA", () => {
    /* La edición que la pone en rojo: pegar el texto de las reglas adentro del template de
       `contextoDeDocumento` en vez de interpolar la constante. */
    const src = leer(CONTEXTO);
    expect(src, "el contexto dejó de interpolar las reglas del editor").toContain(
      "REGLAS_DURAS_DEL_DOCUMENTO",
    );
    expect(
      src.includes("Cada operación toca UN campo"),
      "las reglas volvieron a estar transcritas dentro del contexto: son dos copias",
    ).toBe(false);
  });

  it("⭐ y de verdad viajan — no alcanza con que el símbolo esté", () => {
    /* Sin esta mitad, la de arriba pasa en verde sobre una interpolación rota: el import queda,
       el texto no llega, y el chat conversa sin saber qué puede hacer. Es exactamente la segunda
       assert que tiene la guarda del cronograma, y por el mismo motivo. */
    const src = leer(CONTEXTO);
    const i = src.indexOf("REGLAS DEL EDITOR");
    expect(i, "desapareció el bloque de reglas del contexto del documento").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("].join(", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    for (const simbolo of [
      "REGLAS_DURAS_DEL_DOCUMENTO",
      "operacionesParaElChat()",
      "catalogoParaElChat()",
      "ADVERTENCIAS_DEL_DOCUMENTO",
    ]) {
      expect(bloque.includes(simbolo), `el contexto dejó de mandar ${simbolo}`).toBe(true);
    }
  });

  it("⛔ y el prompt REMITE, no transcribe", () => {
    /* La copia que ya existía y ya estaba equivocada. La edición que la pone en rojo: volver a
       escribir la restricción en el prompt «para que quede más claro». */
    const src = leer(PROMPT);
    expect(
      src.includes("NO puede crear secciones nuevas"),
      "volvió la copia en prosa al prompt — y esa frase ya es falsa: la propuesta comercial crea " +
        "secciones desde el 2026-08-12",
    ).toBe(false);
    expect(src, "el prompt dejó de remitir al contexto").toContain("El contexto te dice");
  });

  it("⚠ las reglas tienen cuerpo: una constante vacía interpola nada", () => {
    expect(REGLAS_DURAS_DEL_DOCUMENTO.length).toBeGreaterThan(800);
    expect(ADVERTENCIAS_DEL_DOCUMENTO.length).toBeGreaterThanOrEqual(4);
  });
});

describe("⭐ el catálogo y las operaciones se DERIVAN", () => {
  it("el catálogo del chat sale del catálogo, no de una lista escrita a mano", () => {
    /* Si el menú de la pantalla y lo que el chat cree que puede crear salieran de listas
       distintas, «creá una tabla» significaría dos cosas según por dónde lo pidas — que es lo
       contrario de lo que Elías pidió cuando dijo «igual en todas las áreas». */
    const texto = catalogoParaElChat();
    for (const t of CATALOGO_DE_SECCIONES) {
      expect(texto, `el chat no sabe que puede crear «${t.nombre}»`).toContain(t.tipo);
      expect(texto, `«${t.tipo}» va sin decir qué pinta`).toContain(t.queEs);
    }
  });

  it("y las operaciones también", () => {
    const texto = operacionesParaElChat();
    for (const op of OPERACIONES_DE_DOCUMENTO_VALIDAS) {
      expect(texto, `el chat no sabe que existe ${op}`).toContain(op);
    }
  });

  it("⚠ el catálogo entra en el presupuesto del contexto", () => {
    /* El prefijo del chat tiene techo y se recorta POR SECCIÓN, así que un catálogo que crezca sin
       control desplaza contenido real del documento — y eso no falla: el modelo contesta sobre un
       documento que cree completo.
       La edición que la pone en rojo: usar el `brief` de cada tipo en vez de su `queEs`. Los
       briefs miden entre 200 y 900 caracteres cada uno. */
    const texto = catalogoParaElChat();
    expect(texto.length, "el catálogo se comió el presupuesto del contexto").toBeLessThan(2_000);
    for (const linea of texto.split("\n")) {
      expect(linea.length, `una línea del catálogo es un párrafo: «${linea.slice(0, 40)}…»`).toBeLessThan(220);
    }
  });
});

describe("⭐ qué se puede hacer con cada sección — una sola lectura", () => {
  it("distingue las cuatro clases", () => {
    /* Hasta hoy esta misma pregunta estaba deletreada en CINCO archivos, cada uno con su copia de
       `agentGenerated === false || ctxDriven`. Que el chat, el editor y la píldora citen la misma
       fuente ES la estandarización que se pidió. */
    expect(capacidadDeSeccion({})).toBe("editable");
    expect(capacidadDeSeccion({ agentGenerated: false })).toBe("curada");
    expect(capacidadDeSeccion({ ctxDriven: true })).toBe("derivada");
    expect(capacidadDeSeccion({}, true)).toBe("creada");
  });

  it("⚠ `derivada` gana sobre todo lo demás", () => {
    /* Su contenido no sale del bloque sino del proyecto: no hay dónde escribir. Es una categoría,
       no un permiso — tratarla como «curada» sugeriría que alguien puede editarla a mano. */
    expect(capacidadDeSeccion({ ctxDriven: true, agentGenerated: false })).toBe("derivada");
    expect(capacidadDeSeccion({ ctxDriven: true }, true)).toBe("derivada");
  });

  it("cada clase tiene cómo decírsela a una persona", () => {
    for (const clase of ["editable", "curada", "derivada", "creada"] as const) {
      expect(ROTULO_DE_CAPACIDAD[clase]?.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("las advertencias se disparan por el pedido", () => {
  it("con tildes y sin tildes, y en minúsculas", () => {
    expect(advertenciasParaElPedido("subí la inversión")).toHaveLength(1);
    expect(advertenciasParaElPedido("SUBI LA INVERSION")).toHaveLength(1);
    expect(advertenciasParaElPedido("cambiá el titular")).toHaveLength(0);
  });

  it("⚠ y avisan de lo que DESTRUYE antes de que pase", () => {
    const vaciar = advertenciasParaElPedido("vaciar la sección de alcance");
    expect(vaciar).toHaveLength(1);
    expect(vaciar[0].aviso).toContain("borra TODO");
  });
});
