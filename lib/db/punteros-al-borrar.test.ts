import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/db/punteros-al-borrar.test.ts — BORRAR NO DEJA PUNTEROS MUERTOS.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * `FirefliesSession.manualClientId` y `resolvedClientId` son `String?` **sin `@relation`**: la
 * base no los protege y ningún DELETE los limpiaba. Una sesión con el dueño apuntando a un
 * cliente borrado cae en tierra de nadie — no pertenece a ningún cliente vivo, pero tampoco
 * cuenta como «sin dueño», así que el buscador de reuniones internas (que exige las dos columnas
 * en null) también la rechaza.
 *
 * Invisible en la pantalla, invisible para INV1, y **INV2 da VERDE**: el resolver es
 * determinista, no correcto. Escondió una reunión en un demo en vivo el 2026-08-04 y solo se
 * pudo diagnosticar leyendo la base a mano.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** El cuerpo de un bloque, con llaves balanceadas desde el ancla. */
function bloqueDesde(src: string, ancla: string): string {
  const i = src.indexOf(ancla);
  if (i < 0) return "";
  const abre = src.indexOf("{", i);
  if (abre < 0) return "";
  let nivel = 1;
  let j = abre + 1;
  while (j < src.length && nivel > 0) {
    if (src[j] === "{") nivel++;
    else if (src[j] === "}") nivel--;
    j++;
  }
  return src.slice(abre, j);
}

describe("borrar un cliente suelta sus sesiones", () => {
  const RUTA = "app/api/clients/[id]/route.ts";

  it("LA guarda: se sueltan las DOS columnas, dentro de la transacción", () => {
    /* `resolveAllSessions()` NO alcanza y ésa es la trampa: reescribe `resolvedClientId` y
       **nunca toca `manualClientId`**. Confiar en él —que es exactamente lo que hacía el código
       viejo— deja el override colgado para siempre. Y sacar el bloque de la transacción "porque
       el updateMany es rápido" reabre la ventana en que el cliente ya no está y las sesiones
       siguen apuntándole. Ninguna de las dos regresiones rompe otro test ni pinta un invariante
       en rojo. */
    const src = leer(RUTA);
    const tx = bloqueDesde(src, "prisma.$transaction");
    expect(tx.length, "el borrado de cliente dejó de ser transaccional").toBeGreaterThan(200);
    expect(tx, "el override manual volvió a quedar colgando").toContain("manualClientId: null");
    expect(tx, "el dueño automático volvió a quedar colgando").toContain("resolvedClientId: null");
    expect(tx, "se soltaron con el prisma global, o sea fuera de la transacción").toContain(
      "tx.firefliesSession.updateMany",
    );
  });

  it("se sueltan ANTES de borrar el cliente", () => {
    const tx = bloqueDesde(leer(RUTA), "prisma.$transaction");
    expect(tx.indexOf("manualClientId: null")).toBeLessThan(tx.indexOf("tx.client.delete"));
  });

  it("el fallo del re-resolve se loguea, no se traga", () => {
    /* El `.catch(() => {})` mudo fue cómplice de este bug durante meses: si el refresco no corría,
       nadie se enteraba. */
    const src = leer(RUTA);
    expect(src, "volvió el catch mudo del re-resolve").not.toMatch(
      /resolveAllSessions\(\)\.catch\(\(\) => \{\}\)/,
    );
    expect(src).toContain("console.error");
  });
});

describe("asignar cliente a mano no puede inventar un dueño", () => {
  const RUTA = "app/api/sessions/[id]/route.ts";

  it("LA guarda: se verifica que el cliente exista antes de escribir", () => {
    /* Sin esto se puede fabricar el puntero muerto por API: la columna acepta cualquier string y
       nadie la valida después. Es la puerta de entrada del mismo estado que escondió la reunión
       del demo, y este endpoint es el que MENOS permisos pide de todo el dominio. */
    const src = leer(RUTA);
    expect(src, "dejó de verificar que el cliente exista").toContain("prisma.client.findUnique");
    expect(src, "el 400 desapareció: vuelve a aceptar un id inventado").toContain("400");
    /* El write se mudó al chokepoint `asignarDuenioManual` (2026-08-16) para que el sello y su
       PROCEDENCIA se escriban siempre juntos. El invariante no cambió —verificar antes de
       escribir— así que la guarda se re-ancla al nombre nuevo en vez de aflojarse. */
    const iCheck = src.indexOf("prisma.client.findUnique");
    const iWrite = src.indexOf("asignarDuenioManual(");
    expect(iWrite, "el endpoint dejó de pasar por el chokepoint del dueño").toBeGreaterThan(-1);
    expect(iCheck, "la verificación quedó DESPUÉS de la escritura").toBeLessThan(iWrite);
  });

  it("un cuerpo que no es id ni null se rechaza, no se coacciona", () => {
    // `body.manualClientId ?? null` aceptaba números y objetos y los escribía tal cual.
    expect(leer(RUTA)).toContain('typeof crudo !== "string"');
  });
});

describe("el cartel dice el motivo REAL", () => {
  it("LA guarda: cuenta aparte los proyectos suprimidos", () => {
    /* `skipped` mezcla varias razones de salteo. La supresión es la única que tiene una
       explicación para el usuario, y sin contarla aparte la pantalla no puede distinguirla:
       vuelve el cartel que manda a revisar HubSpot por un proyecto que está perfectamente
       asociado y que Nexus ignora a pedido. */
    const src = leer("lib/hubspot/sync-projects.ts");
    expect(src, "el contador de suprimidos desapareció del resultado del sync").toContain(
      "suprimidos: number",
    );
    expect(src, "se cuenta el salteo pero no la supresión").toContain("result.suprimidos++");
  });

  it("LA guarda de la cadena: el dato SOBREVIVE la copia del resultado", () => {
    /* La pantalla copia el resultado del sync CAMPO POR CAMPO, así que sumar uno al servidor no
       alcanza: si no se agrega también en ese objeto, el dato llega al navegador y se tira en una
       línea. Pasó con `suprimidos` el mismo día que se creó — el endpoint lo devolvía bien, el
       cartel lo leía bien, y entre medio el `setSyncResult` lo descartaba. El cartel seguía
       mandando a revisar HubSpot por un problema que no existía, y desde afuera se veía como si
       el arreglo entero no hubiera funcionado.

       Es el eslabón que ningún test de servidor ni de UI ve por separado: los dos extremos están
       bien y la cadena está cortada en el medio. */
    const src = leer("app/(shell)/clients/[id]/WorkspaceClient.tsx");
    const i = src.indexOf("setSyncResult({");
    expect(i, "se movió el ancla de la copia del resultado").toBeGreaterThan(0);
    /* Sin comentarios: la prosa que explica ESTE bug vive justo adentro del bloque y nombra el
       campo, así que un escaneo crudo pasa en verde con el campo ya borrado. Cazado rompiéndola. */
    const copia = src.slice(i, src.indexOf("})", i)).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(copia, "la copia del resultado volvió a tirar los suprimidos").toContain("suprimidos");
  });

  it("y la pantalla lo usa: si no, el dato viaja y muere", () => {
    /* El pecado recurrente de este repo: el dato llega al navegador y no lo pinta nadie. Pasó con
       el motivo de relevancia (vivía en un tooltip) y con los descartes del chokepoint (morían en
       un console.warn). Un dato que llega y no se pinta es idéntico a uno que no llega. */
    const src = leer("app/(shell)/clients/[id]/WorkspaceClient.tsx");
    const i = src.indexOf("No se cargó ningún proyecto de HubSpot");
    expect(i, "se movió el ancla del cartel").toBeGreaterThan(0);
    /* Se mira el BLOQUE del cartel, no el archivo: `suprimidos` también aparece en la declaración
       del tipo, así que un escaneo global pasaría en verde con el cartel devuelto a su versión
       mentirosa. Y el ancla se toma con `indexOf` porque este literal es único. */
    const cartel = src.slice(Math.max(0, i - 1200), i + 1200);
    /* ⚠ Se afirma sobre la CONDICIÓN, no sobre el texto. Un escaneo del mensaje pasa en verde con
       el mensaje presente pero inalcanzable —basta cambiar el `if` para que nunca entre— y ése es
       el límite de esta clase de guarda. La condición es lo único que no se puede dejar puesto y
       tener el bug a la vez. Verificado rompiéndola de las dos formas. */
    const veces = cartel.split("(syncResult?.suprimidos ?? 0) > 0").length - 1;
    expect(
      veces,
      "el cartel dejó de ramificar por los suprimidos: vuelve a mandar a revisar HubSpot por un problema que no existe",
    ).toBe(2);
    expect(cartel, "se perdió el motivo real").toContain("se borró desde Nexus");
  });
});

describe("el buscador no esconde lo que un click sacó", () => {
  const RUTA = "app/api/projects/[projectId]/session-candidates/route.ts";

  it("LA guarda: las excluidas NO se filtran de las candidatas", () => {
    /* Volver a poner `!excludedIds.has(s.id)` es la optimización más obvia del archivo —"no
       muestres lo que ya está excluido"— y reconstruye el incidente: la «X» sacaba la sesión de
       la lista Y del único buscador que podía traerla de vuelta. Un click la borraba de la
       pantalla entera, y la pantalla se veía perfecta. */
    const src = leer(RUTA);
    const i = src.lastIndexOf(".filter((s) => !feedingIds");
    expect(i, "se movió el filtro de candidatas; revisar esta guarda").toBeGreaterThan(0);
    expect(
      src.slice(i, i + 120),
      "volvió el filtro que esconde del buscador justo lo que hay que recuperar",
    ).not.toContain("excludedIds");
  });

  it("vuelven MARCADAS, no disfrazadas de nuevas", () => {
    /* Una excluida que reaparece sin marca se lee como una que nunca estuvo, y nadie entiende por
       qué "reapareció". */
    expect(leer(RUTA), "el DTO dejó de decir que la excluiste").toContain("excluidaAca");
    const ui = leer("components/clients/SessionSelectionReview.tsx");
    /* Se mira el CÓDIGO, no los comentarios: la prosa que explica por qué el botón dice
       «Reincluir» contiene la palabra, y un escaneo crudo pasaría en verde con el botón ya
       revertido. Es la misma trampa que ya me comí dos veces esta semana. */
    const codigo = ui
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*"))
      .join("\n");
    expect(codigo, "la fila dejó de mostrar la marca").toContain("c.excluidaAca");
    expect(codigo, "el botón volvió a decir «Agregar» sobre algo que ya estaba").toContain(
      '"Reincluir"',
    );
  });
});
