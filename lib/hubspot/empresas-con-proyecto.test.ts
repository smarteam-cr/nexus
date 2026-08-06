import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/hubspot/empresas-con-proyecto.test.ts — EL BOTÓN QUE TRAE EMPRESAS NO PUEDE DUPLICAR.
 *
 * ── LO QUE ESTÁ EN JUEGO ────────────────────────────────────────────────────
 * Este camino CREA `Client`. Cada una de estas guardas cuida una forma distinta de terminar con
 * dos fichas de la misma empresa — y una empresa partida en dos parte la plata (cuenta y cobros
 * en una) del trabajo (proyecto en la otra). Ya pasó el 2026-07-10: 111 clientes creados de una,
 * 4 duplicados. El post-mortem es `scripts/cleanup-partner-created-clients.ts`.
 *
 * Son guardas de FUENTE porque el módulo habla con HubSpot: un test de comportamiento exigiría
 * o red o un doble del portal entero, y un doble que uno escribe es un doble que confirma lo que
 * uno cree. Lo que estas guardas fijan es lo que no se puede tener a la vez que el bug.
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

const MODULO = "lib/hubspot/empresas-con-proyecto.ts";
const RUTA = "app/api/clients/traer-de-hubspot/route.ts";

describe("no se ofrece lo que Nexus ya tiene", () => {
  /**
   * ── LA GUARDA DEL TRAMO ────────────────────────────────────────────────────
   * El criterio ingenuo —«la empresa tiene un proyecto»— ofrecía 4 empresas al medir. El
   * afinado —«tiene un proyecto que Nexus NO tiene»— ofrece 2: las otras 2 ya tenían su
   * proyecto traído bajo otra ficha. Quitar ese cruce hace que el botón ofrezca traer empresas
   * cuyo trabajo ya está acá, y crear el duplicado se siente como usar el producto.
   *
   * La edición que la pone en rojo: borrar `if (idsDeNexus.has(p.id)) continue;`.
   */
  it("LA guarda: un proyecto que Nexus ya tiene no hace candidata a su empresa", () => {
    const src = fuente(MODULO);
    expect(src, "el módulo dejó de mirar qué proyectos ya están en Nexus").toContain("idsDeNexus");
    expect(
      src,
      "se dejó de descartar el proyecto que Nexus ya tiene: vuelve a ofrecer empresas completas",
    ).toContain("if (idsDeNexus.has(p.id)) continue;");
  });

  it("y una empresa que Nexus guardó con un id FUSIONADO tampoco se ofrece", () => {
    /* HubSpot fusiona empresas y el id viejo sigue respondiendo. Si Nexus guardó el viejo y el
       portal ahora devuelve el nuevo, el cruce por id no matchea y la empresa se ve nueva.
       `hs_merged_object_ids` viaja gratis en la llamada que igual se paga. */
    const src = fuente(MODULO);
    /* ⚠ Se afirma sobre el ARRAY DE `properties` del pedido, no sobre el archivo: el símbolo
       también aparece al LEER la respuesta (`r.properties.hs_merged_object_ids`), así que un
       escaneo global pasa en verde con la propiedad ya sacada del request — y entonces la
       lectura devuelve `undefined`, `absorbidos` queda vacío y la empresa fusionada se ofrece
       igual. Verificado: la primera versión de esta guarda pasaba con el bug puesto. */
    const linea = src.split("\n").find((l) => l.includes('properties: ["name"'));
    expect(linea, "se movió el batch/read de empresas; revisar esta guarda").toBeTruthy();
    expect(linea, "dejó de PEDIRSE la lápida de fusión: la empresa fusionada se va a ofrecer").toContain(
      "hs_merged_object_ids",
    );
    expect(src, "la lápida se pide pero no se usa para descartar").toContain(
      "ficha.absorbidos.some",
    );
  });

  it("y un lote de asociaciones que HubSpot no contestó NO degrada a «sin empresa»", () => {
    /* Es la que más daño hace y la más fácil de escribir mal. Con un 429 transitorio, degradar
       a un array vacío convertiría a TODAS las empresas del lote en candidatas de golpe: el
       botón ofrecería traer decenas de fichas que ya existen. */
    const src = fuente(MODULO);
    expect(src, "desapareció el marcado de lotes ilegibles").toContain("ilegibles");
    expect(
      src,
      "un lote que no contestó dejó de marcarse ilegible: sus proyectos se van a ver como sin empresa",
    ).toContain("if (!ok) for (const p of lote) ilegibles.add(p.id);");
  });
});

describe("la lista dice la verdad sobre sí misma", () => {
  it("HubSpot caído devuelve null, no una lista vacía", () => {
    /* «No pude preguntar» y «no hay nada nuevo» son cosas distintas, y con la segunda el botón
       desaparecería cada vez que la API tose. */
    const src = fuente(MODULO);
    expect(src).toContain("Promise<UniversoTraible | null>");
    expect(src, "un fallo de HubSpot dejó de distinguirse de «no hay nada»").toMatch(
      /if \(res\.status !== 200\) return null;/,
    );
  });

  it("el rótulo cae a dominio cuando la ficha no tiene nombre", () => {
    /* 1 de cada 4 candidatas medidas NO tiene `name` en HubSpot. Una fila en blanco no se puede
       elegir, y «(sin nombre)» tampoco: el dominio SÍ identifica a la empresa. */
    expect(fuente(MODULO)).toContain("ficha.name ?? ficha.domain ??");
  });

  it("y el orden no baila entre llamadas", () => {
    expect(fuente(MODULO)).toContain('a.rotulo.localeCompare(b.rotulo, "es")');
  });
});

describe("el permiso es la forma del endpoint", () => {
  /**
   * ── LA GUARDA MÁS IMPORTANTE DE LAS DOS TANDAS ─────────────────────────────
   * Este endpoint lo puede apretar CUALQUIER miembro del equipo — decisión del usuario. Lo que
   * lo hace seguro no es un permiso: es que el `companyId` no es una entrada libre. El POST
   * re-deriva el universo en el servidor y rechaza cualquier id que no esté en esa lista.
   *
   * Si alguien "simplifica" eso y confía en el body, el endpoint se vuelve apuntable: cualquiera
   * podría fabricar un `Client` de cualquier empresa del portal. Y no rompe nada visible — la
   * pantalla sigue funcionando igual, porque manda ids que SÍ están en la lista.
   *
   * La edición que la pone en rojo: borrar la llamada a `listarEmpresasTraibles()` del POST y
   * usar el `companyId` del cuerpo directamente.
   */
  it("LA guarda: el POST re-deriva el universo y rechaza lo que no está en él", () => {
    const src = fuente(RUTA);
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post.length, "se movió el POST; revisar esta guarda").toBeGreaterThan(400);
    expect(
      post,
      "el POST dejó de re-derivar el universo: el companyId pasó a ser entrada libre y el endpoint es apuntable",
    ).toContain("listarEmpresasTraibles()");
    expect(
      post,
      "el POST ya no rechaza un companyId que no está en la lista del servidor",
    ).toContain("universo.traibles.find");
  });

  it("y las gemelas las decide el SERVIDOR, no el navegador", () => {
    /* Leerlas del body sería dejar que decida si hay que avisar justo quien quiere que no
       haya aviso. */
    const post = fuente(RUTA).slice(fuente(RUTA).indexOf("export async function POST"));
    expect(post).toContain("empresa.gemelas.length > 0 && !cuerpo.confirmoGemela");
    expect(post, "las gemelas se leen del cuerpo del pedido").not.toMatch(/cuerpo\.gemelas/);
  });

  it("el cliente y el proyecto nacen en la MISMA transacción", () => {
    /* Un Client sin proyectos es invisible en el índice, en cobranza y en la cartera — pero
       está vivo en el clasificador de sesiones como señal fuerte por `hubspotCompanyId`, y se
       lleva en silencio las sesiones del cliente de verdad. */
    const post = fuente(RUTA).slice(fuente(RUTA).indexOf("export async function POST"));
    const i = post.indexOf("prisma.$transaction");
    expect(i, "el alta dejó de ser transaccional").toBeGreaterThan(0);
    const tx = post.slice(i, post.indexOf("});", post.indexOf("return { clientId")));
    expect(tx, "el cliente se crea fuera de la transacción").toContain("tx.client.create");
    expect(tx, "el proyecto se crea fuera de la transacción").toContain("tx.project.create");
  });

  it("y dos clics simultáneos dan UN cliente", () => {
    /* El par `source`+`sourceExternalId` es único: el segundo POST choca con un P2002 y se
       adopta el que ganó, en vez de crear el gemelo o mostrar un error crudo. */
    const src = fuente(RUTA);
    expect(src).toContain("sourceExternalId: empresa.companyId");
    expect(src, "el P2002 dejó de adoptarse: dos clics crean dos clientes o un error crudo").toContain(
      "yaEstaba: true",
    );
  });

  it("y hay tope diario, contado en la base y por PROYECTO", () => {
    /* En memoria no sobrevive a un reinicio del proceso. Y se cuenta por proyecto, no por
       cliente: la rama de adopción crea un proyecto SIN crear ficha, así que un contador de
       clientes la deja pasar sin límite justo por el camino que más se usa. */
    const src = fuente(RUTA);
    expect(src).toContain("TOPE_DIARIO");
    expect(src, "el tope dejó de contarse contra la base").toContain("prisma.project.count");
    // Y arriba de la rama de adopción, o el camino que más se usa no lo ve nunca.
    const iTope = src.indexOf("TOPE_DIARIO)");
    const iAdopcion = src.indexOf("cuerpo.adoptarEnClientId");
    expect(iTope, "desapareció el chequeo del tope").toBeGreaterThan(0);
    expect(iAdopcion, "desapareció la rama de adopción").toBeGreaterThan(0);
    expect(iTope, "el tope volvió a quedar DEBAJO de la adopción, que retorna antes").toBeLessThan(
      iAdopcion,
    );
  });
});

describe("«Es la misma» resuelve, no navega", () => {
  /**
   * ── LA GUARDA DE ESTE ARREGLO ──────────────────────────────────────────────
   * La primera versión de ese botón hacía `router.push` a la ficha existente. Se probó en vivo
   * y el reporte fue exacto: «le doy varias veces a "es la misma", y refresco, pero sigue
   * apareciendo ese msj». Claro: navegar no cambia el mundo, y la condición que produce la
   * fila —HubSpot tiene un proyecto que Nexus no tiene— seguía siendo cierta. Un botón que no
   * vacía el pendiente le enseña a la gente que la lista no se puede vaciar, y el único camino
   * que SÍ la vaciaba era el que crea el duplicado.
   *
   * La edición que la pone en rojo: volver a poner `router.push(...)` en esa fila.
   */
  it("LA guarda: el botón de la fila gemela adopta el proyecto en vez de navegar", () => {
    const src = fuente("app/(shell)/clients/TraerDeHubspot.tsx");
    const i = src.lastIndexOf("function FilaEmpresa");
    expect(i, "se movió FilaEmpresa; revisar esta guarda").toBeGreaterThan(0);
    const fila = src.slice(i);
    expect(fila.length, "la guarda no está mirando nada").toBeGreaterThan(800);
    expect(
      fila,
      "«Es la misma» volvió a ser un enlace: la fila reaparece para siempre y el único camino que la vacía es el que duplica",
    ).toMatch(/adoptarEnClientId:\s*\w+\.clientId/);
    /**
     * Y se pintan TODAS: con una sola, la persona adopta en la ficha equivocada sin enterarse
     * de que existía otra. `detectarGemelas` es laxo A PROPÓSITO —su contrato dice «devuelve
     * todas las que se parecen, no la mejor»— así que recortar acá rompe el contrato.
     *
     * ⚠ La afirmación es que NO SE RECORTA, no que exista un `.map`: hay dos `gemelas.map(` en
     * el archivo (el de las filas y el de la frase de confirmación), así que buscar el símbolo
     * pasaba en verde con el recorte puesto.
     */
    expect(fila, "el panel volvió a mostrar un subconjunto de las gemelas").not.toMatch(
      /gemelas(\[|\.slice\(|\.at\()/,
    );
    expect(fila, "cada gemela dejó de tener su propio botón").toMatch(
      /gemelas\.map\([\s\S]{0,900}?adoptarEnClientId: g\.clientId/,
    );
    expect(
      fila,
      "la fila volvió a navegar en vez de resolver",
    ).not.toContain("router.push");
  });

  it("y el servidor solo adopta en una gemela que él mismo calculó", () => {
    /* Mismo candado que el `companyId`: sin esto, `adoptarEnClientId` es entrada libre y
       cualquiera cuelga un proyecto de cualquier cliente del sistema. */
    const post = fuente(RUTA).slice(fuente(RUTA).indexOf("export async function POST"));
    const i = post.indexOf("cuerpo.adoptarEnClientId");
    expect(i, "desapareció el camino de adopción").toBeGreaterThan(0);
    const rama = post.slice(i, post.indexOf("if (empresa.gemelas.length > 0"));
    expect(rama.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    expect(
      rama,
      "el clientId a adoptar dejó de validarse contra las gemelas del servidor",
    ).toContain("empresa.gemelas.some");
    expect(
      rama,
      "la adopción volvió a crear un Client: es exactamente el duplicado que este camino evita",
    ).not.toContain("client.create");
  });
});

describe("el botón no existe cuando no hay nada que traer", () => {
  /* Es la regla que este mismo directorio escribe dos veces (la píldora que no parte el
     universo, la pestaña de categoría vacía). Y acá importa más que en ningún lado: el universo
     se agota —quedan 2 de 61— así que el estado NORMAL del botón va a ser «no hay nada». */
  it("LA guarda: con cero traíbles el componente devuelve null", () => {
    const src = fuente("app/(shell)/clients/TraerDeHubspot.tsx");
    expect(
      src,
      "el botón se pinta siempre: queda un control muerto en el toolbar que se acaba de despejar",
    ).toContain("if (cuantas <= 0 && !abierto) return null;");
  });

  it("y si HubSpot no contestó tampoco se pinta", () => {
    /* `null` del módulo → 0 → sin botón. Ofrecer traer sin saber qué hay es peor que no
       ofrecer: el panel se abriría para decir «no se pudo». */
    expect(fuente("app/(shell)/clients/ClientsTable.tsx")).toContain(
      "universo?.traibles.length ?? 0",
    );
  });
});
