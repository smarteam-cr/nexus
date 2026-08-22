/**
 * lib/clients/cse-encargado.test.ts — REASIGNAR EL CSE DE UNA CUENTA NO PUEDE TOCAR LOS HIJOS.
 *
 * Correr: `npx vitest run lib/clients/cse-encargado.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * El select de la columna "CSE encargado" de `/clients` escribe `csl_encargado` en TODOS los
 * proyectos del cliente que están en el pipeline de Implementación de HubSpot — porque el
 * encargado es de la CUENTA, no de un proyecto (Elías, 2026-08-21).
 *
 * Tres formas de que eso salga mal, las tres silenciosas:
 *   1. Que toque también los "development"/"sitios-web" → le saca a un desarrollador el acceso
 *      a SU pipeline técnico, y de paso rompe la regla que se acaba de arreglar en `access.ts`.
 *   2. Que intente escribir un proyecto sin `hubspotServiceId` (el contenedor "Información del
 *      cliente", o un alta a medio hacer) → PATCH contra un id vacío.
 *   3. Que el permiso caiga en el rol equivocado → un CSE podría quitarse una cuenta de encima,
 *      y como `csl_encargado` gobierna la visibilidad, quitarse el acceso solo.
 *
 * Son guardas de FUENTE porque el endpoint es 100% Prisma + HubSpot: no hay lógica pura que
 * extraer sin una base de test. El fragmento que usa (`PROYECTO_DE_PIPELINE_CS_WHERE`) ya está
 * probado aparte, SQL vs memoria, en `lib/projects/scope.test.ts`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { coincideBusqueda } from "@/lib/ui/text-search";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";

function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

const RUTA = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "app/api/clients/[id]/cse-encargado/route.ts"), "utf8"),
);
const SELECT = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "components/clients/CseEncargadoSelect.tsx"), "utf8"),
);
const INDICE = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "app/(shell)/clients/ClientsGrid.tsx"), "utf8"),
);
const TABLA = soloCodigo(fs.readFileSync(path.join(RAIZ, "components/ui/Table.tsx"), "utf8"));
/**
 * ⚠ LA MECÁNICA SE MUDÓ A UNA PRIMITIVA (2026-08-21). Elías: *«estandariza este componente
 * porque me interesa que en el futuro los listing otros puedan ser selects igual»*. Todo lo que
 * no es de ESTE dominio —la flechita, el buscador, el clic que no navega, el modo solo-lectura—
 * vive ahora en `components/ui/CeldaSelect.tsx`, y `CseEncargadoSelect` quedó como envoltura.
 *
 * Por eso estas guardas escanean la PRIMITIVA: si siguieran mirando la envoltura, se pondrían
 * verdes por vacío —el código que revisaban ya no está ahí— que es la peor forma de aprobar.
 */
const CELDA = soloCodigo(fs.readFileSync(path.join(RAIZ, "components/ui/CeldaSelect.tsx"), "utf8"));
const PANEL = soloCodigo(
  fs.readFileSync(path.join(RAIZ, "components/ui/usePanelFlotante.ts"), "utf8"),
);

describe("⭐ el endpoint que reasigna el CSE de una cuenta", () => {
  it("⛔ solo escribe proyectos del pipeline de CS — nunca los hijos de Desarrollo", () => {
    /* La edición que la pone en rojo: sacar el spread de `PROYECTO_DE_PIPELINE_CS_WHERE` del
       `findMany`. Sin él, reasignar una cuenta le pisa el encargado al desarrollador del
       proyecto hijo — y le saca el acceso a su propio pipeline. */
    const i = RUTA.indexOf("prisma.project.findMany");
    expect(i, "desapareció la consulta de los proyectos a reasignar").toBeGreaterThan(-1);
    const bloque = RUTA.slice(i, RUTA.indexOf("});", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(60);
    expect(
      bloque.includes("...PROYECTO_DE_PIPELINE_CS_WHERE"),
      "el endpoint dejó de acotar por pipeline: reasignar la cuenta pisa a los desarrolladores " +
        "de los proyectos hijos",
    ).toBe(true);
  });

  it("⛔ y excluye los que no tienen record en HubSpot, aparte del pipeline", () => {
    /* `PROYECTO_DE_PIPELINE_CS_WHERE` mira SOLO el pipeline — deja pasar el contenedor
       "Información del cliente" y las altas a medio hacer, que no tienen `hubspotServiceId`.
       Sin este filtro extra, el loop haría un PATCH contra `/objects/projects/` sin id. */
    const i = RUTA.indexOf("prisma.project.findMany");
    const bloque = RUTA.slice(i, RUTA.indexOf("});", i));
    expect(
      bloque.includes("hubspotServiceId: { not: null }"),
      "volvió a poder intentar un PATCH contra un proyecto sin record en HubSpot",
    ).toBe(true);
  });

  it("⛔ exige el permiso de liderazgo, no solo acceso al cliente", () => {
    expect(RUTA).toContain('guardPermission("proyectos", "reasignarEncargado")');
    expect(
      RUTA,
      "el endpoint dejó de verificar el acceso al cliente: se podría reasignar una cuenta ajena",
    ).toContain("guardAccessToClient(clientId)");
  });

  it("⚠ y solo acepta a alguien del equipo ACTIVO", () => {
    /* Sin esto se podría escribir en HubSpot el owner de alguien que se fue —o un email
       cualquiera— y el error aparecería recién al sincronizar. */
    expect(RUTA).toContain("prisma.teamMember.findUnique");
    expect(RUTA).toContain("deactivatedAt");
  });

  it("⭐ un fallo a mitad de camino DICE cuántos entraron", () => {
    /* Son N PATCH independientes contra HubSpot y no hay rollback en ninguna parte de esta
       base: si el tercero de cinco falla, los dos primeros YA quedaron escritos. Un "falló" a
       secas mandaría a reintentar creyendo que no se escribió nada.
       La edición que la pone en rojo: reemplazar el mensaje por uno genérico. */
    /* ⚠ NO alcanza con buscar "escritos.length" en el archivo: aparece 3 veces (el push, el
       contador del body, el mensaje) — cambiar SOLO la frase del error dejaba la guarda en
       verde. Se afirma sobre el texto que de verdad lee la persona. */
    const i = RUTA.indexOf("} catch (e) {");
    expect(i, "desapareció el catch del loop de PATCH").toBeGreaterThan(-1);
    const bloqueError = RUTA.slice(i, RUTA.indexOf("status: 502", i));
    expect(bloqueError.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloqueError.includes("${escritos.length} de ${proyectos.length}"),
      "el error dejó de decir cuántos proyectos alcanzaron a reasignarse antes de fallar: " +
        "manda a reintentar creyendo que no se escribió nada",
    ).toBe(true);
    expect(
      bloqueError.includes("YA quedaron"),
      "el error dejó de aclarar que lo ya escrito NO se revierte (no hay rollback en HubSpot)",
    ).toBe(true);
  });

  it("⚠ un solo sync por cliente, no uno por proyecto", () => {
    /* El espejo trae TODOS los proyectos de la empresa en la misma corrida: llamarlo dentro del
       loop pagaría lo mismo N veces. */
    const despuesDelLoop = RUTA.slice(RUTA.indexOf("const escritos"));
    expect((despuesDelLoop.match(/syncProjectsForClient/g) ?? []).length).toBe(1);
  });
});

describe("⭐ la celda de permiso vive del lado del liderazgo", () => {
  it("está declarada en el registro", () => {
    const proyectos = PERMISSION_SECTIONS.find((s) => s.key === "proyectos");
    expect(proyectos, "desapareció la sección `proyectos`").toBeDefined();
    expect(
      proyectos!.actions.map((a) => a.key),
      "desapareció la celda `reasignarEncargado`: el endpoint gatearía contra algo que no existe",
    ).toContain("reasignarEncargado");
  });

  it("⛔ el CSE NO la tiene por default — y ese es todo el punto", () => {
    /* Decisión de Elías (2026-08-21): mover cartera es de liderazgo. Y como `csl_encargado`
       decide QUIÉN VE el cliente (`lib/auth/access.ts`), un CSE que pudiera reasignar podría
       quitarse —o quitarle a otro— el acceso a una cuenta entera sin que nadie lo apruebe.
       La edición que la pone en rojo: agregar "reasignarEncargado" al bloque `proyectos` de CSE. */
    /* ⚠ `grant()` devuelve un MAPA sección→acción→bool, no un array de acciones: buscar con
       `.toContain()` daba `[]` y pasaba en verde con el permiso mal puesto. Se cazó rompiéndola. */
    expect(
      DEFAULT_MATRIX.CSE.sections.proyectos.reasignarEncargado,
      "el CSE puede reasignar cartera: puede quitarse a sí mismo el acceso a un cliente",
    ).toBe(false);
  });

  it("⭐ pero el liderazgo de CS sí, o la funcionalidad no existe para nadie salvo el admin", () => {
    expect(
      DEFAULT_MATRIX.CSL.sections.proyectos.reasignarEncargado,
      "el liderazgo de CS perdió el permiso: la columna queda de solo lectura para todos salvo el admin",
    ).toBe(true);
  });
});

describe("⭐ el select de la columna", () => {
  it("⛔ no pinta desplegable sin permiso — ni uno deshabilitado", () => {
    /* Un desplegable que se abre para descubrir que no se puede es peor que texto plano.
       La edición que la pone en rojo: sacar la rama de `!puedeEditar` de la primitiva. */
    expect(CELDA).toContain("if (!puedeEditar || opciones.length === 0)");
  });

  it("⭐ tiene flechita — es lo único que delata que la celda se puede tocar", () => {
    /* Pedido de Elías. Sin un indicador, una celda editable se ve idéntica a una de solo
       lectura y nadie descubre que se puede cambiar.
       La edición que la pone en rojo: borrar el `<svg>` del trigger. */
    const i = CELDA.indexOf("aria-expanded={abierto}");
    expect(i, "desapareció el trigger del desplegable").toBeGreaterThan(-1);
    const trigger = CELDA.slice(i, CELDA.indexOf("</button>", i));
    expect(trigger.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(trigger.includes("<svg"), "la celda perdió la flechita").toBe(true);
    expect(
      trigger.includes("rotate-180"),
      "la flechita dejó de girar al abrir: no dice si el panel está abierto o cerrado",
    ).toBe(true);
  });

  it("⭐ el buscador encuentra «Elías» escribiendo «Elias», y al revés", () => {
    /* Pedido de Elías (2026-08-21). No es un borde: media plantilla tiene tilde en el nombre y
       nadie la escribe al buscar. Un buscador que exige la tilde exacta no encuentra a nadie.
     *
     * ⚠ Se prueba la FUNCIÓN que el componente usa, no el texto del componente: el
     * comportamiento vive en `coincideBusqueda` (`lib/ui/text-search`), que ya es «el filtrado
     * por texto de las listas, en un solo lugar». La otra mitad —que CeldaSelect la use de
     * verdad y no un `toLowerCase()` propio, como estaba— es el `expect` de abajo. */
    for (const [texto, consulta] of [
      ["Elías González", "Elias"],
      ["Elias Gonzalez", "Elías"],
      ["Heiver Gómez", "gomez"],
      ["Jerson Escudero", "ESCUDERO"],
    ] as const) {
      expect(coincideBusqueda(texto, consulta), `«${consulta}» no encontró «${texto}»`).toBe(true);
    }
    /* Y sigue discriminando: sin tildes no significa "matchea cualquier cosa". */
    expect(coincideBusqueda("Elías González", "Lorena")).toBe(false);

    /* La edición que la pone en rojo: volver al `o.label.toLowerCase().includes(q)` propio. */
    expect(
      CELDA.includes("coincideBusqueda(o.label, q)"),
      "CeldaSelect volvió a comparar con su propio toLowerCase(): buscar «Elias» deja de " +
        "encontrar a «Elías»",
    ).toBe(true);
    expect(
      CELDA.includes('coincideBusqueda(o.hint ?? "", q)'),
      "el filtro dejó de mirar el `hint` sin tildes",
    ).toBe(true);
  });

  it("⭐ y buscador cuando hay muchas opciones", () => {
    /* Pedido de Elías. Un equipo de 20 personas no entra de un vistazo — y el repo ya tiene
       anotada la deuda del selector de 169 clientes SIN buscador.
       La edición que la pone en rojo: borrar el `<input>` del panel. */
    expect(CELDA).toContain("minimoParaBuscar");
    /* ⚠ Lo del `hint` lo cubre el test de tildes, de arriba: ahí se afirma sobre la llamada
       real (`coincideBusqueda(o.hint ?? "", q)`). Repetirlo acá con la implementación vieja
       dejaría una guarda que se pone roja por un refactor correcto. */
    expect(
      CELDA.includes("Nadie coincide con"),
      "una búsqueda sin resultados quedó como lista vacía: se lee como «no hay opciones», " +
        "que es otra cosa",
    ).toBe(true);
  });

  it("⛔ el clic no navega a la ficha del cliente", () => {
    /* La fila entera es un link: sin `stopPropagation`, elegir un encargado te saca de la
       lista en el mismo clic y no llegás a ver si funcionó.
       ⚠ Hay DOS `stopPropagation` en el archivo (el del botón y el del panel abierto):
       buscarlo suelto pasaba en verde con el del botón borrado. Se afirma sobre el handler
       exacto del botón. */
    const i = CELDA.indexOf("onClick={(e) => {");
    expect(i, "desapareció el onClick del botón que abre el desplegable").toBeGreaterThan(-1);
    const handler = CELDA.slice(i, CELDA.indexOf("}}", i));
    expect(handler.length, "la guarda no está mirando nada").toBeGreaterThan(20);
    expect(
      handler.includes("e.stopPropagation()"),
      "el clic del desplegable volvió a burbujear: elegir un valor te saca de la lista a la ficha",
    ).toBe(true);
  });

  it("⭐ la primitiva y `Menu` comparten la mecánica del panel — no hay dos copias", () => {
    /* ⛔ EL MODO DE FALLA QUE ESTA GUARDA EXISTE PARA IMPEDIR.
       `Menu.tsx` decía ser «la ÚNICA implementación de esa mecánica de ahora en más», y traía
       detalles caros: position:fixed desde el trigger (para escapar de `overflow-hidden`), el
       scroll externo que cierra pero el interno no, Escape que devuelve el foco. Al aparecer el
       segundo desplegable, copiarlos habría creado la divergencia que ese encabezado juraba
       evitar — y la copia se olvida justo del detalle que la original aprendió a los golpes.
       La edición que la pone en rojo: volver a implementar los listeners en cualquiera de los dos. */
    const menu = soloCodigo(fs.readFileSync(path.join(RAIZ, "components/ui/Menu.tsx"), "utf8"));
    for (const [nombre, src] of [
      ["Menu", menu],
      ["CeldaSelect", CELDA],
    ] as const) {
      expect(
        src.includes("usePanelFlotante"),
        `${nombre} dejó de usar el hook compartido: hay dos implementaciones de la misma mecánica`,
      ).toBe(true);
      expect(
        src.includes('addEventListener("mousedown"'),
        `${nombre} volvió a implementar el cierre por clic afuera por su cuenta`,
      ).toBe(false);
    }
  });

  it("⚠ y el buscador no pierde Home/End contra el panel", () => {
    /* Dentro de un campo de texto, Home/End significan «principio/fin de la línea». Si el panel
       se los queda para navegar opciones, se escribe mal un nombre y no se puede volver al
       principio a corregirlo. Las flechas SÍ se interceptan: en un panel abierto «bajar» es
       recorrer las opciones. */
    expect(PANEL).toContain("HTMLInputElement");
    const i = PANEL.indexOf("const enTexto");
    expect(i, "desapareció la excepción de Home/End en campos de texto").toBeGreaterThan(-1);
  });

  it("⭐ el encabezado explica lo que pasa al cambiar el valor", () => {
    /* Pedido de Elías (2026-08-21): "¿Puedo agregar una (i) explicando lo que pasa al cambiar
       el CSE encargado?" — una celda editable que escribe en HubSpot no lo dice por su nombre.
       Se afirma sobre el bloque de LA COLUMNA "cse", no sobre el archivo entero: el índice tiene
       otras columnas y otro `headerHint` legítimo dejaría pasar un texto vacío o borrado acá. */
    const i = INDICE.indexOf('key: "cse",');
    expect(i, "desapareció la columna «CSE encargado» del índice de clientes").toBeGreaterThan(-1);
    const columna = INDICE.slice(i, INDICE.indexOf('key: "salesMeeting"', i));
    expect(columna.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    expect(columna, "la columna se quedó sin la (i) explicativa").toContain("headerHint:");
    expect(
      columna.includes("HubSpot") && columna.includes("Desarrollo"),
      "el texto de la (i) dejó de nombrar HubSpot o de aclarar que Desarrollo/Sitios web no se " +
        "tocan — es justo la parte que evita que alguien la lea como \"cambia TODO lo del cliente\"",
    ).toBe(true);
  });

  it("⭐ y `Table` de verdad la pinta — no es un campo que nadie lee", () => {
    /* Un `headerHint` en el tipo de columna sin nada que lo renderice es letra muerta: el CSE
       seguiría viendo un encabezado sin ninguna pista.
       La edición que la pone en rojo: borrar el uso de `col.headerHint` en `Table.tsx`. */
    expect(
      (TABLA.match(/col\.headerHint/g) ?? []).length,
      "col.headerHint dejó de usarse en alguna de las dos formas de encabezado (con/sin orden)",
    ).toBeGreaterThanOrEqual(2);
    expect(TABLA).toContain("title={text}");
  });

  it("⚠ NO es optimista: repinta con lo que volvió del servidor", () => {
    /* La escritura va a HubSpot y vuelve por el espejo — puede tardar y puede quedar a medias.
       Pintar el nombre nuevo antes de tiempo mostraría como hecho algo que quizá no lo está,
       justo en la columna que se mira para saber de quién es la cuenta. */
    expect(SELECT).toContain("router.refresh()");
    expect(
      SELECT.includes("setNombreOptimista") || SELECT.includes("optimistic"),
      "el select empezó a pintar el valor antes de que el servidor lo confirme",
    ).toBe(false);
  });
});
