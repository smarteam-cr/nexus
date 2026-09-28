/**
 * lib/flow/resumen-del-proyecto.test.ts
 *
 * Correr: `npx vitest run lib/flow/resumen-del-proyecto.test.ts --project unit`.
 *
 * El 2026-09-27 la ficha de un proyecto dejó de abrir por un documento y pasó a abrir por el
 * **Resumen**: el brief, el widget de la cuenta y el handoff, que hasta ese día se pintaban
 * arriba de las nueve piezas y por eso se repetían en las nueve.
 *
 * ── LO QUE ESA DECISIÓN VUELVE FRÁGIL ────────────────────────────────────────
 * «Sin `?canvas=` se abre el Resumen» convierte en trampa a **cualquier enlace que quiera
 * llevar a un documento y no lleve el parámetro**: no falla, no tira, no se ve roto — lleva a
 * otra pantalla. Ya mordió una vez en esta misma tanda (el «Revisar» del aviso de propuesta
 * de cronograma, que prometía el Gantt y dejaba a la persona en el widget).
 *
 * Las tres piezas del arreglo se sostienen acá porque ningún tipo las protege: el panel puede
 * dejar de resolver el slug y todo seguiría compilando, y el enlace puede perder el parámetro
 * sin que nada se ponga rojo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vistaDeLaUrl } from "./vista-de-la-url";
import { canvasDelResultado } from "@/lib/agents/run-url";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const PANEL = leer("components/clients/ProjectCanvasPanel.tsx");
const AVISO = leer("components/projects/TimelineProposalPendiente.tsx");
const CRONOGRAMA = leer("components/canvas/CronogramaCanvas.tsx");
const WORKSPACE = leer("app/(shell)/clients/[id]/WorkspaceClient.tsx");
const HANDOFF_UI = leer("components/clients/ProjectHandoffSection.tsx");
const HANDOFF_GET = leer("app/api/projects/[projectId]/handoff/route.ts");
const CORRIDAS = leer("app/api/agent-runs/route.ts");
const PROPUESTA = leer("app/api/projects/[projectId]/timeline/proposal/route.ts");
const FICHA_UI = leer("components/clients/FichaDelCliente.tsx");

describe("el Resumen es la vista por defecto del proyecto", () => {
  it("se define por la AUSENCIA del parámetro, no por un estado suelto", () => {
    /* Que salga de la URL es lo que hace que un enlace pegado abra lo mismo que veía quien lo
       pegó. Con un `useState(true)` a secas, recargar en un documento te devolvía al resumen. */
    /* 2026-09-28: sale de la URL a través de `vistaDeLaUrl`, que además manda al Resumen un
       `?canvas=` que no es de este proyecto. Sigue sin ser un estado suelto. */
    expect(PANEL).toContain("vistaDeLaUrl(seeded ?? [], urlDeOtroProyecto ? null : canvasFromUrl, seeded !== null)");
    expect(PANEL, "volvió un estado suelto para el Resumen").not.toMatch(/setEnResumen\] = useState\((true|false)\)/);
  });

  it("elegir un documento SIEMPRE escribe el parámetro, incluso el que es `isDefault`", () => {
    /* La URL sin parámetro ya significa «resumen». Si `switchCanvas` siguiera omitiéndolo para
       el canvas por defecto —como hacía antes—, el kickoff quedaría en una dirección que abre
       el resumen: el enlace parece bien y lleva a otro lado. */
    expect(PANEL).toContain('url.searchParams.set("canvas", canvasId)');
    expect(PANEL, "volvió el atajo que dejaba al canvas por defecto sin parámetro").not.toContain(
      'url.searchParams.delete("canvas");\r\n    } else {',
    );
  });
});

describe("el widget y el handoff se pintan UNA vez, adentro del Resumen", () => {
  it("no vuelven arriba de todos los documentos", () => {
    /* Es el motivo entero de la tanda: montados fuera del gate, el brief, el widget y el
       handoff se repiten en las nueve piezas y empujan el desplegable fuera de vista. */
    /* 2026-09-28: el gate pasó de `{enResumen && …}` (desmontaba) a `hidden` (oculta). Sigue siendo
       un gate: se ven SOLO en el Resumen. Ver el describe «el Resumen se oculta, no se desmonta». */
    const i = PANEL.indexOf("<div hidden={!enResumen}");
    expect(i, "desapareció el gate del Resumen").toBeGreaterThan(-1);
    const bloque = PANEL.slice(i, i + 400);
    expect(bloque).toContain("<ProjectGPS");
    expect(bloque).toContain("<ProjectHandoffSection");
    // Y una sola vez cada uno en todo el archivo: montarlos dos veces es el defecto viejo.
    expect((PANEL.match(/<ProjectGPS/g) ?? []).length).toBe(1);
    expect((PANEL.match(/<ProjectHandoffSection/g) ?? []).length).toBe(1);
  });
});

describe("los enlaces que apuntan a un DOCUMENTO llevan el parámetro", () => {
  it("el panel resuelve `?canvas=` por id o por SLUG", () => {
    /* Sin la resolución por slug, un enlace externo tendría que conocer el id del canvas —que
       es una fila distinta en cada proyecto—, o sea que no podría existir. */
    /* 2026-09-28: la búsqueda se mudó a lib/flow/vista-de-la-url.ts (una sola regla para el primer
       paint y los cambios de URL). Se prueba por comportamiento: «por id o por slug es ese
       documento», más abajo. Acá, que el panel la use. */
    expect(PANEL).toContain("buscarDocumento(lista, pedido)");
    expect(leer("lib/flow/vista-de-la-url.ts")).toContain("lista.find((c) => slugForCanvas(c) === pedido)");
  });

  it("el «Revisar» de la propuesta de cronograma abre el Cronograma, no el Resumen", () => {
    expect(
      AVISO,
      "el aviso promete llevar a la propuesta y sin `canvas=timeline` deja en el widget",
    ).toContain("&canvas=timeline#cronograma-gantt");
  });
});

describe("cambiar de documento no deja el panel en el esqueleto", () => {
  /* Visto en producción el 2026-09-28: al elegir otro documento en el desplegable, la pantalla se
     quedaba en el esqueleto hasta recargar. `switchCanvas` hacía `setLoading(true)` y lo único que
     lo apagaba era el fetch de las tarjetas del Resumen viejo, retirado en 14b8c920. Ahora el efecto
     que apaga `loading` depende SOLO de `listLoaded`, que no vuelve a cambiar después de la primera
     carga: cualquier `setLoading(true)` posterior cuelga la pantalla. La edición que la pone en rojo:
     volver a poner `setLoading(true)` en `switchCanvas` (o en cualquier otro lado del panel). */
  const CODIGO = PANEL.replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

  it("el panel nunca vuelve a prender su esqueleto después de montar", () => {
    expect(CODIGO, "el esqueleto del panel se prende otra vez y nada lo apaga").not.toContain("setLoading(true)");
  });

  it("lo apaga que vuelva la lista, y nada más", () => {
    expect(CODIGO).toContain("if (listLoaded) setLoading(false);");
    const i = CODIGO.indexOf("const switchCanvas = useCallback(");
    expect(i, "cambió la forma de switchCanvas; revisar esta guarda").toBeGreaterThan(-1);
    const cuerpo = CODIGO.slice(i, CODIGO.indexOf("}, [", i));
    expect(cuerpo.length, "la guarda no está mirando switchCanvas").toBeGreaterThan(200);
    expect(cuerpo).not.toContain("setLoading(");
  });
});

/* ── 2026-09-28: lo que dejó 14b8c920 al llevar el widget y el handoff al Resumen ──────────────
   Auditoría de estados colgados tras el deploy (workflow, dos verificadores por hallazgo). Cada
   guarda nombra la edición que la pone en rojo. */
const sinComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

describe("el Resumen se oculta, no se desmonta", () => {
  /* Con `{enResumen && …}`, ir a un documento desmontaba el widget y el handoff: se perdía el
     «Generando…» (y un segundo clic lanzaba otra corrida pagada), el widget quedaba viejo porque los
     avisos de refrescar llegaban desmontado, y las exclusiones sin guardar desaparecían. La edición
     que la pone en rojo: volver a `{enResumen && (` alrededor de ProjectGPS / ProjectHandoffSection. */
  it("el widget y el handoff viven dentro de `hidden`, nunca de un `&&`", () => {
    const codigo = sinComentarios(PANEL);
    const i = codigo.indexOf("<ProjectGPS");
    const antes = codigo.slice(Math.max(0, i - 200), i);
    expect(antes, "el widget volvió a montarse con un && (se desmonta al ir a un documento)").not.toContain(
      "enResumen && (",
    );
    expect(antes).toContain("hidden={!enResumen}");
  });
});

describe("la pantalla sigue a la URL", () => {
  const lista = [
    { id: "c-crono", slug: "timeline", name: "Cronograma" },
    { id: "c-kick", slug: "kickoff", name: "Kickoff" },
  ];
  it("sin parámetro es el Resumen", () => {
    expect(vistaDeLaUrl(lista, null, true)).toEqual({ tipo: "resumen" });
  });
  it("por id o por slug es ese documento", () => {
    expect(vistaDeLaUrl(lista, "c-kick", true)).toEqual({ tipo: "documento", canvasId: "c-kick" });
    expect(vistaDeLaUrl(lista, "timeline", true)).toEqual({ tipo: "documento", canvasId: "c-crono" });
  });
  /* El caso de producción: el `?canvas=` del proyecto anterior al cambiar de pestaña, o el del
     handoff (que no está en el desplegable), abría el PRIMER documento. La edición que la pone en
     rojo: devolver `lista[0]` cuando el pedido no resuelve. */
  it("un canvas que no es de este proyecto abre el Resumen, no el primer documento", () => {
    expect(vistaDeLaUrl(lista, "c-de-otro-proyecto", true)).toEqual({ tipo: "resumen" });
  });
  it("sin la lista todavía, no decide", () => {
    expect(vistaDeLaUrl([], "c-kick", false)).toEqual({ tipo: "esperar" });
  });
  it("el panel la usa al montar Y cada vez que cambia la URL", () => {
    const codigo = sinComentarios(PANEL);
    expect(codigo).toContain('vistaDeLaUrl(seeded ?? [], urlDeOtroProyecto ? null : canvasFromUrl, seeded !== null).tipo === "resumen"');
    const i = codigo.indexOf("const vista = vistaDeLaUrl(canvasesRef.current, canvasFromUrl, listLoaded);");
    expect(i, "el panel dejó de seguir a la URL después de montar").toBeGreaterThan(-1);
    expect(codigo.slice(i, i + 500)).toContain("}, [canvasFromUrl, listLoaded, cronogramaOcupado, urlDeOtroProyecto]);");
  });
});

describe("los enlaces a un resultado llevan a donde está", () => {
  it("el handoff vive en el Resumen: su enlace va sin canvas", () => {
    expect(canvasDelResultado({ canvasId: "c-handoff", canvasSlug: "handoff", agentGroup: "handoff" })).toBeNull();
  });
  it("el cronograma no escribe bloques: va por el slug", () => {
    expect(canvasDelResultado({ canvasId: null, canvasSlug: null, agentGroup: "cronograma" })).toBe("timeline");
  });
  it("cualquier otro documento, por su id", () => {
    expect(canvasDelResultado({ canvasId: "c-kick", canvasSlug: "kickoff", agentGroup: "kickoff" })).toBe("c-kick");
  });
  it("el centro de corridas y el aviso del cronograma la usan", () => {
    expect(sinComentarios(CORRIDAS)).toContain("canvasId: canvasDelResultado({");
    expect(CRONOGRAMA).toContain("?tab=${encodeURIComponent(projectId)}&canvas=timeline`");
  });
});

describe("«Ir a la etapa» cambia al Resumen antes de hacer scroll", () => {
  /* El bloque «Etapa» vive en el widget, oculto mientras se mira el cronograma: el scroll no hacía
     nada. La edición que la pone en rojo: sacar la rama de ANCHORS.etapa, o no pasarle
     `onIrAlResumen` al cronograma. */
  it("el cronograma deriva la etapa al panel, y el panel se la pasa", () => {
    expect(sinComentarios(CRONOGRAMA)).toContain("if (target.anchor === ANCHORS.etapa && onIrAlResumen) return onIrAlResumen(target.anchor);");
    expect(sinComentarios(PANEL)).toContain("onIrAlResumen={irAlResumenEn}");
  });
});

describe("el aviso de propuesta del rail se entera de los cambios", () => {
  /* Era un dato del servidor que nada renovaba: al aplicar o descartar seguía encendido y al
     regenerar el handoff no aparecía. La edición que la pone en rojo: sacar el refresh. */
  it("relee la propuesta cuando el cronograma o el handoff avisan (sin recargar la página)", () => {
    /* Revisión de 3897d105: `router.refresh()` recargaba la página entera —que consulta HubSpot— por
       cada aviso. Se relee solo la propuesta. La edición que la pone en rojo: sacar el fetch, o que el
       aviso deje de leer `propuestaViva`. */
    const codigo = sinComentarios(WORKSPACE);
    const i = codigo.indexOf("const senalesVistas = useRef(");
    expect(i, "se fue la relectura del aviso del rail").toBeGreaterThan(-1);
    const tramo = codigo.slice(i, i + 1200);
    expect(tramo).toContain("/timeline/proposal`)");
    expect(tramo).not.toContain("router.refresh()");
    expect(codigo).toContain("pending={propuestaViva[activeProject.id]?.pending ?? activeProject.timelineProposalPending ?? false}");
    expect(sinComentarios(PROPUESTA)).toContain("export async function GET(");
    expect(sinComentarios(PROPUESTA)).toContain("guardAccessToProject(projectId)");
  });
});

describe("el handoff retoma la corrida que sigue en curso", () => {
  /* Recargar a mitad de una generación dejaba «Generar» habilitado: un segundo clic lanzaba otra
     corrida pagada. La edición que la pone en rojo: dejar de mandar `corridaEnCurso`, o que la
     sección no la siga. */
  it("el GET la manda (solo si no está colgada) y la sección la sigue", () => {
    const get = sinComentarios(HANDOFF_GET);
    expect(get).toContain("corridaEnCurso:");
    expect(get).toContain("!estaColgada(lastRun)");
    const ui = sinComentarios(HANDOFF_UI);
    expect(ui).toContain("const runIdEnCurso = status?.corridaEnCurso?.runId ?? null;");
    /* Revisión de 3897d105: con `track`, la corrida quedaba «anunciada» y el centro de corridas se
       callaba el «Listo / Falló». La edición que la pone en rojo: volver a `track(runIdEnCurso)`. */
    expect(ui).toContain("seguimiento = pollAgentRun(clientId, runIdEnCurso);");
    expect(ui).not.toContain("track(runIdEnCurso)");
    // Un solo seguimiento por corrida en la pestaña, y el lanzamiento se registra ahí también.
    expect(ui).toContain("SEGUIMIENTOS_DEL_HANDOFF.get(runIdEnCurso)");
    expect(ui).toContain("SEGUIMIENTOS_DEL_HANDOFF.set(data.runId, seguimiento);");
  });

  it("antes de lanzar, si ya hay una corrida viva la sigue en vez de pagar otra", () => {
    /* Dos pestañas abiertas: la que cargó antes seguía ofreciendo «Regenerar». La edición que la pone
       en rojo: sacar la consulta previa de handleGenerate. */
    const ui = sinComentarios(HANDOFF_UI);
    const i = ui.indexOf("const handleGenerate = useCallback(");
    const j = ui.indexOf("/api/clients/${clientId}/analyze", i);
    const antesDeLanzar = ui.slice(i, j);
    expect(antesDeLanzar.length, "la guarda no está mirando handleGenerate").toBeGreaterThan(300);
    expect(antesDeLanzar).toContain("if (fresco?.corridaEnCurso?.runId) {");
    /* Revisión de 4ddc67d6: tras un TIMEOUT el ref seguía con esa corrida y el aviso decía «la sigo»
       sin seguir nada; y las exclusiones escritas se perdían en ese camino. La edición que la pone en
       rojo: sacar la línea que suelta el ref, o volver a guardar las exclusiones DESPUÉS de la consulta. */
    expect(antesDeLanzar).toContain("if (retomadaRef.current === fresco.corridaEnCurso.runId) retomadaRef.current = null;");
    expect(antesDeLanzar.indexOf("contextExclusions: pendingExcl"), "las exclusiones se guardan antes de mirar la corrida viva").toBeLessThan(
      antesDeLanzar.indexOf("const fresco = await fetch("),
    );
  });
});

describe("revisión de 3897d105", () => {
  /* Hallazgos de la revisión adversarial del commit (dos verificadores por hallazgo). */
  it("el documento del handoff se desmonta cuando el Resumen no se ve (Ctrl+Z no deshace a ciegas)", () => {
    /* Montado y oculto, sus entradas de deshacer seguían en la pila: un Ctrl+Z en el Cronograma
       revertía, sin que se viera, un bloque del handoff. La edición que la pone en rojo: sacar
       `visible` de la condición, o no pasarlo desde el panel. */
    expect(sinComentarios(HANDOFF_UI)).toContain("{generated && showDoc && visible && status.canvasId && (");
    expect(sinComentarios(PANEL)).toContain("<ProjectHandoffSection projectId={projectId} clientId={clientId} visible={enResumen} />");
  });

  it("un `?canvas=` de OTRO proyecto no se aplica al abierto, y la pestaña sigue a `?tab=`", () => {
    /* El «Ver» de una corrida de otro proyecto del mismo cliente mostraba el documento de ese
       proyecto en la pestaña equivocada. La edición que la pone en rojo: sacar `urlDeOtroProyecto`
       del efecto, o el efecto de la pestaña en WorkspaceClient. */
    const panel = sinComentarios(PANEL);
    expect(panel).toContain("if (cronogramaOcupado || urlDeOtroProyecto) return;");
    expect(panel).toContain("vistaDeLaUrl(seeded ?? [], urlDeOtroProyecto ? null : canvasFromUrl, seeded !== null)");
    const ws = sinComentarios(WORKSPACE);
    const i = ws.indexOf('const tabDeLaUrl = searchParams.get("tab");');
    expect(i, "la pestaña dejó de seguir a ?tab=").toBeGreaterThan(-1);
    expect(ws.slice(i, i + 700)).toContain("if (valida) setActiveProjectId(tabDeLaUrl);");
  });

  it("«Ir al Handoff» del cronograma vacío va al Resumen, no al mismo cronograma", () => {
    expect(CRONOGRAMA).toContain("href={resumenUrl}");
    expect(CRONOGRAMA).not.toContain("href={cronogramaUrl}");
  });

  it("la corrida del paso de estructura (sin agente) también lleva al Gantt", () => {
    expect(canvasDelResultado({ canvasId: null, canvasSlug: null, agentGroup: null, agentSlug: "agent-timeline-structure" })).toBe("timeline");
    expect(sinComentarios(CORRIDAS)).toContain("agentSlug: r.agentSlug,");
  });

  it("cada «Descartar» de la ficha manda todos los descartes (dos pedidos cruzados no pierden uno)", () => {
    const ui = sinComentarios(FICHA_UI);
    expect(ui).toContain("body: JSON.stringify({ descartarCampos: todos }),");
    expect(ui).toContain("setFicha((f) => (f ? { ...f, propuesta } : j.ficha));");
  });
});
