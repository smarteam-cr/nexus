/**
 * lib/asistente/contexto.test.ts — EL CHAT NO SE COME EL CONTEXTO DEL EDITOR.
 *
 * Correr: `npx vitest run lib/asistente/contexto.test.ts --project unit`.
 *
 * ── LA DECISIÓN QUE ESTO PROTEGE ─────────────────────────────────────────────────────────────
 * ⭐ «El chat entiende la INTENCIÓN; el editor tiene el CONTEXTO.» El asistente carga la forma
 * del documento y qué se puede pedir — nunca el handoff, las minutas ni el cronograma entero.
 *
 * ⚠ **El modo de falla es MUDO, y por eso hace falta un test y no un comentario.** Sumarle
 * `loadHandoffContext` al prefijo no rompe nada: el chat sigue contestando, incluso un poco
 * mejor. Lo que cambia es que el prefijo se re-arma en CADA turno, así que veinte turnos por
 * conversación × quince conversaciones por día convierten «un poco mejor» en varios dólares
 * diarios que salen del mismo tope que comparten handoff, kickoff, cronograma y briefs. Eso se
 * descubre en la factura tres semanas después, no en una pantalla roja.
 *
 * La segunda familia es de privacidad: el chat es una superficie NUEVA que no está en ningún
 * censo, y los datos del programa de partner (UUS, seats, MRR) están declarados confidenciales
 * por los términos con HubSpot. La prohibición se escribe ANTES de que exista un campo donde
 * meterlos — que es cuando todavía es barata.
 *
 * ── LA EXCEPCIÓN, CON SU MOTIVO — decisión de Elías 2026-09-23 ───────────────────────────────
 * El chat del cronograma cambia fases y tareas con operaciones, sin ningún modelo editor detrás;
 * si no ve las reuniones elegidas ni las notas, nadie las ve en ese camino. Por eso el material
 * del «Contexto del cronograma» —las reuniones que el CSE ELIGIÓ, con sus minutas, sus notas y
 * sus instrucciones adicionales— entra, y SOLO por una puerta: `materialDelCronograma`
 * (lib/asistente/contexto.ts) → `cargarMaterialParaElChat` (lib/contexto/cargar.ts), con un
 * presupuesto propio y en su propio bloque. Los cargadores de los AGENTES (con su presupuesto de
 * 48.000 en reuniones) siguen prohibidos acá, y el handoff, los kickoffs y las reuniones que el
 * CSE no eligió siguen afuera. Las guardas de abajo hacen cumplir las dos mitades.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "@/lib/ui/scan-source";
import { renderSeccionParaElChat } from "@/lib/canvas/capacidades-de-documento";
import {
  AVISO_DEL_MATERIAL_ILEGIBLE,
  PRESUPUESTO_DEL_CHAT,
  TECHO_DEL_MATERIAL_DEL_CHAT_CHARS,
  TOPE_NOTAS_CRONOGRAMA,
  bloqueDeNotasDelCronograma,
  bloqueDeReunionesDelCronograma,
  bloqueDelMaterialParaElChat,
  planDelMaterial,
  type ReunionElegida,
} from "@/lib/contexto/material-cronograma";
import { TOPE_INSTRUCCIONES_DEL_DOC } from "@/lib/business-cases/section-briefs";

/* La puerta del material, de mentira: la guarda «si falla, el chat sigue» la hace fallar. El resto
   de este archivo lee código, no llama a la puerta. */
const h = vi.hoisted(() => ({ cargarMaterialParaElChat: vi.fn() }));
vi.mock("@/lib/contexto/cargar", () => ({ cargarMaterialParaElChat: h.cargarMaterialParaElChat }));

const { TECHO_DEL_PREFIJO_CHARS, lineaParaRehacerTodo, lineaDeCambiosDeFasesSinDecidir, materialDelCronograma } =
  await import("./contexto");

/** Blanquea comentarios conservando offsets: NOMBRAR algo para prohibirlo no es usarlo. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
}

function archivosDelAsistente(): string[] {
  return listarTsx(path.join("lib", "asistente")).filter((f) => !f.endsWith(".test.ts"));
}

/**
 * Los cargadores PESADOS. Cada uno trae miles de caracteres y todos tienen su dueño legítimo:
 * el editor que ejecuta la instrucción, no la conversación que la acuerda.
 *
 * ⚠ SUMADOS 2026-09-23, con la excepción del header (decisión de Elías: el chat del cronograma
 * cambia fases y tareas con operaciones, sin ningún modelo editor detrás; si no ve las reuniones
 * elegidas ni las notas, nadie las ve en ese camino). El material entra por UNA puerta con SU
 * presupuesto (`cargarMaterialParaElChat`); estas son las otras siete maneras de llegar al mismo
 * material —con el presupuesto de los agentes, 48.000 de reuniones por turno, o armándolo a
 * mano— y cierran el agujero que marcó la validación: sin ellas, importar el cargador de los
 * agentes en contexto.ts dejaba esta guarda en verde.
 */
const CARGADORES_PESADOS = [
  "loadHandoffContext",
  "loadTimelineContext",
  "loadDesarrolloContext",
  "loadCanvasContext",
  "cargarContextoDelAssist",
  "cargarContextoDelDetalle",
  "renderDetalleDeCronograma",
  "fetchTranscriptContent",
  "getProjectMemberSessions",
  "planHandoffSessionBudget",
  "cargarMaterialDelCronograma",
  "cargarNotasDelCronograma",
  "cargarContextoDeEstructura",
  "getProjectTimelineSessions",
  "repartirEspacio",
  "bloqueDeReunionesDelCronograma",
  "bloqueDeNotasDelCronograma",
];

describe("el contexto del chat se mantiene liviano", () => {
  it("⛔ el asistente no importa ningún cargador de contexto pesado", () => {
    /* La edición que la pone en rojo: `import { loadHandoffContext } from "@/lib/canvas/..."`
       en contexto.ts — que es exactamente el gesto de «démosle todo, total entiende mejor». */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const cargador of CARGADORES_PESADOS) {
        if (src.includes(cargador)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → ${cargador}`);
        }
      }
    }
    expect(
      infracciones,
      "El chat cargó contexto pesado. El prefijo se re-arma en CADA turno: lo que acá parece " +
        "«un poco más de contexto» son dólares por día que aparecen en la factura, no en una " +
        "pantalla. El contexto pesado es del EDITOR que ejecuta la instrucción.",
    ).toEqual([]);
  });

  it("⛔ tampoco lee las tablas de material ajeno al documento", () => {
    /* El otro camino al mismo lugar: en vez de importar el cargador, consultar la tabla.

       ⚠ SE SACÓ `canvasBlock` DE ESTA LISTA EL 2026-08-21, y el porqué importa más que el assert.
       El motivo escrito acá —«la forma del documento alcanza para conversar»— dejó de ser cierto:
       Elías pidió «agregá un bullet más a cada lista, sacalo de lo que ya está» y el chat tuvo que
       contestar que no ve el contenido, dejando una instrucción que le pedía al editor inventar
       sobre algo que nadie leyó.

       Lo que NO cambió es la línea de verdad: el chat lee el contenido del documento DEL QUE SE
       ESTÁ HABLANDO, y de nada más. Las minutas y las fuentes del handoff siguen afuera — ése es
       material de OTRO lado, y es lo que esta guarda protege ahora. La pertenencia la garantiza
       `canvasOf(pieza)` en la consulta, y el test de abajo lo hace cumplir. */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const tabla of ["firefliesSession", "handoffSource", "timelineSource"]) {
        if (src.includes(`prisma.${tabla}.`)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → prisma.${tabla}`);
        }
      }
    }
    /* ⚠ MENSAJE ACTUALIZADO 2026-09-23 (el assert no cambió): desde la decisión de Elías de ese
       día, las minutas de las reuniones que el CSE ELIGIÓ para el cronograma y sus notas sí llegan
       al chat del cronograma — pero por la puerta de `materialDelCronograma`, nunca leyendo estas
       tablas desde lib/asistente. */
    expect(
      infracciones,
      "El chat fue a buscar material de otro lado directo a la base. Puede leer el documento del " +
        "que se está hablando y, en el cronograma, lo elegido en «Contexto del cronograma» por " +
        "`materialDelCronograma`; el resto de las minutas y las fuentes del handoff las lee el " +
        "editor cuando ejecuta, no la conversación.",
    ).toEqual([]);
  });

  it("⛔ y el contenido que lee es SOLO el de la pieza en cuestión", () => {
    /* Sin `canvasOf(pieza)` la consulta traería el primer canvas del proyecto: el chat de un
       kickoff terminaría razonando sobre el requerimiento técnico, y nada avisaría.
       La edición que la pone en rojo: sacar `canvasOf(pieza)` del `where`. */
    const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");
    const i = src.indexOf("export async function contextoDeDocumento");
    expect(i, "se fue el contexto de documento").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("const secciones", i));
    expect(bloque, "la consulta dejó de acotar por pieza").toContain("canvasOf(pieza)");
    expect(bloque).toContain("projectId");
  });

  it("⭐ el contenido entra RECORTADO POR SECCIÓN, no con un presupuesto global", () => {
    /* ⚠ Con un tope global, las secciones del final de un documento largo quedarían INVISIBLES —
       y eso no se nota: el modelo contestaría sobre un documento que cree completo. Recortando
       cada una, todas están, y la que se recortó lo dice.
       Medido: mediana 267 caracteres por sección, así que en la mayoría no se recorta nada; y el
       prefijo real de los 172 documentos queda en mediana 1.582 y máximo 8.792, sin que ninguno
       toque el techo. */
    const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");
    expect(src).toContain("TOPE_POR_SECCION_CHARS");
    expect(src, "el recorte dejó de avisar que recortó").toContain("(recortado");
  });

  /**
   * ⚠ ACTUALIZADO 2026-08-23, y el cambio REFUERZA lo que este test protegía.
   *
   * Anclaba `function textoDeBloque`, que era el renderer que recorría `Object.values` del dato
   * crudo. Su intención —«del bloque solo salen strings, nunca ids ni flags»— era la correcta y
   * **la implementación la incumplía**: en las secciones curadas del kickoff la primera key es el
   * identificador, así que los UUID de las franjas y los cuid del equipo venían viajando al prompt
   * en cada turno. Elías los vio primero en la línea del acuerdo; estaban también acá.
   *
   * Ahora hay UN renderer, `renderSeccionParaElChat`, que recorre SOLO lo que el esquema declara.
   * El test pasa a anclar eso: es la misma promesa, con una implementación que la cumple.
   */
  it("⛔ del bloque solo sale lo que el ESQUEMA declara, nunca el Json crudo", () => {
    const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");
    expect(src, "volvió un segundo renderer ciego al esquema").not.toContain("function textoDeBloque");
    expect(src, "el contexto dejó de rendir por esquema").toContain("renderSeccionParaElChat(");
    expect(
      /JSON\.stringify\(\s*(b\.)?data/.test(src),
      "el contexto volcó el Json crudo del bloque en vez de extraer su texto",
    ).toBe(false);
  });

  it("⭐ y un id fuera del esquema NO cruza al prompt", () => {
    /* La prueba de verdad, no el escaneo: una franja es `{id, label}` y su esquema declara solo
       `{label}`. La edición que la pone en rojo: volver a recorrer `Object.values` del dato. */
    const schema = {
      type: "object",
      properties: { options: { type: "array", items: { type: "object", properties: { label: { type: "string" } } } } },
    };
    const data = { options: [{ id: "58dc6158-dfee-4ce8-a442-9f1c", label: "Martes 11:00 am" }] };
    const render = renderSeccionParaElChat(schema, data);
    expect(render).toContain("Martes 11:00 am");
    expect(render, "el UUID cruzó al prompt").not.toContain("58dc6158");
  });

  it("el techo del prefijo sigue siendo una decisión chica, no un número que creció solo", () => {
    /* Si alguien lo sube, que sea un diff que se lee — que es exactamente lo que pasó el
       2026-08-21: subió de 6.000 a 13.000 porque entraron las TAREAS, sin las cuales el chat
       tenía tres operaciones que no podía emitir. Medido sobre los 51 cronogramas reales, con el
       handle de 5 caracteres el más grande queda en ~11.000 y ninguno se pasa.

       El límite de acá arriba es el que impide que el próximo agregado entre sin medirlo. */
    expect(TECHO_DEL_PREFIJO_CHARS).toBeLessThanOrEqual(15_000);
  });
});

describe("ningún dato de partner ni de costos cruza al asistente", () => {
  /* ⚠ El chat es una superficie NUEVA: no está en el censo `LECTORES` de handoff-al-cliente ni
     en el de la Entrega. Los datos del programa de partner están declarados CONFIDENCIALES por
     los términos con HubSpot (`prisma/schema.prisma`, PartnerUsageSnapshot). Y los costos son
     del negocio de Smarteam, no de la conversación sobre el proyecto del cliente. */
  const PROHIBIDOS = [
    "PartnerUsageSnapshot",
    "ClientPartnerSnapshot",
    "partnerUsageSnapshot",
    "clientPartnerSnapshot",
    "uusScore",
    "uusTrend",
    "mrrTotal",
    "marketingContactsUsed",
    "consumptionScore",
    "servicioContratado",
    "ServicioContratado",
    "bitacoraCobro",
    "montoUsd",
  ];

  it("⛔ allowlist VACÍA, a propósito: levantarla tiene que ser un diff en castellano", () => {
    /* La edición que la pone en rojo: leer `prisma.partnerUsageSnapshot` desde el contexto del
       chat «para que sepa cuánto paga el cliente». */
    const infracciones: string[] = [];
    for (const archivo of archivosDelAsistente()) {
      const src = soloCodigo(fs.readFileSync(path.join(RAIZ, archivo), "utf8"));
      for (const prohibido of PROHIBIDOS) {
        if (src.includes(prohibido)) {
          infracciones.push(`${archivo.split(path.sep).join("/")} → ${prohibido}`);
        }
      }
    }
    expect(
      infracciones,
      "Datos de partner o de cobranza en el contexto del asistente. Los de partner son " +
        "confidenciales por los términos con HubSpot; los de cobranza son del negocio de " +
        "Smarteam y no de la conversación sobre el proyecto del cliente.",
    ).toEqual([]);
  });
});

describe("el contexto del cronograma dice lo que el chat necesita para hablar de fechas", () => {
  const src = fs.readFileSync(path.join(RAIZ, "lib/asistente/contexto.ts"), "utf8");

  it("⚠ trae el cierre proyectado: sin eso el chat no puede avisar que una fecha se mueve", () => {
    /* Decisión de Elías: «toda propuesta que mueva una fecha lo DICE. Y si no la mueve, también».
       El silencio se lee como «no cambió nada». La edición que la pone en rojo: sacar
       `projectedEnd` del contexto — el chat seguiría contestando, mudo sobre las fechas. */
    expect(src).toContain("projectedEnd(");
    expect(src).toContain("cierreActual");
  });

  it("⛔ las reglas duras se INTERPOLAN del único lugar donde viven, no se transcriben", () => {
    /* Dos copias divergen calladas, y la divergencia se manifiesta como el chat prometiéndole al
       CSE algo que el modificador no puede hacer — el problema que el chat vino a resolver, pero
       peor: ahora afirmado por escrito. */
    expect(src).toContain("REGLAS_DURAS_DEL_CRONOGRAMA");
    expect(
      src.includes("Conserva los ids EXACTOS"),
      "las reglas duras están transcritas en vez de interpoladas: la copia va a divergir",
    ).toBe(false);
  });

  it("⛔ las NOTAS de las tareas nunca cruzan — el título sí, y es la tercera línea", () => {
    /* ⚠ ESTA GUARDA SE MOVIÓ DOS VECES, Y EL RECORRIDO ES LA LECCIÓN.

       v1 (2026-08-19): «no toques `tasks`». El contexto daba solo el total por fase. Elías pidió
       «en Integraciones hay semanas sin tareas, quítalas» y el chat no podía verlo.
       v2 (2026-08-20): «solo contadores» — entraron `weekIndex` y `status`. Elías pidió «pasá la
       sesión de cierre al final» y «borrá la última base»: el chat no tenía con qué nombrarlas.
       v3 (2026-08-21, esta): entran `id` y `title`. Medido: de nueve pedidos distintos que hizo
       de verdad, seis morían acá.

       Las dos veces la guarda defendió una línea que el uso corrió. Lo que NO se movió nunca es
       lo que separa la FORMA del cronograma de su CONTENIDO de negocio, y ahí siguen las notas:
       son texto libre del CSE, no hacen falta para conversar sobre estructura, y el modificador
       ya las lee cuando ejecuta.

       La edición que la pone en rojo: sumar `notes: true` al select de tareas. */
    /* ⚠ `source` entró el 2026-08-21 y NO es contenido: es la procedencia, un enum de tres
       valores. Sin ella el chat no podía saber que una tarea pendiente la cargó una persona —y
       por lo tanto está protegida— así que proponía borrarla para que el ejecutor la rechazara
       después. Las que crea el propio chat nacen HUMAN: no podía deshacer lo que acababa de hacer. */
    expect(src).toContain(
      "select: { id: true, title: true, weekIndex: true, status: true, source: true }",
    );
    expect(
      src.includes("notes: true"),
      "el contexto del chat pasó a traer las NOTAS de las tareas: eso es contenido de negocio, " +
        "no la forma del cronograma — y el modificador ya las lee cuando le toca ejecutar",
    ).toBe(false);
  });

  it("⛔ y las tareas se nombran por HANDLE, no por el cuid entero", () => {
    /* Es lo único que hace que el cronograma más grande entre en el techo: el id completo son 25
       caracteres × 98 tareas. Medido, con cuids enteros 7 de los 51 cronogramas se pasaban.
       Y el handle NO puede salir del principio del id: las tareas de un cronograma nacen en el
       mismo `createMany` y comparten prefijo — 1.063 colisiones medidas con 8 caracteres.

       La edición que la pone en rojo: interpolar `t.id` en vez de `handleDeTarea(t.id)`. */
    expect(src).toContain("handleDeTarea(t.id)");
    expect(
      /\$\{t\.id\}/.test(src),
      "el contexto interpola el id crudo de una tarea: son 20 caracteres de más por tarea",
    ).toBe(false);
  });

  it("⭐ y sí trae el reparto por semana, que es lo que deja pedir «sacá las vacías»", () => {
    /* Sin esto vuelve el caso exacto del 2026-08-20: el CSE ve cuatro semanas vacías en pantalla
       y el asistente no. La edición que la pone en rojo: volver al total por fase. */
    expect(src).toContain("semanas VACÍAS");
    expect(src).toContain("porSemana");
  });

  it("⭐ nombra el botón que rehace todo SEGÚN EL ESTADO del cronograma", () => {
    /* ⚠ ACTUALIZADO 2026-09-24 (revisión del paso C). Pedía el ternario
       `conDetalleDeLaIA ? «Regenerar…» : «Generar…»` escrito acá; la línea ahora sale de
       `lineaParaRehacerTodo` (con su propia guarda de conducta, abajo) porque el ternario solo no
       alcanzaba: en un cronograma publicado sin tareas de la IA recomendaba un botón que no se ve.
       Esta guarda sigue pidiendo lo mismo de fondo: que el estado se lea de la base y llegue a la
       línea. Las ediciones que la ponen en rojo: dejar de mirar las tareas de la IA, la foto
       publicada o la propuesta pendiente, o sacar la línea del contexto. */
    const i = src.indexOf("const conDetalleDeLaIA");
    expect(i, "el contexto dejó de mirar si hay tareas de la IA").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("const fases = timeline.phases", i));
    expect(tramo).toContain('t.source === "AGENT" || t.source === "MODIFIED"');
    expect(tramo, "la línea dejó de salir del armador que sigue a la pantalla").toContain("lineaParaRehacerTodo({");
    expect(tramo, "la línea dejó de saber si el cronograma ya se subió").toContain("publicadoAlgunaVez: publicaciones > 0");
    expect(tramo, "la línea dejó de saber si hay cambios de fases sin decidir").toContain(
      "cambiosDeFasesSinDecidir: propuestasPendientes > 0",
    );
    expect(src, "el contexto dejó de contar las publicaciones").toContain(
      "prisma.projectTimeline.count({ where: { projectId, publishedSnapshot: { not: Prisma.DbNull } } })",
    );
    expect(src, "el contexto dejó de contar la propuesta pendiente").toContain(
      "prisma.projectTimeline.count({ where: { projectId, pendingProposal: { not: Prisma.DbNull } } })",
    );
    expect(src, "la línea del botón dejó de entrar al contexto").toContain('["", paraRehacerTodo]');
  });

  it("⛔ la línea «PARA REHACER TODO» nunca recomienda un botón que la pantalla no muestra", () => {
    /* Las condiciones son las de CronogramaCanvas.tsx: «Generar cronograma» exige sin tareas de la
       IA y `!hasPublishedOnce`, y una propuesta SOLO de fases no lo esconde; «Regenerar todo el
       cronograma» exige tareas de la IA y ninguna propuesta; publicado sin tareas de la IA no hay
       ninguno. Lo que el servidor no sabe (el permiso, una vista previa en pantalla) va como
       condición. Las ediciones que la ponen en rojo: volver al ternario solo por las tareas, decir
       que «Generar» se esconde con cambios de fases pendientes, o perder la frase del permiso. */
    const linea = (conDetalleDeLaIA: boolean, publicadoAlgunaVez: boolean, cambiosDeFasesSinDecidir: boolean) =>
      lineaParaRehacerTodo({ conDetalleDeLaIA, publicadoAlgunaVez, cambiosDeFasesSinDecidir });

    for (const pendiente of [false, true]) {
      const publicadoSinIa = linea(false, true, pendiente);
      expect(publicadoSinIa, "publicado sin tareas de la IA no hay botón que rehaga todo").toContain("hoy NO hay botón");
      expect(publicadoSinIa).not.toContain("«Generar cronograma»");
      expect(publicadoSinIa).not.toContain("«Regenerar todo el cronograma»");
    }

    const virgen = linea(false, false, false);
    expect(virgen).toContain("«Generar cronograma»");
    expect(virgen).toContain("permiso de generar");
    /* ⚠ ACTUALIZADA en E2a P3 (2026-09-25), con esta razón: la propuesta de «Regenerar todo» trae
       fases Y tareas, así que la línea dejó de decir «cambios de fases sin decidir» y dice «una
       propuesta sin decidir». La negación vieja habría quedado en verde siempre (decorativa): se mira
       la frase nueva, y abajo se pide que la de la propuesta pendiente la diga. */
    expect(virgen, "sin propuesta no hay nada que decidir antes").not.toContain("una propuesta sin decidir");
    expect(linea(false, false, true), "con propuesta, la línea dice que hay una sin decidir").toContain(
      "una propuesta sin decidir",
    );
    expect(linea(true, false, true)).toContain("una propuesta sin decidir");

    const virgenConPropuesta = linea(false, false, true);
    expect(virgenConPropuesta).toContain("«Generar cronograma»");
    expect(virgenConPropuesta, "«Generar» SE VE con una propuesta solo de fases").not.toContain("NO se ve");
    /* ⚠ REESCRITA en E1 del borrador (2026-09-24), con esta razón: pedía «primero se acepta o se
       descarta cada uno», y desde E1 la propuesta ya no se resuelve uno por uno ni existe el botón
       «Revisar…» de cada ítem: se revisa en su barra (se desmarca lo que no va y «Aplicar», o
       «Descartar»). La guarda sigue pidiendo lo mismo de fondo: que antes de generar se decida la
       propuesta, con los botones que la pantalla SÍ muestra. */
    expect(virgenConPropuesta, "con material, la ruta pide decidir los cambios de fases antes").toContain(
      "primero se revisa la propuesta en su barra",
    );

    for (const publicado of [false, true]) {
      const conIa = linea(true, publicado, false);
      expect(conIa).toContain("«Regenerar todo el cronograma»");
      expect(conIa).toContain("permiso de regenerar");
      expect(conIa).not.toContain("NO se ve");

      const conIaYPropuesta = linea(true, publicado, true);
      expect(conIaYPropuesta, "con una propuesta pendiente «Regenerar todo» no se ve").toContain("hoy NO se ve");
      expect(conIaYPropuesta).toContain("Primero se revisa la propuesta en su barra");
    }

    // Ninguna línea cita el botón por ítem que ya no existe; las que hablan de la propuesta nombran
    // los dos que sí (ver «el chat solo cita botones que la pantalla muestra», más abajo).
    for (const l of [virgenConPropuesta, linea(true, false, true)]) {
      expect(l).not.toContain("«Revisar…»");
      expect(l).toContain("«Aplicar»");
      expect(l).toContain("«Descartar»");
    }

    for (const d of [false, true]) {
      for (const p of [false, true]) {
        for (const c of [false, true]) {
          const l = linea(d, p, c);
          expect(l.startsWith("PARA REHACER TODO"), "el prompt busca la línea por su comienzo").toBe(true);
          expect(l.length, "la línea se come el techo del prefijo").toBeLessThan(420);
        }
      }
    }
  });

  it("#16 · con cambios de fases sin decidir, el modelo SABE que lo que acuerde no se aplica", () => {
    /* Revisión adversarial (2026-09-24): la pantalla corta el «Aplicar» del chat mientras haya una
       propuesta de fases pendiente (del handoff o de «Regenerar todo»), pero el modelo no lo sabía:
       armaba la lista numerada y ofrecía «Aplicar», que fallaba siempre. La edición que la pone en
       rojo: sacar la línea del contexto, o que deje de depender de la propuesta pendiente. */
    expect(lineaDeCambiosDeFasesSinDecidir(false)).toBe("");
    const linea = lineaDeCambiosDeFasesSinDecidir(true);
    expect(linea).toContain("NINGÚN cambio que acuerdes se puede aplicar");
    expect(linea, "tiene que decirlo ANTES de armar la lista").toContain("dilo ANTES de armar la lista");
    /* E1 (2026-09-24): la línea citaba el botón «Revisar…» y «aceptar o descartar esas sugerencias»,
       que ya no existen. La edición que la pone en rojo: volver a citarlos. */
    expect(linea).not.toContain("«Revisar…»");
    expect(linea).not.toContain("aceptar o descartar");
    expect(linea).toContain("«Aplicar»");
    expect(linea).toContain("«Descartar»");
    /* E2a P3 (2026-09-25): la propuesta de «Regenerar todo» trae fases Y tareas. La edición que la
       pone en rojo: volver a decirle al modelo que lo abierto son solo «cambios de fases» (le haría
       creer que las tareas se pueden tocar), o alargarla hasta comerse el techo del prefijo. */
    expect(linea).toContain("HAY UNA PROPUESTA DEL CRONOGRAMA SIN DECIDIR");
    expect(linea).toContain("«Regenerar todo» con fases y tareas");
    expect(linea, "la línea vuelve a hablar solo de fases").not.toMatch(/cambios de fases/i);
    expect(linea.length).toBeLessThan(420);
    expect(src).toContain('...(propuestasPendientes > 0 ? ["", lineaDeCambiosDeFasesSinDecidir(true)] : [])');
    // El desenlace fallido que guarda el hilo no queda con «..» (el motivo de la pantalla ya trae punto).
    const handler = fs.readFileSync(path.join(RAIZ, "lib/asistente/handler.ts"), "utf8");
    expect(handler).toContain('(detalle || "el editor rechazó el cambio").replace(/[\\s.]+$/, "")');
  });

  it("⛔ el encabezado de las reglas ya no promete un modificador que ejecuta la instrucción", () => {
    /* El chat del cronograma emite operaciones que el código escribe TAL CUAL. «REGLAS DURAS DEL
       MODIFICADOR (lo que va a pasar cuando ejecute la instrucción)» le decía que después corría
       otro modelo con contexto — contradictorio desde que lee las reuniones él mismo.
       La edición que la pone en rojo: volver al encabezado viejo. */
    expect(soloCodigo(src)).not.toContain("REGLAS DURAS DEL MODIFICADOR");
    expect(src).toContain("REGLAS DURAS DEL CRONOGRAMA");
  });
});

describe("⭐ el chat del cronograma lee el «Contexto del cronograma» — por UNA puerta (decisión de Elías 2026-09-23)", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  /** El cuerpo de una función exportada de un archivo, hasta la siguiente `export`. */
  const tramoDe = (src: string, firma: string) => {
    const i = src.indexOf(firma);
    if (i < 0) return "";
    const j = src.indexOf("\nexport ", i + 1);
    return src.slice(i, j < 0 ? undefined : j);
  };

  it("⛔ el único archivo de lib/asistente que nombra la puerta es contexto.ts", () => {
    /* Si turno.ts o handler.ts la importaran directo, saltearían el try/catch de
       `materialDelCronograma` (un material ilegible volvería el turno un 502) y habría dos
       lugares donde decidir qué lee el chat. La edición que la pone en rojo: importar
       `cargarMaterialParaElChat` en turno.ts. */
    const quienes = archivosDelAsistente().filter((f) =>
      soloCodigo(fs.readFileSync(path.join(RAIZ, f), "utf8")).includes("cargarMaterialParaElChat"),
    );
    expect(quienes.map((f) => f.split(path.sep).join("/"))).toEqual(["lib/asistente/contexto.ts"]);
  });

  it("⛔ y se lee SOLO en la pieza cronograma", () => {
    /* Los kickoffs, la Entrega y Roles no tienen por qué pagar la lectura de las reuniones.
       La edición que la pone en rojo: subir el Promise.all arriba del `if` del cronograma. */
    const turno = soloCodigo(leer("lib/asistente/turno.ts"));
    const i = turno.indexOf("async function contextoDeLaPieza");
    const fn = turno.slice(i, turno.indexOf("\n}", i));
    const iCrono = fn.indexOf("pieza === PIEZA_CRONOGRAMA");
    const iRol = fn.indexOf('"roleId" in dueno');
    const lecturas = [...fn.matchAll(/materialDelCronograma\(/g)].map((m) => m.index!);
    expect(iCrono, "se movió la rama del cronograma").toBeGreaterThan(-1);
    expect(iRol, "se movió la rama de Roles").toBeGreaterThan(-1);
    expect(lecturas.length, "el chat del cronograma dejó de leer el material").toBeGreaterThan(0);
    expect(
      lecturas.filter((i) => i < iCrono || i > iRol),
      "el material se lee también fuera de la rama del cronograma: los demás documentos pagan la lectura",
    ).toEqual([]);
  });

  it("⭐ con el presupuesto DEL CHAT, sin la ubicación de cada reunión y con el rótulo del chat", () => {
    /* Con el presupuesto de los agentes el chat pagaría hasta 48.000 de reuniones por turno; con
       la ubicación, cada cambio de fases cambiaría el bloque y volvería a cobrar la caché.
       ⚠ ACTUALIZADO 2026-09-24 (revisión del paso C): la llamada suma `lector: "chat"`, así los
       rótulos de las reuniones y las notas no le nombran el handoff, que el chat no tiene. La
       conducta la fija lib/contexto/cargar-material.test.ts llamando a la puerta.
       Las ediciones que la ponen en rojo: llamar `cargarMaterialDelCronograma(projectId)` sin el
       segundo argumento, o sacar `sinUbicacion` o el `lector`. */
    const tramo = tramoDe(soloCodigo(leer("lib/contexto/cargar.ts")), "export async function cargarMaterialParaElChat(");
    expect(tramo.length, "la guarda no está mirando la puerta").toBeGreaterThan(200);
    expect(tramo).toContain(
      'cargarMaterialDelCronograma(projectId, { ...PRESUPUESTO_DEL_CHAT, sinUbicacion: true, lector: "chat" })',
    );
    expect(tramo, "el chat dejó de leer las instrucciones adicionales").toContain("docBriefFrom(");
    expect(PRESUPUESTO_DEL_CHAT).toEqual({ topeReuniones: 16_000, maxALeer: 24 });
  });

  it("⛔ el bloque del chat tiene techo, y el peor caso real entra ENTERO debajo de él", () => {
    /* Las ediciones que la ponen en rojo: subir `topeReuniones` a 24.000 (el peor caso ya no entra
       y el final de las notas se corta), o sacar el `.slice(0, TECHO…)` del armado. */
    expect(TECHO_DEL_MATERIAL_DEL_CHAT_CHARS).toBeLessThanOrEqual(42_000);
    expect(PRESUPUESTO_DEL_CHAT.topeReuniones + TOPE_NOTAS_CRONOGRAMA + TOPE_INSTRUCCIONES_DEL_DOC).toBeLessThan(
      TECHO_DEL_MATERIAL_DEL_CHAT_CHARS,
    );

    const AHORA = Date.UTC(2026, 8, 23, 18);
    const peorCaso = (largoDelTitulo: number) => {
      /* 60 elegidas de 10.000 caracteres (se leen las 24 más recientes), títulos largos, 10 notas
         de 2.000 (pasan su tope) e instrucciones de más. */
      const elegidas: ReunionElegida[] = Array.from({ length: 60 }, (_, i) => ({
        id: `r${String(i).padStart(2, "0")}`,
        title: "T".repeat(largoDelTitulo),
        date: AHORA - (i + 1) * 86_400_000,
        prefijoDeSala: "[PUERTAS ADENTRO] ",
        lectura:
          i < PRESUPUESTO_DEL_CHAT.maxALeer
            ? { tipo: "leida" as const, texto: "x ".repeat(5_000), esencial: 4_000 }
            : { tipo: "sin-leer" as const },
      }));
      const notas = Array.from({ length: 10 }, (_, i) => ({
        title: `Nota ${i}`,
        content: "n ".repeat(1_000),
        createdAt: new Date(AHORA),
      }));
      const plan = planDelMaterial({ elegidas, notas, topeReuniones: PRESUPUESTO_DEL_CHAT.topeReuniones });
      // Con el rótulo del chat, como los arma la puerta (`lector: "chat"`).
      const notasDelBloque = bloqueDeNotasDelCronograma(notas, "chat");
      const bloque = bloqueDelMaterialParaElChat({
        reuniones: bloqueDeReunionesDelCronograma(plan.reuniones, "chat"),
        notas: notasDelBloque,
        informe: plan.informe,
        instrucciones: "i".repeat(TOPE_INSTRUCCIONES_DEL_DOC + 1_000),
        ahora: AHORA,
      });
      return { plan, bloque, notasDelBloque };
    };

    // Títulos de 100 caracteres (los de verdad miden menos): entra ENTERO, sin tocar el techo.
    const real = peorCaso(100);
    expect(real.plan.reuniones.reduce((s, r) => s + (r.contenido ?? "").length, 0)).toBeLessThanOrEqual(
      PRESUPUESTO_DEL_CHAT.topeReuniones,
    );
    expect(real.bloque.length).toBeLessThanOrEqual(TECHO_DEL_MATERIAL_DEL_CHAT_CHARS);
    expect(
      real.bloque.endsWith(real.notasDelBloque.trim()),
      "el peor caso real ya no entra entero: el techo corta el final de las notas",
    ).toBe(true);

    // Con títulos absurdos el techo corta, pero nunca se pasa.
    expect(peorCaso(2_000).bloque.length).toBeLessThanOrEqual(TECHO_DEL_MATERIAL_DEL_CHAT_CHARS);
  });

  it("⚠ si el material falla, el chat sigue: el aviso de que no se pudo leer y la lectura con el error", async () => {
    /* Una transcripción ilegible, la base lenta o `unstable_cache` fuera de Next no pueden volver
       el turno un 502: contesta con el cronograma y la pantalla lo dice en ámbar.
       ⚠ ACTUALIZADO 2026-09-24 (revisión del paso C): esperaba `texto: ""`. Con el texto vacío el
       modelo entendía «el CSE no eligió nada» y le pedía elegir reuniones que ya había elegido. Ahora
       el texto es `AVISO_DEL_MATERIAL_ILEGIBLE`, y el prompt dice qué hacer con él.
       Las ediciones que la ponen en rojo: sacar el try/catch de `materialDelCronograma`, o volver
       a devolver el texto vacío. */
    h.cargarMaterialParaElChat.mockRejectedValueOnce(new Error("transcripción ilegible"));
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await materialDelCronograma("p1");
    aviso.mockRestore();
    expect(m.texto, "el modelo no se entera de que la lectura falló").toBe(AVISO_DEL_MATERIAL_ILEGIBLE);
    expect(m.texto).toContain("NO SE PUDO LEER");
    expect(m.texto, "el aviso le pide al CSE elegir lo que quizá ya eligió").toContain("no le pidas que las elija");
    expect(m.interno).toEqual([]);
    expect(m.lectura.error).toBe(true);

    h.cargarMaterialParaElChat.mockResolvedValueOnce({
      texto: "=== MATERIAL ===",
      lectura: { error: undefined },
      materialInterno: ["algo"],
    });
    const bien = await materialDelCronograma("p1");
    expect(bien.texto).toBe("=== MATERIAL ===");
    expect(bien.interno).toEqual(["algo"]);
  });

  it("⭐ la pantalla dice qué leyó el chat, y los textos del cajón están en tuteo", () => {
    /* La edición que la pone en rojo: no guardar `lectura` de la respuesta del turno (la línea no
       aparece nunca), no devolverla desde el handler, o volver un texto del cajón al voseo. */
    const handler = soloCodigo(leer("lib/asistente/handler.ts"));
    expect(handler, "el handler dejó de devolver qué leyó el turno").toContain(
      "return NextResponse.json({ ...aVista(fresco), acuerdo, lectura });",
    );
    const panel = leer("components/asistente/ChatDelAsistente.tsx");
    expect(panel, "el cajón dejó de guardar qué leyó el turno").toContain("setLectura(j.lectura ?? null)");
    expect(panel, "el cajón dejó de pintar la línea de lectura").toContain("{lineaDeLectura(lectura)}");
    expect(panel, "la línea de un error dejó de verse en ámbar").toContain('lectura.error ? "text-warn-ink"');
    const visibles = soloCodigo(panel);
    for (const voseo of ["Conversá", "Preguntale", "Recargá", "recargá", "Podés", "Contestá", "Copiá", "pegala", "Escribí", "querés"]) {
      expect(visibles.includes(voseo), `el cajón volvió al voseo: «${voseo}»`).toBe(false);
    }
  });
});
