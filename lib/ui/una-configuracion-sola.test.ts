/**
 * lib/ui/una-configuracion-sola.test.ts — DOS ENTRADAS CON EL MISMO NOMBRE Y DISTINTO DESTINO.
 *
 * ── DE DÓNDE SALE ────────────────────────────────────────────────────────────────────────────
 * Elías mandó una captura con las dos abiertas a la vez: «Configuración» en el menú lateral y
 * «Configuración» en el menú del avatar. No era un rótulo repetido de más — eran dos pantallas
 * distintas con el mismo nombre, así que la única forma de saber cuál era cuál era entrar a las
 * dos. Y encima el ítem del nav ni siquiera iba a `/settings`: iba a `/integrations`, una pantalla
 * que a su vez se titulaba «Configuración general». Tres rótulos, dos destinos.
 *
 * El reparto quedó así, y es lo que estas guardas congelan:
 *   · el MENÚ LATERAL → «Integraciones» → `/integrations` — lo del SISTEMA, compartido por todos.
 *   · el MENÚ DEL AVATAR → `/settings` — las PREFERENCIAS de quien mira. Hoy, solo el tema.
 *
 * ⚠ Ninguna de estas guardas la cubre otro test: `nav-gates.test.ts` congela las KEYS de los ítems
 * visibles por rol, no sus etiquetas, y el escáner de enlaces muertos (`navegacion-viva.test.ts`)
 * NO ve el nav — busca `href=` con signo igual y `nav-config.tsx` escribe `href:` con dos puntos.
 * O sea que renombrar mal, o mandar el ítem a una ruta que no existe, hoy no lo caza nadie.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_NAV } from "@/components/layout/nav-config";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const existeRuta = (ruta: string) =>
  fs.existsSync(path.join(RAIZ, "app", "(shell)", ruta, "page.tsx"));

/* APP_NAV es la lista PLANA de ítems (el `group` es un campo de cada uno, no un contenedor). */
const items = APP_NAV;
const itemConfig = items.find((i) => i.key === "config");

describe("«Configuración» no puede significar dos cosas", () => {
  it("la guarda está mirando el nav de verdad", () => {
    expect(items.length, "se cayó el nav: la guarda no prueba nada").toBeGreaterThan(8);
    expect(itemConfig, "desapareció el ítem `config` del nav").toBeDefined();
  });

  it("⭐ el ítem del menú lateral se llama «Integraciones», no «Configuración»", () => {
    /* La edición que la pone en rojo: volver el label a «Configuración». Vuelve a haber dos
       entradas con el mismo nombre y distinto destino, y nada más se pone rojo. */
    expect(itemConfig?.label).toBe("Integraciones");
  });

  it("⛔ y ningún OTRO ítem del nav se llama «Configuración»", () => {
    /* El rótulo queda reservado para las preferencias del avatar. Si mañana alguien nombra así a
       otra sección del sistema, vuelve la ambigüedad por otra puerta. */
    const repetidos = items.filter((i) => /^Configuraci[oó]n/i.test(i.label)).map((i) => i.key);
    expect(repetidos, "otro ítem del nav volvió a llamarse «Configuración»").toEqual([]);
  });

  it("⭐ el nav y el título de la pantalla dicen lo mismo", () => {
    /* Divergían: el ítem decía «Configuración» y la pantalla «Configuración general». Un nav que
       promete una cosa y una pantalla que se presenta con otra obliga a leer dos veces para saber
       si llegaste a donde querías. */
    const src = leer("app/(shell)/integrations/page.tsx");
    expect(src).toContain('title="Integraciones"');
    expect(src, "el título volvió a divergir del nav").not.toContain('title="Configuración general"');
  });

  it("⛔ el destino del ítem EXISTE — el escáner de enlaces muertos no mira el nav", () => {
    /* `navegacion-viva.test.ts` busca `href=` con signo igual; `nav-config.tsx` escribe `href:`
       con dos puntos, así que un ítem apuntando a una ruta borrada pasa en verde y se descubre
       clickeando. Acá se comprueba contra el árbol real de `app/(shell)`. */
    const href = itemConfig?.href ?? "";
    expect(href).toBe("/integrations");
    expect(existeRuta(href.replace(/^\//, "")), `el nav apunta a ${href}, que no existe`).toBe(true);
  });
});

describe("lo del SISTEMA vive en Integraciones; lo de la PERSONA, en Preferencias", () => {
  it("⭐ las dos pantallas migradas están bajo /integrations", () => {
    expect(existeRuta("integrations/odoo"), "se movió o se borró /integrations/odoo").toBe(true);
    expect(existeRuta("integrations/gasto-ia"), "se movió o se borró /integrations/gasto-ia").toBe(true);
  });

  it("⛔ y ya no quedan bajo /settings", () => {
    expect(existeRuta("settings/odoo")).toBe(false);
    expect(existeRuta("settings/gasto-ia")).toBe(false);
  });

  it("⭐ las dos conservan su candado de plata al mudarse", () => {
    /* LA guarda de la migración. `/integrations` la ve cualquier consultor interno; estas dos
       cortan por `isCostosRole` (SOLO SUPER_ADMIN) con el redirect ANTES de la query. Mudarlas
       «pegando el JSX» habría dejado el gasto de IA y el estado del ERP a la vista de todo el
       equipo, sin un solo error y con la pantalla viéndose perfecta. */
    /* ⚠ ESTA ASSERT SE REESCRIBIÓ PORQUE LA PRIMERA ERA DECORATIVA. Decía
       `expect(src).toContain("isCostosRole")`, y al romperla a propósito NO se puso roja: la
       palabra sigue estando en la LÍNEA DEL IMPORT aunque el `if` haya desaparecido. O sea que
       protegía la existencia de un import, no la de un candado. Ahora se afirma la forma exacta
       del corte Y su POSICIÓN: antes de la primera consulta, que es la promesa que hace el
       docblock de las dos pantallas («el redirect corta ANTES de la query»). Si la lectura
       ocurriera primero, el dato ya salió de la base aunque después se redirija. */
    for (const ruta of ["integrations/odoo", "integrations/gasto-ia"]) {
      const src = leer(`app/(shell)/${ruta}/page.tsx`);
      const corte = src.search(/if\s*\([^)]*isCostosRole\([^)]*\)\)\s*redirect\(/);
      expect(corte, `${ruta} perdió el gate de costos al mudarse`).toBeGreaterThan(0);
      const primeraQuery = src.indexOf("prisma.");
      expect(primeraQuery, `${ruta} dejó de leer la base: revisar si esta guarda sigue teniendo sentido`).toBeGreaterThan(0);
      expect(corte, `${ruta}: la consulta corre ANTES del candado — el dato ya salió`).toBeLessThan(
        primeraQuery,
      );
    }
  });

  it("⭐ /settings se quedó SOLO con la apariencia", () => {
    /* El pedido, textual: «En la configuración del usuario solo debe quedar lo de la apariencia».
       La edición que la pone en rojo: volver a colgar de acá un enlace a algo del sistema. */
    const src = leer("app/(shell)/settings/page.tsx");
    expect(src).toContain("ThemeToggle");
    expect(src, "volvió a colgar de las preferencias algo que es del sistema").not.toMatch(
      /href="\/(integrations|cobranza|team|agents)/,
    );
  });

  it("⛔ y no se llevó el botón de cerrar sesión, que estaba ROTO", () => {
    /* Posteaba a `/api/auth/logout`, una ruta que no existe en el repo: el botón estaba muerto y
       nadie lo había notado. El que funciona es el del menú del avatar. Migrarlo habría sido mudar
       el bug de lugar; comprobarlo acá evita que alguien lo «restaure» de buena fe. */
    expect(
      fs.existsSync(path.join(RAIZ, "app/api/auth/logout/route.ts")),
      "apareció la ruta: entonces el botón viejo ya no estaba roto y este razonamiento caducó",
    ).toBe(false);
    /* El que SÍ existe, y es el que usa el menú del avatar. */
    expect(fs.existsSync(path.join(RAIZ, "app/auth/signout/route.ts"))).toBe(true);
    const src = leer("app/(shell)/settings/page.tsx");
    /* ⚠ Se busca el ACTION, no la mención: el docblock de esa pantalla explica por qué el botón no
       se migró, y nombra la ruta. Un `toContain` a secas se cazaba a sí mismo. */
    expect(src, "volvió el logout que postea a una ruta inexistente").not.toContain(
      'action="/api/auth/logout"',
    );
  });

  it("⛔ Odoo tiene una entrada PROPIA desde Integraciones", () => {
    /* Al mudarse se quedó sin ninguna: sus dos únicos enlaces venían de la mesa de Cobranza. Una
       pantalla a la que solo se llega desde otra es una que media empresa no sabe que existe —
       exactamente lo que le pasaba al gasto de IA antes de que Claude tuviera su tarjeta. */
    const src = leer("app/(shell)/integrations/page.tsx");
    expect(src).toContain("<OdooCard");
    expect(leer("app/(shell)/integrations/OdooCard.tsx")).toContain('href="/integrations/odoo"');
  });

  it("⛔ y su tarjeta no filtra el estado a quien no puede verlo", () => {
    /* Mismo criterio que el gasto de Claude: el dato viaja AUSENTE del payload (`estado: null`),
       no escondido con CSS. */
    const src = leer("app/(shell)/integrations/page.tsx");
    expect(src).toMatch(/estadoDeOdoo[^\n]*=\s*puedeVerGasto/);
  });
});

describe("⛔ la pantalla pide la MISMA llave que su ítem del menú", () => {
  /**
   * ── EL FALLO QUE LO TRAE ─────────────────────────────────────────────────────────────────────
   * El ítem del nav exigía `configuracion.read`; la página, solo la sesión de consultor. O sea que
   * el menú se la escondía a cuatro roles y la dirección se la daba igual. Los escritos nunca
   * estuvieron abiertos —los logos y la importación de HubSpot exigen `configuracion.manage`—, así
   * que lo de más era la vista.
   *
   * ⭐ Y lo que lo convierte en un arreglo: `HubspotSystemCard` YA estaba escrita afirmando que «la
   * página entra con `configuracion.read`». Era falso. Una premisa equivocada escrita en el código
   * es peor que una puerta abierta: la puerta se ve, la premisa se hereda.
   *
   * ── POR QUÉ ESTA GUARDA SE DERIVA Y NO SE TRANSCRIBE ─────────────────────────────────────────
   * Congelar el literal `"configuracion", "read"` protegería el valor de HOY. Lo que hace falta
   * proteger es la RELACIÓN: el día que alguien cambie el gate del ítem, esta assert tiene que
   * decirle que la página lo siga. Por eso la sección y la acción salen del propio `nav-config`.
   */
  const src = () => leer("app/(shell)/integrations/page.tsx");

  it("la guarda está mirando un gate de permiso de verdad", () => {
    expect(itemConfig?.gate?.kind, "el ítem dejó de gatear por permiso: revisar esta guarda").toBe(
      "permission",
    );
  });

  it("⭐ la página exige la sección y la acción que declara el nav", () => {
    const gate = itemConfig?.gate as { section: string; action: string };
    expect(
      src(),
      `el nav pide ${gate.section}.${gate.action} y la página no: quien sepa la dirección entra igual`,
    ).toContain(`can(ctx.teamMember, "${gate.section}", "${gate.action}")`);
  });

  it("⛔ y corta ANTES de leer la base", () => {
    /* Mismo criterio que las dos pantallas de plata: si la consulta corre primero, el dato ya
       salió de la base aunque después se redirija. Se busca el literal del corte, no una regex:
       la forma exacta está escrita una sola vez y es la que hay que proteger. */
    /* ⚠ Se mide DENTRO del cuerpo de la página, no sobre el archivo: arriba hay funciones
       auxiliares que consultan la base y que solo se DECLARAN ahí — medir el archivo entero
       ponía la guarda en rojo por un motivo falso. */
    const cuerpo = src().slice(src().indexOf("export default async function"));
    expect(cuerpo.length, "se movió el componente: la guarda no mira nada").toBeGreaterThan(500);
    const corte = cuerpo.indexOf("if (!ctx || !(await can(ctx.teamMember");
    expect(corte, "no hay corte por permiso en esta página").toBeGreaterThan(0);
    expect(corte, "la consulta corre ANTES del candado — el dato ya salió").toBeLessThan(
      cuerpo.indexOf("prisma."),
    );
  });

  it("⛔ y el comentario de HubspotSystemCard dejó de mentir", () => {
    /* Estaba escrito como si el gate existiera. Ahora existe — y si alguien lo saca, esta assert
       cae junto con las de arriba, que es lo que evita que la premisa vuelva a quedar suelta. */
    expect(leer("app/(shell)/integrations/HubspotSystemCard.tsx")).toContain(
      "la página entra con `configuracion.read`",
    );
  });
});

