import { describe, expect, it } from "vitest";
import {
  crearRelecturaAlVolver,
  decidirRefrescoTrasHandoff,
  debeReemplazarPropuesta,
  esLaMismaMasVieja,
} from "./refresco-tras-handoff";
import { reconcileAgentProposal } from "./reconcile-proposal";
import { borradorDelHandoff } from "./borrador";

/**
 * lib/timeline/refresco-tras-handoff.test.ts — EL AVISO NO PUEDE QUEDAR HUÉRFANO.
 *
 * El síntoma que originó esto: al regenerar un handoff aparecía «El cronograma tiene una propuesta
 * sin revisar» y el cronograma no mostraba nada hasta recargar a mano. La señal llegaba; el canvas
 * la descartaba porque solo actuaba con el cronograma vacío.
 *
 * El modo de falla de este arreglo NO es que alguien lo rompa a propósito: es que alguien vuelva a
 * meter una condición «para no molestar al que está editando» sin notar que el camino nuevo no
 * escribe nada editable. Por eso la invariante se escribe como tabla, no como un caso suelto.
 */

describe("⭐ el caso que hoy muere mudo: hay fases, y el handoff dejó propuesta", () => {
  it("con fases en pantalla trae la propuesta — no se queda quieto", () => {
    /* Este assert FALLA contra el código anterior (`if (phases.length === 0) load()`), que para
       esta entrada no hacía nada. Un test que no distingue el antes del después no sirve. */
    expect(decidirRefrescoTrasHandoff({ hayFases: true, cargando: false })).toBe("solo-propuesta");
  });

  it("⛔ INVARIANTE: con fases, NINGUNA entrada puede terminar sin actuar", () => {
    /* La tabla es el punto: si mañana alguien suma otra condición (un `!dirty`, un `!saving`) para
       «no molestar», este assert se cae. Y esa condición no haría falta: el camino de solo-propuesta
       no toca `phases`, ni `dirty`, ni `particularidadesDirty`, ni las selecciones del banner. */
    for (const cargando of [true, false]) {
      expect(
        decidirRefrescoTrasHandoff({ hayFases: true, cargando }),
        `con fases y cargando=${cargando} el aviso quedó huérfano`,
      ).toBe("solo-propuesta");
    }
  });
});

describe("el cronograma vacío conserva la conducta que ya funcionaba", () => {
  it("vacío y quieto: recarga entero, que es como nacen las fases del handoff", () => {
    expect(decidirRefrescoTrasHandoff({ hayFases: false, cargando: false })).toBe("recargar-todo");
  });

  it("vacío y con una carga en vuelo: espera, y el llamador NO consume la señal", () => {
    /* Antes el ref avanzaba ANTES de evaluar la condición, así que una señal descartada se perdía
       para siempre. «esperar» existe para que el canvas pueda reintentar al terminar la carga. */
    expect(decidirRefrescoTrasHandoff({ hayFases: false, cargando: true })).toBe("esperar");
  });
});

/**
 * ⭐ EL CRUCE CON EL SERVIDOR — lo que hace honesta a la guarda.
 *
 * El cliente decide «traer la propuesta» mirando si hay fases; el servidor decide «guardar
 * propuesta» por su propio criterio (`reconcileAgentProposal`). Si esas dos mitades se separan, el
 * aviso vuelve a quedar huérfano y nadie se entera. Este bloque las ata.
 */
describe("⭐ cuando el servidor guarda propuesta, el cliente la va a buscar", () => {
  it("una regeneración real sobre un cronograma con fases: el servidor propone y el cliente trae", () => {
    const existe = (id: string, name: string, durationWeeks: number) => ({
      id,
      name,
      durationWeeks,
      startWeek: null,
      sessionCount: null,
      notes: null,
      activityType: null,
    });
    const existentes = [existe("f1", "Kickoff", 2), existe("f2", "Configuración", 3)];
    const prop = (name: string, durationWeeks: number) => ({
      name,
      durationWeeks,
      startWeek: null,
      sessionCount: null,
      notes: null,
    });
    const propuestas = [
      prop("Kickoff", 2),
      prop("Configuración", 5), // el agente re-estimó
      prop("Capacitación", 2), // y sumó una fase
    ];

    const r = reconcileAgentProposal(propuestas, existentes, null, null);
    expect(r.isNoOp, "el servidor no guardaría propuesta: el fixture no representa el caso").toBe(
      false,
    );
    // E2b: el servidor guarda solo si el borrador del handoff tiene algo aplicable (lib/timeline/borrador-del-handoff.ts).
    expect(
      borradorDelHandoff({ propuesta: r, vivo: { ancla: null, fases: existentes } }),
      "el servidor no guardaría propuesta: el fixture no representa el caso",
    ).not.toBeNull();

    // Y con ESAS mismas fases en pantalla, el cliente tiene que ir a buscarla.
    expect(
      decidirRefrescoTrasHandoff({ hayFases: existentes.length > 0, cargando: false }),
      "el servidor guardó una propuesta que el cliente nunca va a pedir",
    ).not.toBe("esperar");
    expect(decidirRefrescoTrasHandoff({ hayFases: true, cargando: false })).toBe("solo-propuesta");
  });
});

describe("qué propuesta gana la pantalla", () => {
  /* Se retiró «Pedir cambio con IA» (E4): sin su vista previa en memoria, `esDeAssist` y su caso («nunca
     pisa una vista previa del assist») se fueron con ella. */
  const base = { hayPropuesta: true, runIdEnPantalla: "r1", runIdNuevo: "r2" };

  it("sin nada en pantalla, siempre entra la nueva", () => {
    expect(debeReemplazarPropuesta({ ...base, hayPropuesta: false })).toBe(true);
  });

  it("del servidor contra el servidor: gana la corrida nueva", () => {
    /* Sin esto, una segunda regeneración dejaba en pantalla la propuesta VIEJA — el cartel diciendo
       que hay algo nuevo y el canvas mostrando lo anterior, sin nada que lo delate. */
    expect(debeReemplazarPropuesta(base)).toBe(true);
  });

  it("la misma corrida no se re-pisa (evita parpadeos por señales repetidas)", () => {
    expect(debeReemplazarPropuesta({ ...base, runIdNuevo: "r1" })).toBe(false);
  });

  it("si el servidor no trae propuesta, no se borra la que hay", () => {
    expect(debeReemplazarPropuesta({ ...base, runIdNuevo: null })).toBe(false);
  });
});

/**
 * E3 P3 (2026-09-25) — LA MISMA PROPUESTA, MÁS NUEVA. Desde E3 lo desmarcado se guarda en el servidor y
 * cada casilla (y lo que edita el chat) sube la versión del `borrador-v1`. Al volver a la pestaña, lo que
 * marcó otra computadora tiene que verse; y un GET que salió antes de una escritura nunca baja la versión.
 */
describe("E3 · la misma corrida: gana la versión mayor, y la de pantalla nunca baja", () => {
  const base = { hayPropuesta: true, runIdEnPantalla: "r1", runIdNuevo: "r1" };

  it("⭐ la misma corrida con una versión MAYOR reemplaza; igual o menor, no", () => {
    /* La edición que la pone en rojo: volver a comparar solo la corrida (lo que marcó otra computadora no
       llegaría nunca: es el mismo token), o reemplazar con una igual o menor (parpadeo, o lo recién
       desmarcado volvería a verse marcado). */
    expect(debeReemplazarPropuesta({ ...base, versionEnPantalla: 3, versionNueva: 4 })).toBe(true);
    expect(debeReemplazarPropuesta({ ...base, versionEnPantalla: 4, versionNueva: 4 })).toBe(false);
    expect(debeReemplazarPropuesta({ ...base, versionEnPantalla: 5, versionNueva: 4 })).toBe(false);
    // Sin versiones que comparar (el formato viejo), la regla de antes: la misma corrida no se re-pisa.
    expect(debeReemplazarPropuesta(base)).toBe(false);
    expect(debeReemplazarPropuesta({ ...base, versionEnPantalla: null, versionNueva: 4 })).toBe(false);
  });

  it("otra corrida gana siempre, sin mirar versiones (una propuesta nueva arranca en 0)", () => {
    expect(debeReemplazarPropuesta({ ...base, runIdNuevo: "r2", versionEnPantalla: 7, versionNueva: 0 })).toBe(true);
  });

  it("⭐ `esLaMismaMasVieja`: solo la MISMA corrida con una versión menor que la de pantalla", () => {
    /* `traerPropuestaPendiente` no pone lo que lee si es esto. La edición que la pone en rojo: comparar sin
       la corrida (una propuesta nueva, versión 0, quedaría fuera), o dejar pasar una menor. */
    expect(esLaMismaMasVieja({ runId: "r1", version: 5 }, { runId: "r1", version: 4 })).toBe(true);
    expect(esLaMismaMasVieja({ runId: "r1", version: 5 }, { runId: "r1", version: 5 })).toBe(false);
    expect(esLaMismaMasVieja({ runId: "r1", version: 5 }, { runId: "r1", version: 6 })).toBe(false);
    expect(esLaMismaMasVieja({ runId: "r1", version: 5 }, { runId: "r2", version: 0 }), "una propuesta nueva quedó fuera").toBe(false);
    expect(esLaMismaMasVieja({ runId: null, version: null }, { runId: "r1", version: 0 })).toBe(false);
    expect(esLaMismaMasVieja({ runId: "r1", version: 5 }, { runId: "r1", version: null })).toBe(false);
  });
});

/**
 * ── REVISIÓN DE E3 (#23): UNA RELECTURA AL VOLVER A LA PESTAÑA ──────────────────────────────────────────
 * `visibilitychange` y `focus` llegan juntos al volver, y cada uno hacía un GET completo del cronograma. Se
 * corre con un reloj falso y una relectura que termina cuando el test quiere.
 */
describe("⭐ revisión de E3 (#23) · volver a la pestaña relee UNA vez", () => {
  function montar(espera = 2000) {
    let t = 1_000_000;
    const pendientes: Array<() => void> = [];
    let lecturas = 0;
    const releer = () => {
      lecturas++;
      return new Promise<void>((ok) => pendientes.push(ok));
    };
    const alVolver = crearRelecturaAlVolver(releer, { ahora: () => t, espera });
    const terminar = async () => {
      pendientes.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    };
    return { alVolver, terminar, avanzar: (ms: number) => (t += ms), lecturas: () => lecturas };
  }

  it("⛔ `visibilitychange` y `focus` juntos: un solo GET", () => {
    /* Las ediciones que la ponen en rojo: releer en cada señal (dos GET al volver), o no mirar la que está en
       vuelo. */
    const r = montar();
    r.alVolver(); // visibilitychange
    r.alVolver(); // focus, detrás
    expect(r.lecturas(), "volver a la pestaña hizo dos relecturas").toBe(1);
  });

  it("⛔ con una relectura en vuelo no sale otra, aunque haya pasado la espera", async () => {
    const r = montar();
    r.alVolver();
    r.avanzar(5000);
    r.alVolver();
    expect(r.lecturas(), "salió otra relectura con una en vuelo").toBe(1);
    await r.terminar();
    r.alVolver();
    expect(r.lecturas(), "terminada la primera, volver otra vez relee").toBe(2);
  });

  it("⛔ la que llega detrás, ya terminada la primera, no relee; pasada la espera, sí (cuándo se relee no cambia)", async () => {
    /* La edición que la pone en rojo: soltar la espera (el `focus` que llega tras un GET rápido relee otra vez),
       o no volver a leer nunca (lo que marcó otra computadora no se vería hasta recargar). */
    const r = montar(2000);
    r.alVolver();
    await r.terminar();
    r.avanzar(500);
    r.alVolver();
    expect(r.lecturas(), "la señal de atrás releyó").toBe(1);
    r.avanzar(2000);
    r.alVolver();
    expect(r.lecturas(), "una vuelta de verdad, después, no relee").toBe(2);
  });

  it("una relectura que falla no deja la vuelta trabada", async () => {
    let t = 0;
    let lecturas = 0;
    const alVolver = crearRelecturaAlVolver(
      () => {
        lecturas++;
        return Promise.reject(new Error("red"));
      },
      { ahora: () => t },
    );
    alVolver();
    await new Promise((r) => setTimeout(r, 0));
    t += 3000;
    alVolver();
    expect(lecturas, "después de una que falló, no vuelve a leer").toBe(2);
    // Y una que tira en el acto, tampoco.
    const tira = crearRelecturaAlVolver(() => {
      throw new Error("x");
    });
    expect(() => tira()).not.toThrow();
  });
});
