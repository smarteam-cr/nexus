import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/projects/alta-traida.test.ts — EL ALTA DE UN PROYECTO QUE HUBSPOT YA TENÍA.
 *
 * ── EL INCIDENTE QUE ESCRIBIÓ ESTE ARCHIVO (2026-08-06) ─────────────────────
 * El motor del alta, antes de dar un proyecto por bueno, confirma que el tipo que volvió de
 * HubSpot es el que se eligió. El camino «Traer de HubSpot» nacía SIN escribir el tipo elegido,
 * así que la confirmación comparaba el pipeline real contra `null`:
 *
 *     "826270797" !== null   →   verdadero SIEMPRE   →   el alta espera PARA SIEMPRE
 *
 * Dos proyectos en producción quedaron en cuarentena permanente —no cobran, no suman a la
 * cartera, no les nace el handoff, no se les publica nada— con un botón «Reintentar» que no
 * podía ganar. Nada avisó: los trece invariantes daban verde y el modal decía «ya está en
 * Nexus» sobre fondo verde. Lo destapó una persona mirando el cartel.
 *
 * Cada guarda de acá abajo cuida una pieza distinta de ese incidente, y todas se rompieron a
 * propósito antes de commitear. Son guardas de FUENTE: el camino habla con HubSpot y un doble
 * del portal escrito por uno mismo confirma lo que uno ya cree.
 */

const RAIZ = process.cwd();

/** El fuente sin comentarios: la prosa que explica cada bug nombra el símbolo vigilado. */
function fuente(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");
}

const RUTA = "app/api/clients/traer-de-hubspot/route.ts";
const UNIVERSO = "lib/hubspot/empresas-con-proyecto.ts";
const MOTOR = "lib/projects/alta-runner.ts";
const CARTEL = "components/projects/AltaTrabada.tsx";
const MODAL = "app/(shell)/clients/TraerDeHubspot.tsx";

describe("el proyecto traído nace con su pipeline sellado", () => {
  /**
   * ── LA GUARDA DEL ARREGLO ───────────────────────────────────────────────────
   * Es la que reproduce el incidente entero. Sin `altaPipelineElegido`, la confirmación del
   * motor es insatisfacible y el proyecto queda en cuarentena permanente — sin romper tipos,
   * sin romper la build, sin romper ningún otro test, y con la pantalla mostrando el proyecto
   * como si estuviera bien.
   *
   * La edición que la pone en rojo: sacar `altaPipelineElegido` de cualquiera de los dos
   * `project.create` de la ruta.
   */
  it("LA guarda: los DOS caminos de la ruta escriben altaPipelineElegido", () => {
    const src = fuente(RUTA);
    const creates = src.split("project.create(").slice(1);
    expect(creates.length, "cambiaron los creates de la ruta; revisar esta guarda").toBe(2);
    for (const [i, c] of creates.entries()) {
      const cuerpo = c.slice(0, c.indexOf("select:"));
      expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(150);
      expect(
        cuerpo,
        `el create #${i + 1} dejó de sellar el pipeline: ese proyecto queda en cuarentena para siempre`,
      ).toContain("altaPipelineElegido");
    }
  });

  it("y el pipeline lo deriva el SERVIDOR, no el cuerpo del pedido", () => {
    /* El candado del endpoint es que sus parámetros son índices dentro de una lista que armó el
       servidor. Un pipeline leído del body volvería a abrir esa puerta: cualquiera podría
       declarar que su proyecto es del tipo que no cobra. */
    const src = fuente(RUTA);
    expect(src).toContain("altaPipelineElegido: proyecto.pipelineId");
    expect(src, "el pipeline pasó a leerse del cuerpo del pedido").not.toMatch(/cuerpo\.pipeline/);
  });

  it("y el universo expone el pipelineId que ya leía y tiraba", () => {
    const src = fuente(UNIVERSO);
    expect(src, "ProyectoFaltante dejó de publicar el pipelineId").toMatch(
      /pipelineId: string \| null;/,
    );
    // El armado del DTO: sin esta línea el campo existe en el tipo y llega siempre en undefined.
    const dto = src.slice(src.lastIndexOf("hubspotServiceId: p.id"));
    expect(dto.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(dto, "el DTO volvió a tirar el pipeline").toContain("pipelineId: p.pipelineId");
  });

  it("y las piezas del proyecto salen de SU pipeline, no del default", () => {
    /* Con `null` cae a las piezas de una implementación de CS: un Desarrollo nacía con Kickoff y
       Exploración y SIN «Requerimientos técnicos», que es su pieza central. Los canvases solo se
       crean al nacer — nadie los revisa después. */
    const src = fuente(RUTA);
    const llamadas = [...src.matchAll(/createDefaultCanvases\(([^)]*)\)/g)].map((m) => m[1]);
    expect(llamadas.length, "cambiaron las llamadas; revisar esta guarda").toBe(2);
    for (const args of llamadas) {
      expect(
        args,
        "createDefaultCanvases volvió a recibir null: un Desarrollo nace sin Requerimientos técnicos",
      ).toContain("proyecto.pipelineId");
    }
  });
});

describe("no se ofrece lo que no se puede traer", () => {
  /**
   * Los tres descartes existen porque traer uno de ésos NO produce un proyecto usable: el
   * espejo no escribe nada y el alta queda trabada o —peor— «lista» sobre una fila que HubSpot
   * nunca confirmó, o sea con pipeline vacío = fila por defecto = COBRA.
   */
  it("los tres descartes se aplican en el servidor", () => {
    /* ⚠ Sobre el TRAMO y no sobre el archivo: los tres símbolos también aparecen ARRIBA, en el
       import, así que un `toContain` global pasa en verde con el filtro borrado. Ya pasó tres
       veces en este repo; por eso el ancla es `lastIndexOf` sobre el bucle que arma la lista. */
    const src = fuente(UNIVERSO);
    const i = src.lastIndexOf("const cerrados = new Set");
    expect(i, "se movió el bucle de descartes; revisar esta guarda").toBeGreaterThan(0);
    const bucle = src.slice(i, src.indexOf("const candidatas", i));
    expect(bucle.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    expect(bucle, "volvió a ofrecer proyectos ya finalizados en HubSpot").toContain(
      "decidirCierre({",
    );
    expect(bucle, "volvió a ofrecer proyectos borrados a propósito desde Nexus").toContain(
      "suprimidosDeNexus.has",
    );
    expect(bucle, "volvió a ofrecer proyectos de un pipeline que Nexus no declara").toContain(
      "if (!resolvePipeline(p.pipelineId))",
    );
  });

  it("y NINGUNO se descarta en silencio", () => {
    /**
     * ── LA OTRA GUARDA QUE IMPORTA, Y NO ES DEL BACKEND ────────────────────────
     * Una lista que se acorta sin decirlo se lee como «no hay nada más». El backend puede
     * contar perfecto y no servir de nada: un dato que llega y no se pinta es idéntico a un dato
     * que no llega. El borrado es plausible —alguien saca las líneas «porque ensucian el
     * modal»— y no lo caza `tsc`, ni ESLint, ni ningún test de servidor.
     *
     * La edición que la pone en rojo: borrar del modal el bloque de `universo.cerrados`.
     */
    const modal = fuente(MODAL);
    for (const campo of ["cerrados", "tipoDesconocido", "suprimidos"]) {
      expect(
        modal,
        `el modal dejó de decir cuántos se descartaron por «${campo}»: la lista se acorta en silencio`,
      ).toContain(`universo.${campo} > 0`);
    }
  });
});

describe("el motor no se pisa a sí mismo ni pierde el motivo", () => {
  it("LA guarda: el intento se RECLAMA con una condición, no se estampa", () => {
    /**
     * El cartel se monta dos veces en la misma pantalla —rail y widget—, cada uno con su botón.
     * Dos clics seguidos sobre un alta en `pendiente_crm` entraban los dos por la rama que CREA
     * en HubSpot: dos records gemelos del mismo proyecto, que después hay que unir a mano allá.
     *
     * `updateMany` con condición es atómico; un `update` por id no decide nada.
     * La edición que la pone en rojo: volver a `prisma.project.update({ where: { id } })`.
     */
    const src = fuente(MOTOR);
    const i = src.indexOf("altaIntentos: { increment: 1 }");
    expect(i, "desapareció el contador de intentos; revisar esta guarda").toBeGreaterThan(0);
    const tramo = src.slice(src.lastIndexOf("prisma.project", i), i);
    expect(tramo, "el intento volvió a estamparse sin reclamar la fila").toContain("updateMany");
    const cond = src.slice(i, src.indexOf("reclamo.count === 0"));
    expect(cond.length, "la guarda no está mirando nada").toBeGreaterThan(50);
  });

  it("y una excepción no borra el diagnóstico", () => {
    /* El primer acto del motor es limpiar `altaError`. Si algo revienta por excepción en vez de
       salir por `fallar()`, la fila queda con el alta en curso y sin motivo: el cartel sigue
       pero sin la única línea que sirve para avisarle a alguien. */
    const src = fuente(MOTOR);
    const i = src.indexOf("export async function avanzarAlta");
    const tramo = src.slice(i, src.indexOf("async function correrElAlta"));
    expect(tramo.length, "se movió el envoltorio; revisar esta guarda").toBeGreaterThan(200);
    /* ⚠ `"catch"` a secas NO sirve: el propio cuerpo de recuperación usa `.catch(() => {})` para
       no reventar mientras intenta guardar el motivo, así que la guarda pasaba en verde con el
       try/catch borrado. Se ancla en la forma del bloque. */
    expect(tramo, "el motor volvió a correr sin catch: una excepción deja la fila sin motivo").toContain(
      "} catch (e) {",
    );
    expect(tramo, "el catch no escribe el motivo en la fila").toContain("altaError:");
  });
});

describe("el cartel dice la verdad sobre el reintento", () => {
  it("LA guarda: al fallar también se refresca", () => {
    /**
     * Cuando el reintento vuelve a fallar con el MISMO motivo, el DOM queda byte por byte
     * idéntico: mismo texto, mismo contador de intentos, mismo «hace X». Es exactamente lo que
     * se reportó —«le doy varias veces y no pasa nada»— y llevaba a pensar que el botón estaba
     * roto, cuando sí corría y sí pegaba contra HubSpot.
     *
     * La edición que la pone en rojo: sacar el `router.refresh()` del `finally`.
     */
    const src = fuente(CARTEL);
    const i = src.indexOf("async function reintentar");
    const fin = src.indexOf("} finally {", i);
    expect(fin, "cambió reintentar(); revisar esta guarda").toBeGreaterThan(0);
    const bloque = src.slice(fin, src.indexOf("const boton", fin));
    expect(bloque, "el reintento fallido dejó de refrescar: el cartel no cambia y parece roto").toContain(
      "router.refresh()",
    );
  });

  it("y el botón no se pinta por defecto: sale del permiso", () => {
    /* `= true` hacía que el CSE —el rol que más fichas abre— viera un botón que le devuelve 403,
       y el texto crudo del permiso se pintaba donde va el motivo del alta trabada. */
    const src = fuente(CARTEL);
    expect(src, "volvió el default optimista del botón").not.toContain("puedeReintentar = true");
    expect(src).toContain("me?.permissions.sections.proyectos?.create === true");
  });

  it("y dos carteles en la misma pantalla comparten «está corriendo»", () => {
    /* ⚠ `enVuelo.has(projectId)` a secas NO sirve: también está en el guardia del doble click
       dentro de `reintentar()`, que no sincroniza nada entre instancias. Lo que hace que los DOS
       botones se deshabiliten son estas dos piezas: el estado inicial sale del set compartido, y
       cada instancia se suscribe a los cambios del otro. */
    const src = fuente(CARTEL);
    expect(
      src,
      "el estado de corriendo volvió a ser local: el segundo botón queda clickeable y se crean dos records en HubSpot",
    ).toContain("useState(() => enVuelo.has(projectId))");
    expect(src, "las instancias del cartel dejaron de avisarse entre sí").toContain(
      "suscribir(projectId,",
    );
  });
});

describe("el modal no celebra un alta a medio hacer", () => {
  it("LA guarda: con termino=false el desenlace NO es verde", () => {
    /**
     * El endpoint devuelve 200 aunque el alta quede trabada —`avanzarAlta` no tira, deja el
     * error en la fila—, así que mirar `res.ok` y pintar verde es afirmar que terminó algo que
     * no terminó. Es lo que hizo que dos altas trabadas pasaran días sin diagnosticar: quien las
     * trajo leyó «ya está en Nexus» y se fue.
     *
     * La edición que la pone en rojo: borrar `const aMedias = resultado.termino === false`.
     */
    const src = fuente(MODAL);
    expect(src, "el modal volvió a celebrar mirando solo el status HTTP").toContain(
      "resultado.termino === false",
    );
    const i = src.indexOf("resultado?.tipo === \"listo\"");
    const bloque = src.slice(i, src.indexOf("return (", src.indexOf("rounded-lg border border-line", i)));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(400);
    expect(bloque, "el desenlace a medias perdió su color propio").toContain("aMedias");
  });

  it("y el endpoint sigue devolviendo si terminó", () => {
    const src = fuente(RUTA);
    expect(src, "la ruta dejó de decir si el alta terminó: el modal no puede saberlo").toContain(
      "termino: alta.termino",
    );
  });
});
