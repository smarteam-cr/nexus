import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PISO_REUNIONES_INTERNAS,
  coincideConLaBusqueda,
  esReunionDePuertasAdentro,
} from "./candidatas-internas";

/**
 * lib/sessions/candidatas-internas.test.ts — QUÉ REUNIONES SE LE OFRECEN A UN PROYECTO INTERNO.
 *
 * La falla que ataca es de volumen, en las dos direcciones, y las dos son silenciosas:
 *  · aflojar el criterio → un proyecto empieza a ofrecer las ~4.900 reuniones internas del equipo
 *    para meterlas en un documento;
 *  · apretarlo → la lista queda vacía y parece que "no anda", sin ningún error.
 */

const PROPIOS = new Set(["smarteamcr.com"]);
const YO = "msalas@smarteamcr.com";
const OTRO_NUESTRO = "bcenteno@smarteamcr.com";
const DE_AFUERA = "heylin@agrosmartcr.com";

describe("¿es una reunión de puertas adentro?", () => {
  it("todos nuestros → sí", () => {
    expect(esReunionDePuertasAdentro({ participants: [YO, OTRO_NUESTRO] }, PROPIOS)).toBe(true);
  });

  it("UNO de afuera alcanza para que no lo sea", () => {
    /* No es un detalle: con alguien de afuera, la cascada normal ya sabe de quién es la reunión
       por su dominio. Ofrecerla acá sería competir con la atribución que ya funciona. */
    expect(esReunionDePuertasAdentro({ participants: [YO, DE_AFUERA] }, PROPIOS)).toBe(false);
  });

  it("el organizador cuenta como participante", () => {
    /* Una reunión que ORGANIZÓ alguien de afuera no es interna aunque en la sala estemos solos
       nosotros. El chokepoint de relevancia ya pliega el organizador; acá se hace igual. */
    expect(
      esReunionDePuertasAdentro({ participants: [YO], organizerEmail: DE_AFUERA }, PROPIOS),
    ).toBe(false);
    expect(
      esReunionDePuertasAdentro({ participants: [YO], organizerEmail: OTRO_NUESTRO }, PROPIOS),
    ).toBe(true);
  });

  it("sin participantes → NO", () => {
    /* Una sesión sin nadie no es interna: es un dato incompleto. Ofrecerla llenaría la lista de
       filas que nadie puede evaluar. */
    expect(esReunionDePuertasAdentro({ participants: [] }, PROPIOS)).toBe(false);
    expect(esReunionDePuertasAdentro({ participants: [], organizerEmail: null }, PROPIOS)).toBe(false);
  });

  it("los dominios se comparan sin importar mayúsculas ni espacios", () => {
    expect(esReunionDePuertasAdentro({ participants: ["  M.Salas@SmarteamCR.com "] }, PROPIOS)).toBe(true);
  });

  it("con más de un dominio propio, todos cuentan", () => {
    // La lista sale de las SessionCategory internas, que se editan en /sessions/categories.
    const dos = new Set(["smarteamcr.com", "smarteam.mx"]);
    expect(esReunionDePuertasAdentro({ participants: [YO, "a@smarteam.mx"] }, dos)).toBe(true);
  });

  it("una basura sin @ no cuenta como nuestra", () => {
    expect(esReunionDePuertasAdentro({ participants: ["sin-arroba"] }, PROPIOS)).toBe(false);
  });
});

describe("el piso de 2026", () => {
  it("es 2026-01-01 en UTC, transcrito", () => {
    /* Decisión de negocio: las internas se cuentan de 2026 en adelante. Sin el piso, un proyecto
       interno nuevo se ofrece a sí mismo miles de reuniones viejas y la lista se vuelve inútil. */
    expect(PISO_REUNIONES_INTERNAS.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("el buscador del modal", () => {
  const S = { title: "Sprint comercial", participants: [YO, DE_AFUERA] };

  it("sin consulta, pasa todo", () => {
    expect(coincideConLaBusqueda(S, "")).toBe(true);
    expect(coincideConLaBusqueda(S, "   ")).toBe(true);
  });

  it("por título", () => {
    expect(coincideConLaBusqueda(S, "sprint")).toBe(true);
    expect(coincideConLaBusqueda(S, "kickoff")).toBe(false);
  });

  it("por PERSONA y por DOMINIO — el caso que lo motivó", () => {
    /* "Esta reunión la tuvo Marco con alguien de tal empresa" no está en el título. Si el buscador
       solo mirara el título, la reunión que se está buscando sería inencontrable. */
    expect(coincideConLaBusqueda(S, "agrosmartcr.com")).toBe(true);
    expect(coincideConLaBusqueda(S, "heylin")).toBe(true);
    expect(coincideConLaBusqueda(S, "nadie@otra.com")).toBe(false);
  });

  it("una sesión sin título no explota", () => {
    expect(coincideConLaBusqueda({ title: null, participants: [YO] }, "msalas")).toBe(true);
  });
});

describe("está cableado, y con los frenos puestos", () => {
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("LA guarda: agregar una sesión sin dueño le ASIGNA el dueño", () => {
    /* Sin esto el botón "Agregar" parece funcionar —el vínculo se escribe— pero el chokepoint lo
       descarta al leer con un console.warn que nadie mira, y el handoff sigue vacío. Es la misma
       falla silenciosa que toda esta tanda vino a matar. */
    expect(leer("app/api/projects/[projectId]/handoff-sessions/route.ts")).toContain(
      "adoptarSesionSinDuenio(",
    );
  });

  it("solo se adopta lo que NO tiene dueño, por las dos vías", () => {
    /* Adoptar una sesión que ya es de alguien sería robársela a otro cliente sin que nadie lo
       pida — y ni INV1 lo vería, porque quedaría coherente. */
    const src = leer("lib/sessions/project-sources.ts");
    const i = src.indexOf("export async function adoptarSesionSinDuenio");
    expect(i).toBeGreaterThan(0);
    const cuerpo = src.slice(i, i + 900);
    expect(cuerpo).toContain("s.resolvedClientId !== null || s.manualClientId !== null");
  });

  it("adoptar NO paga el clasificador de IA", () => {
    /* El humano acaba de elegir el proyecto. Correr el modelo para que adivine lo mismo cuesta del
       orden de un dólar por click, y encima puede proponer links que nadie pidió. */
    const src = leer("lib/sessions/project-sources.ts");
    const i = src.indexOf("export async function adoptarSesionSinDuenio");
    expect(src.slice(i, i + 900)).toContain("reclassify: false");
  });

  it("el grupo interno está gateado por proyecto INTERNO", () => {
    /* Un proyecto normal ES publicable: ofrecerle una reunión de Smarteam con Smarteam para meter
       en un documento que el cliente lee sería una fuga. Y sin el gate, TODO proyecto de TODO
       cliente empezaría a ofrecer ~4.900 reuniones. */
    const src = leer("app/api/projects/[projectId]/session-candidates/route.ts");
    expect(src, "el gate de proyecto interno desapareció").toContain("guard.interno");
    expect(src, "el piso de 2026 dejó de aplicarse").toContain("PISO_REUNIONES_INTERNAS");
  });

  it("el tope se aplica DESPUÉS de filtrar, no antes", () => {
    /* LA guarda del volumen, y la más fácil de romper "optimizando": poner un `take` en la
       consulta de huérfanas parece prudente y hace exactamente lo contrario. De las ~4.900 sin
       dueño solo una fracción son reuniones de puertas adentro, así que cortar en crudo se lleva
       puesto todo lo que no esté en la cola más reciente — y el buscador del modal filtra en el
       NAVEGADOR, sobre lo que ya llegó, así que no hay segunda puerta: la reunión de marzo queda
       inalcanzable y la pantalla se ve perfecta, con su lista y su buscador. El caso de uso entero
       de este grupo es encontrar UNA reunión vieja. */
    const src = leer("app/api/projects/[projectId]/session-candidates/route.ts");
    /* Se mira SOLO el tramo de la consulta de huérfanas —del piso hasta el filtro— porque el otro
       grupo (el del cliente) sí tiene su propio `take` legítimo y escanear el archivo entero daría
       un falso positivo el día uno.
       ⚠ `lastIndexOf`, no `indexOf`: los dos símbolos se IMPORTAN arriba del archivo, y anclando
       a la primera aparición el tramo salía de un import al otro —dos líneas— o directamente
       vacío si el orden del import se invertía. La guarda pasaba siempre. Se cazó rompiéndola a
       propósito; por eso abajo se verifica también que el tramo tenga tamaño de consulta. */
    const desde = src.lastIndexOf("PISO_REUNIONES_INTERNAS");
    const hasta = src.lastIndexOf("esReunionDePuertasAdentro");
    const consulta = src.slice(desde, hasta);
    expect(
      consulta.length,
      "el tramo quedó vacío: la guarda no está mirando la consulta y no puede fallar",
    ).toBeGreaterThan(200);
    expect(consulta, "volvió el `take` antes del filtro de puertas adentro").not.toMatch(/take:/);
    expect(src, "el tope después del filtro desapareció").toMatch(
      /esReunionDePuertasAdentro[\s\S]{0,120}\.slice\(/,
    );
  });

  it("la lista sale ordenada por fecha, no como vino", () => {
    /* Al concatenar el grupo interno se pierde el `date desc` de la consulta. En una lista de la
       que hay que elegir a mano, el orden es la mitad de la usabilidad — y su ausencia no rompe
       nada, solo hace la pantalla peor sin que nadie sepa por qué. */
    const src = leer("app/api/projects/[projectId]/session-candidates/route.ts");
    expect(src, "el orden por fecha se perdió al mezclar los dos grupos").toContain(
      "b.date.getTime() - a.date.getTime()",
    );
  });

  it("el buscador del modal mira participantes, no solo el título", () => {
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src).toContain("coincideConLaBusqueda(");
    expect(src, "el modal sigue prometiendo solo sesiones del cliente").not.toContain(
      "Buscar sesiones del cliente",
    );
  });

  it("el botón avisa que además asigna", () => {
    // El texto es la mitad de la mitigación: el efecto no se ve desde el modal.
    expect(leer("components/clients/SessionSelectionReview.tsx")).toContain("Agregar y asignar");
  });
});

describe("el buscador no ofrece humo", () => {
  const RUTA = "app/api/projects/[projectId]/session-candidates/route.ts";
  const MODAL = "components/clients/SessionSelectionReview.tsx";
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/gm, "$1 ");

  it("LA guarda: los DOS grupos excluyen las reuniones que no ocurrieron", () => {
    /* Una reunión agendada para la semana que viene no tiene nada adentro: ofrecerla para
       alimentar un handoff es ofrecer humo. El filtro es una sola condición por grupo y sacarla
       no rompe nada visible — la lista simplemente se llena de futuro. */
    const src = sinComentarios(leer(RUTA));
    const topes = src.split("lte: new Date()").length - 1;
    expect(
      topes,
      "algún grupo de candidatas dejó de cortar en hoy: el buscador vuelve a ofrecer reuniones que no ocurrieron",
    ).toBeGreaterThanOrEqual(2);
  });

  it("las vacías se MARCAN, no se esconden", () => {
    /* Medido el 2026-08-05: 3.289 de 6.435 reuniones pasadas (51%) no tienen transcript, ni
       resumen, ni minuta. Esconderlas sería otra desaparición silenciosa —el pecado de esta
       tanda—; se muestran con su marca y la persona decide. */
    const src = sinComentarios(leer(RUTA));
    expect(src, "el DTO dejó de decir cuáles no tienen nada adentro").toContain("sinContenido");
    /* ⚠ El `[^)]*` de la primera versión frenaba en el primer paréntesis —que está dentro de
       `has(s.id)`— así que nunca alcanzaba a ver el `sinContenido` del final. Se mira el `.filter`
       de candidatas completo, acotado a su línea. */
    const filtroCandidatas =
      src.split(/\r?\n/).find((l) => l.includes(".filter((s) => !feedingIds")) ?? "";
    expect(filtroCandidatas.length, "se movió el filtro de candidatas; revisar esta guarda").toBeGreaterThan(20);
    expect(filtroCandidatas, "volvió a filtrarlas en vez de marcarlas").not.toContain("sinContenido");
    /* Se exige el CHIP, no una mención cualquiera: `c.sinContenido` también aparece atenuando la
       fila, así que un `toContain` suelto pasaba en verde con el chip ya borrado. */
    const ui = sinComentarios(leer(MODAL));
    const i = ui.indexOf("sin información");
    expect(i, "desapareció el chip que dice que no hay nada adentro").toBeGreaterThan(0);
    expect(
      ui.slice(Math.max(0, i - 400), i),
      "el chip quedó suelto: ya no depende de si la sesión tiene contenido",
    ).toContain("c.sinContenido");
  });

  it("no se traen los blobs para saber si están vacías", () => {
    /* `transcript` es un TEXT largo y `summary` un JSON: pedírselos a Prisma para después mirar
       si están vacíos sería traer megabytes al servidor para tirarlos. Va un booleano por sesión.
       Si alguien "simplifica" esto a un select normal, la ruta se vuelve lentísima sin que ningún
       test lo note. */
    const src = sinComentarios(leer(RUTA));
    expect(src, "se dejó de calcular el contenido en SQL").toContain("$queryRaw");
    expect(src, "se están trayendo los blobs al servidor").not.toMatch(/^\s*transcript: true,/m);
    expect(src, "se está trayendo el resumen entero").not.toMatch(/^\s*summary: true,/m);
  });

  it("una futura que YA alimenta se avisa en el panel", () => {
    /* Los grupos de candidatas cortan en hoy, pero `feeding` nunca tuvo ese filtro: una reunión
       vinculada antes puede estar alimentando el handoff sin haber ocurrido. Medido: 30 vínculos
       así. No se saca sola —sería quitarle contenido a un documento en silencio— se dice. */
    expect(sinComentarios(leer(RUTA)), "el DTO de feeding dejó de marcar las futuras").toContain(
      "futura:",
    );
    expect(sinComentarios(leer(MODAL)), "el panel dejó de avisarlo").toContain("todavía no ocurrió");
  });
});
