import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  PISO_REUNIONES_INTERNAS,
  coincideConLaBusqueda,
  decidirAlAgregar,
  esReunionDePuertasAdentro,
  motivoParaNoAdoptar,
  motivoParaNoElegirDelCalendario,
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

/** Las rutas que agregan una reunión a un proyecto. Las DOS pasan por la misma puerta. */
const PUERTAS_DE_AGREGAR = [
  "app/api/projects/[projectId]/handoff-sessions/route.ts",
  "app/api/projects/[projectId]/timeline/sessions/route.ts",
];

describe("está cableado, y con los frenos puestos", () => {
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("LA guarda: agregar una sesión sin dueño le ASIGNA el dueño", () => {
    /* Sin esto el botón "Agregar" parece funcionar —el vínculo se escribe— pero el chokepoint lo
       descarta al leer con un console.warn que nadie mira, y el handoff sigue vacío. Es la misma
       falla silenciosa que toda esta tanda vino a matar. */
    /* 2026-09-23: la lógica se mudó a `lib/sessions/agregar-sesion.ts` porque ahora hay DOS
       puertas (handoff y cronograma). La guarda sigue al código y exige que las dos lo usen. */
    expect(leer("lib/sessions/agregar-sesion.ts")).toContain("adoptarSesionSinDuenio(");
    for (const ruta of PUERTAS_DE_AGREGAR) {
      expect(leer(ruta), `${ruta} vincula por su cuenta, sin la puerta única`).toContain(
        "prepararVinculoManual(",
      );
    }
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
    /* Hasta el cierre de la función, no un largo fijo: el cuerpo creció (2026-09-22, escritura
       condicional) y un tope de 900 caracteres dejaba la llamada afuera de lo que se revisaba. */
    const cuerpo = src.slice(i, src.indexOf("\n}\n", i));
    expect(cuerpo.length, "la guarda no está mirando la función").toBeGreaterThan(200);
    expect(cuerpo).toContain("reclassify: false");
  });

  it("el grupo interno está gateado por proyecto INTERNO", () => {
    /* Sin el gate, TODO proyecto de TODO cliente empezaría a ofrecer ~4.900 reuniones de
       Smarteam con Smarteam para meter en documentos que el cliente lee — una fuga a escala.
       ⚠ La otra mitad de este argumento murió el 2026-08-12: era "y un interno no se publica,
       así que ese material no sale de casa". Ahora un interno SÍ se publica (enlace con
       contraseña, para stakeholders), así que este gate quedó como lo ÚNICO que separa las
       reuniones de puertas adentro del resto del sistema. */
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

describe("el buscador de cualquier proyecto encuentra las reuniones sin dueño (2026-09-22)", () => {
  /* Caso Club de Amantes del Vino: «[Sales & Service handoff] CAV» tenía transcripción pero era
     100 % interna y su título usaba la sigla del cliente, así que quedó sin dueño y ningún proyecto
     la ofrecía. Decisión de Elías: el buscador del Contexto de cualquier proyecto también busca en
     las sin dueño — solo por texto, nunca como lista — y agregarla la asigna al cliente. */
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const RUTA = "app/api/projects/[projectId]/session-candidates/sin-duenio/route.ts";

  it("busca solo en lo que no es de nadie, ya ocurrido, con mínimo de letras y con tope", () => {
    const src = leer(RUTA);
    expect(src, "sin guarda de acceso al proyecto").toContain("guardAccessToProject(");
    expect(src).toContain('s."resolvedClientId" IS NULL');
    expect(src).toContain('s."manualClientId" IS NULL');
    expect(src, "ofrecería reuniones que todavía no ocurrieron").toContain('s."date" <= ${ahora}');
    expect(src, "sin tope devolvería miles de filas").toMatch(/LIMIT \$\{TOPE_SIN_DUENIO\}/);
    expect(src, "sin mínimo de letras sería la lista completa de huérfanas").toContain(
      "q.length < MIN_BUSQUEDA_SIN_DUENIO",
    );
  });

  it("agregar una sin dueño la asigna al cliente en CUALQUIER proyecto, no solo en los internos", () => {
    const src = leer("lib/sessions/agregar-sesion.ts");
    expect(src, "la puerta dejó de decidir con la función que tiene test").toContain("decidirAlAgregar(");
    expect(src, "la puerta dejó de aplicar la regla de quién se adopta").toContain("motivoParaNoAdoptar(");
    expect(
      src,
      "volvió el gate de proyecto interno: «Agregar y asignar» escribiría un vínculo que se descarta al leer",
    ).not.toContain("guard.interno");
    for (const ruta of PUERTAS_DE_AGREGAR) expect(leer(ruta), ruta).not.toContain("guard.interno");
    expect(src).toContain("session.resolvedClientId === null && session.manualClientId === null");
  });

  it("LA guarda del arreglo: una sin dueño YA vinculada a este proyecto también se asigna", () => {
    /* La primera versión adoptaba solo si el vínculo NO existía: «Agregar y asignar» sobre una
       reunión ya vinculada (una excluida, o una que otro camino vinculó) no asignaba nada y el
       buscador la volvía a ofrecer para siempre. */
    const base = { quiereIncluir: true, sinDuenio: true, perteneceAlCliente: false, motivoNoAdoptable: null };
    expect(decidirAlAgregar({ ...base, vinculoExiste: true })).toEqual({ tipo: "adoptar" });
    expect(decidirAlAgregar({ ...base, vinculoExiste: false })).toEqual({ tipo: "adoptar" });
  });

  it("la puerta decide lo mismo que antes en todo lo demás", () => {
    const nada = { vinculoExiste: false, quiereIncluir: true, sinDuenio: false, perteneceAlCliente: true, motivoNoAdoptable: null };
    // Del cliente: se vincula, sin adoptar nada.
    expect(decidirAlAgregar(nada)).toEqual({ tipo: "vincular" });
    // De OTRO cliente y el vínculo es nuevo: rechazo (hardening INV1).
    expect(decidirAlAgregar({ ...nada, perteneceAlCliente: false })).toMatchObject({ tipo: "rechazar", status: 400 });
    // De otro cliente pero el vínculo ya existía: solo cambia el override.
    expect(decidirAlAgregar({ ...nada, perteneceAlCliente: false, vinculoExiste: true })).toEqual({ tipo: "vincular" });
    // Excluir una sin dueño YA VINCULADA no la asigna a nadie: solo cambia el afinado.
    expect(
      decidirAlAgregar({
        ...nada,
        vinculoExiste: true,
        sinDuenio: true,
        perteneceAlCliente: false,
        quiereIncluir: false,
      }),
    ).toEqual({ tipo: "vincular" });
    /* ⭐ La X sobre un vínculo que ya NO existe se rechaza (2026-09-23): antes entraba por el
       `create` del upsert y volvía a hacer miembro a una reunión que otra persona había sacado. */
    for (const sinDuenio of [true, false]) {
      expect(
        decidirAlAgregar({ ...nada, vinculoExiste: false, sinDuenio, quiereIncluir: false }),
        `sinDuenio=${sinDuenio}`,
      ).toMatchObject({ tipo: "rechazar", status: 409 });
    }
    // Sin dueño pero con motivo: 409 con el motivo, y no se adopta.
    expect(
      decidirAlAgregar({ ...nada, sinDuenio: true, perteneceAlCliente: false, motivoNoAdoptable: "porque sí" }),
    ).toEqual({ tipo: "rechazar", status: 409, error: "porque sí" });
  });

  it("con un clic solo se asigna una reunión donde estuvo únicamente el equipo, y que no cuelga de otro cliente", () => {
    const CLIENTE = "cliente-cav";
    const interna = { participants: [YO, OTRO_NUESTRO], clientesDeSusProyectos: [] as string[] };
    expect(motivoParaNoAdoptar(interna, CLIENTE, PROPIOS)).toBeNull();
    // Ya vinculada a un proyecto de ESTE cliente: sigue siendo asignable.
    expect(motivoParaNoAdoptar({ ...interna, clientesDeSusProyectos: [CLIENTE] }, CLIENTE, PROPIOS)).toBeNull();
    // Cuelga de un proyecto de OTRO cliente: asignarla dejaría el vínculo cruzado (INV1 en rojo).
    expect(motivoParaNoAdoptar({ ...interna, clientesDeSusProyectos: ["otro"] }, CLIENTE, PROPIOS)).toMatch(
      /otro cliente/,
    );
    // Alguien de afuera que no es de ningún cliente: puede ser un prospecto, no se fija a mano con un clic.
    expect(
      motivoParaNoAdoptar({ ...interna, participants: [YO, DE_AFUERA] }, CLIENTE, PROPIOS),
    ).toMatch(/no es del equipo/);
    // Sin nadie registrado: no hay con qué decidir.
    expect(motivoParaNoAdoptar({ ...interna, participants: [] }, CLIENTE, PROPIOS)).toMatch(/quién estuvo/);
  });

  it("el buscador y la puerta leen la MISMA regla, y el modal no ofrece el botón que va a fallar", () => {
    expect(leer(RUTA), "el buscador ya no marca cuáles no se asignan con un clic").toContain(
      "motivoNoAdoptable: motivoParaNoAdoptar(",
    );
    const modal = leer("components/clients/SessionSelectionReview.tsx");
    expect(modal, "las no asignables tienen que mandar a Sesiones").toContain("/sessions?s=${");
    expect(modal, "una respuesta de error de la puerta vuelve a tragarse").toContain("toast.error(");
  });

  it("la adopción queda a nombre de quien apretó, y no pisa una asignación hecha en paralelo", () => {
    for (const r of PUERTAS_DE_AGREGAR) {
      expect(leer(r), `${r}: la adopción vuelve a quedar sin autor`).toContain("guard.teamMember.email");
    }
    const puerta = leer("lib/sessions/agregar-sesion.ts");
    expect(puerta, "se dejó de releer después de adoptar").toContain("belongsToClient(ahora, i.clientId)");
    const fuentes = leer("lib/sessions/project-sources.ts");
    expect(fuentes, "la adopción vuelve a escribir sin mirar si otro la asignó").toContain(
      "soloSiSinDuenio: true",
    );
    const chokepoint = leer("lib/sessions/duenio-manual.ts");
    expect(chokepoint).toContain("where: { id: sessionId, resolvedClientId: null, manualClientId: null }");
  });

  it("#7 · la lista del calendario SIN buscar no trae reuniones sin dueño (solo por búsqueda)", () => {
    /* Revisión adversarial (2026-09-24): sin `q`, la ruta del calendario devolvía las 30 más recientes
       de quien busca, huérfanas incluidas, con «Agregar y asignar» —una escritura durable de
       pertenencia que la X del cronograma no revierte—. La decisión de MIN_BUSQUEDA_SIN_DUENIO es que a
       un proyecto normal se le ofrecen ÚNICAMENTE por búsqueda. La edición que la pone en rojo: sacar
       el filtro de dueño de la consulta sin búsqueda, o aplicarlo también buscando. */
    const ruta = leer("app/api/projects/[projectId]/timeline/calendario/route.ts");
    expect(ruta).toMatch(
      /const filtroDuenio = buscando\s*\?\s*Prisma\.empty\s*:\s*Prisma\.sql`AND \(s\."resolvedClientId" IS NOT NULL OR s\."manualClientId" IS NOT NULL\)`;/,
    );
    const consulta = ruta.slice(ruta.indexOf("const encontradas"), ruta.indexOf("ORDER BY"));
    expect(consulta, "el filtro no llega a la consulta").toContain("${filtroDuenio}");
    const modal = leer("components/clients/SessionSelectionReview.tsx");
    expect(modal, "la pantalla no dice que las sin cliente aparecen buscando").toContain(
      "también en las que no tienen cliente asignado",
    );
  });

  it("el modal pide las sin dueño solo con suficientes letras", () => {
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src).toContain("/session-candidates/sin-duenio?q=");
    expect(src).toContain("consultaSinDuenio.length < MIN_BUSQUEDA_SIN_DUENIO");
  });

  it("el modal no dice «también se buscó» antes de buscar, ni cuando la búsqueda falló", () => {
    /* Con un booleano de «buscando» aparte, los 300 ms de espera y cualquier error se pintaban
       como una búsqueda que corrió y no encontró nada. «Pendiente» se deriva de la respuesta
       guardada, y el error queda guardado con la búsqueda que falló. */
    const src = leer("components/clients/SessionSelectionReview.tsx");
    expect(src).toContain("sinDuenio.q !== consultaSinDuenio");
    expect(src, "un fallo vuelve a quedar mudo").toContain("sesiones: [], error: true");
    expect(src, "volvió el booleano que mentía").not.toContain("setBuscandoSinDuenio");
  });

  it("buscar ignora tildes y mayúsculas", () => {
    expect(coincideConLaBusqueda({ title: "Multiquímica | Revisión", participants: [] }, "multiquimica")).toBe(true);
    expect(coincideConLaBusqueda({ title: "Otra", participants: ["josé@empresa.cr"] }, "JOSE")).toBe(true);
  });

  it("la vista de un grupo en /sessions tiene su propio buscador y filtra lo que se pinta", () => {
    const src = leer("app/(shell)/sessions/SessionsClient.tsx");
    expect(src).toContain('aria-label="Buscar en este grupo"');
    expect(src, "el buscador del grupo no filtra la lista que se pinta").toContain("sesionesDelGrupo.map(");
  });
});

describe("el calendario del cronograma: qué se puede elegir (2026-09-23)", () => {
  const base = { perteneceAlCliente: false, sinDuenio: false, motivoNoAdoptable: null, nombreDelDuenio: null };

  it("una reunión de ESTE cliente se elige con un clic", () => {
    expect(motivoParaNoElegirDelCalendario({ ...base, perteneceAlCliente: true })).toBeNull();
  });

  it("⛔ una de OTRO cliente se muestra con su motivo, nunca con un botón", () => {
    /* Llevaría el material de un cliente al cronograma de otro (INV1). La puerta la rechaza igual:
       el motivo existe para que el botón no prometa lo que la puerta va a negar. */
    const m = motivoParaNoElegirDelCalendario({ ...base, nombreDelDuenio: "Wherex" });
    expect(m).toContain("«Wherex»");
    expect(m).toContain("Sesiones");
    expect(motivoParaNoElegirDelCalendario(base), "sin nombre también se dice").toContain("otro cliente");
  });

  it("una sin dueño sigue la regla de adopción de siempre", () => {
    expect(motivoParaNoElegirDelCalendario({ ...base, sinDuenio: true })).toBeNull();
    expect(
      motivoParaNoElegirDelCalendario({ ...base, sinDuenio: true, motivoNoAdoptable: "Estuvo gente de afuera" }),
    ).toBe("Estuvo gente de afuera");
  });
});
