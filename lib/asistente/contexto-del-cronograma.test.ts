/**
 * lib/asistente/contexto-del-cronograma.test.ts — CON UNA PROPUESTA ABIERTA, EL CHAT LA VE CON LOS
 * NÚMEROS DE LA BARRA, Y ENTRA EN EL TECHO SIN PERDER EL ÍNDICE (E3 P4).
 *
 * Correr: `npx vitest run lib/asistente/contexto-del-cronograma.test.ts --project unit`.
 *
 * Qué se congela acá:
 *   1. ⭐ el ÍNDICE (cada número de la barra, una vez) sale idéntico con y sin recorte;
 *   2. el recorte va en su orden: primero los «antes → después» y los motivos, después los títulos;
 *   3. los identificadores sobreviven al recorte, nunca aparece una nota de tarea y los handles no
 *      chocan aunque choquen las claves de las tareas nuevas;
 *   4. el texto es determinista;
 *   5. una propuesta enorme se manda igual, entera, y avisa;
 *   6. `contextoDeCronograma` con una propuesta abierta: el texto es el de la propuesta, pero `fases`
 *      sigue siendo el cronograma de HOY. E3 P5: editable, el chat la edita; en solo lectura, no.
 * Se imprime además la medida del peor caso realista contra el techo (no se fija: se mide).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// ── La base FALSA (hoisted): `contextoDeCronograma` y `leerPropuestaParaElChat` corren contra esto ──
const db = vi.hoisted(() => ({
  projectTimeline: { findUnique: vi.fn(), count: vi.fn() },
  agentRun: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
// La puerta del material trae cargadores pesados: acá no se usa (la lee `turno.ts`, aparte).
vi.mock("@/lib/contexto/cargar", () => ({ cargarMaterialParaElChat: vi.fn() }));

import {
  armarContextoConPropuesta,
  LINEA_DE_LA_PROPUESTA_EDITABLE,
  RECORTE_NIVEL_1,
  RECORTE_NIVEL_2,
  type ContextoConPropuesta,
  type EntradaDelContextoConPropuesta,
} from "./contexto-del-cronograma";
import { contextoDeCronograma, lineaParaRehacerTodo, TECHO_DEL_PREFIJO_CHARS } from "./contexto";
import { propuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import { resolverHandle } from "@/lib/timeline/handle-de-tarea";
import {
  claveDeFaseQueSeVa,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  type Borrador,
  type Cambio,
  type CambioTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "@/lib/timeline/borrador";

// ─────────────────────────────────────────────────────────────────────────────
// ── Los fixtures: un cronograma con la forma de Wherex y una propuesta de «Regenerar todo» ──────
// ─────────────────────────────────────────────────────────────────────────────

/** Un generador con semilla (los bits altos: los bajos de un LCG repiten cada 16). */
function generador(semilla: number) {
  let s = semilla;
  const hex = (n: number) =>
    Array.from({ length: n }, () => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return ((s >>> 16) % 16).toString(16);
    }).join("");
  return {
    cuid: () => `cmpc0${hex(20)}`,
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`,
  };
}

const FASES: Array<[string, number]> = [
  ["Kickoff y alineación", 1],
  ["Descubrimiento y diagnóstico", 2],
  ["Configuración del portal", 3],
  ["Configuración Marketing Hub", 2],
  ["Marketing Hub", 3],
  ["Sales Hub y pipeline comercial", 4],
  ["Integraciones con el ERP", 5],
  ["Migración de datos", 3],
  ["Automatizaciones", 3],
  ["Reportes y tableros", 2],
  ["Capacitación del equipo", 2],
  ["Salida en vivo y soporte", 2],
];
const VERBOS = ["Configurar", "Revisar con el cliente", "Documentar", "Validar", "Probar", "Migrar", "Definir"];
const OBJETOS = [
  "la propiedad «Fuente de licitación» en Negocios",
  "el pipeline de oportunidades del sector público",
  "los permisos de los equipos de venta",
  "la sincronización de contactos con el ERP",
  "las plantillas de correo del seguimiento",
  "el tablero de avance semanal",
  "la importación de empresas desde el Excel",
  "las reglas de asignación de leads",
];

const NOTA_DE_TAREA = "NOTA-DE-TAREA-QUE-NO-VIAJA";

const tarea = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title,
  weekIndex,
  notes: `${NOTA_DE_TAREA} ${id}`,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[], extra: Partial<FaseViva> = {}): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tareas,
  status: "PENDING",
  ...extra,
});
const tituloDe = (k: number, largo: number) => {
  const base = `${VERBOS[k % VERBOS.length]} ${OBJETOS[(k * 3) % OBJETOS.length]} (${k})`;
  return base.length >= largo ? base.slice(0, largo) : `${base} ${"y su detalle ".repeat(10)}`.slice(0, largo);
};

interface Opciones {
  fases?: number;
  vivas: number;
  nuevas: number;
  seVan: number;
  /** El largo de la nota de fase que cambia (0 = ninguna). */
  notaDeFase?: number;
  grupoDesmarcado?: boolean;
  largoDeTitulo?: number;
  /** Claves `t:` a la fuerza (para que choquen). */
  clavesNuevas?: string[];
}

/** Un cronograma vivo y un borrador de «Regenerar todo» sobre él, con todo lo que aplica limpio. */
function propuestaGrande(o: Opciones): { vivo: Vivo; borrador: Borrador; excluidos: string[] } {
  const g = generador(20260925);
  const nFases = o.fases ?? FASES.length;
  const ids = FASES.slice(0, nFases).map(() => g.cuid());
  const porFase: TareaDelVivo[][] = ids.map(() => []);
  for (let k = 0; k < o.vivas; k++) {
    const i = Math.floor((k * nFases) / o.vivas);
    const dur = FASES[i][1];
    porFase[i].push(
      tarea(g.cuid(), tituloDe(k, 48), k % dur, {
        ...(k % 10 === 3 ? { status: "DONE" } : {}),
        ...(k % 23 === 5 ? { source: "HUMAN" } : {}),
      }),
    );
  }
  const vivo: Vivo = {
    ancla: "2026-10-05",
    fases: ids.map((id, i) => fase(id, FASES[i][0], FASES[i][1], porFase[i])),
  };

  // Estructura: +1 semana en tres fases, un renombre y (si se pide) la nota de una fase.
  const cambios: Cambio[] = [];
  const duracion = new Map(vivo.fases.map((f) => [f.id, f.durationWeeks]));
  const nombre = new Map(vivo.fases.map((f) => [f.id, f.name]));
  for (const i of [2, 5, 9].filter((x) => x < nFases)) {
    const f = vivo.fases[i];
    cambios.push({
      tipo: "fase-cambia",
      clave: `fase:${f.id}:durationWeeks`,
      faseId: f.id,
      fase: f.name,
      campo: "durationWeeks",
      desde: f.durationWeeks,
      a: f.durationWeeks + 1,
      motivo: "En la reunión del 12 de septiembre el cliente pidió más tiempo para validar con su equipo.",
    });
    duracion.set(f.id, f.durationWeeks + 1);
  }
  if (nFases > 4) {
    const f = vivo.fases[4];
    cambios.push({
      tipo: "fase-cambia",
      clave: `fase:${f.id}:name`,
      faseId: f.id,
      fase: f.name,
      campo: "name",
      desde: f.name,
      a: "Marketing Hub: campañas y nutrición",
      motivo: "Así la nombró el cliente en la reunión de alcance.",
    });
    nombre.set(f.id, "Marketing Hub: campañas y nutrición");
  }
  if ((o.notaDeFase ?? 0) > 0 && nFases > 6) {
    const f = vivo.fases[6];
    cambios.push({
      tipo: "fase-cambia",
      clave: `fase:${f.id}:notes`,
      faseId: f.id,
      fase: f.name,
      campo: "notes",
      desde: null,
      a: "El ERP expone la API de pedidos recién en noviembre; hasta entonces se integra por archivo. ".repeat(20).slice(0, o.notaDeFase),
      motivo: "Lo dijo el equipo de TI del cliente.",
    });
  }

  // Tareas: se van las primeras pendientes de la IA; las nuevas se reparten entre las fases.
  const seVan = vivo.fases
    .flatMap((f) => (f.tareas ?? []).map((t) => ({ f, t })))
    .filter(({ t }) => t.status === "PENDING" && t.source === "AGENT")
    .slice(0, o.seVan);
  for (const { f, t } of seVan) {
    cambios.push({ tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(t.id), tareaId: t.id, faseId: f.id, desde: fotoDeTarea(t) });
  }
  for (let k = 0; k < o.nuevas; k++) {
    const i = k % nFases;
    const f = vivo.fases[i];
    const n: CambioTareaNueva = {
      tipo: "tarea-nueva",
      clave: o.clavesNuevas?.[k] ?? `t:${g.uuid()}`,
      fase: f.id,
      tarea: {
        title: tituloDe(1000 + k, o.largoDeTitulo ?? 70),
        weekIndex: k % (duracion.get(f.id) ?? 1),
        notes: `${NOTA_DE_TAREA} nueva ${k}`,
        party: "SMARTEAM",
        type: "TASK",
        needsValidation: false,
        motivoPorValidar: null,
        fuga: null,
      },
    };
    cambios.push(n);
  }

  const borrador: Borrador = {
    formato: FORMATO_BORRADOR,
    version: 3,
    origen: "contexto",
    observaciones: [],
    cambios,
    pedido: "regenerar",
    tareas: { corrida: "run-grande", listas: true },
    tareasArmadasPara: Object.fromEntries(ids.map((id) => [id, { nombre: nombre.get(id)!, semanas: duracion.get(id)! }])),
  };
  // «Un grupo desmarcado»: todas las tareas de la 8.ª fase.
  const desmarcada = vivo.fases[Math.min(7, nFases - 1)].id;
  const excluidos = o.grupoDesmarcado
    ? cambios.flatMap((c) =>
        (c.tipo === "tarea-nueva" && c.fase === desmarcada) || (c.tipo === "tarea-se-va" && c.faseId === desmarcada) ? [c.clave] : [],
      )
    : [];
  return { vivo, borrador: { ...borrador, ...(excluidos.length > 0 ? { excluidos } : {}) }, excluidos };
}

/** Lo que lee `contextoDeCronograma` para una propuesta: por la MISMA función que en producción. */
function paraElChat(p: { vivo: Vivo; borrador: Borrador }) {
  const leida = propuestaParaElChat({
    guardado: JSON.parse(JSON.stringify(p.borrador)),
    token: "run-grande",
    vivo: p.vivo,
    tareas: { estado: "listas", fase: null, motivo: null },
  });
  if (!leida.resumen) throw new Error("la propuesta de prueba no se leyó");
  return { ...leida, resumen: leida.resumen };
}

const PARA_REHACER_TODO = lineaParaRehacerTodo({ conDetalleDeLaIA: true, publicadoAlgunaVez: true, cambiosDeFasesSinDecidir: true });

const entrada = (propuesta: EntradaDelContextoConPropuesta["propuesta"], extra: Partial<EntradaDelContextoConPropuesta> = {}) => ({
  proyecto: "Wherex — implementación",
  cliente: "Wherex",
  propuesta,
  cierreFijado: null,
  paraRehacerTodo: PARA_REHACER_TODO,
  puedeEditar: true,
  ...extra,
});

/** El índice: los renglones numerados de «LOS CAMBIOS» (los de LA PROPUESTA son las fases). */
function indiceDe(texto: string): string[] {
  const desde = texto.indexOf("LOS CAMBIOS CONTRA EL CRONOGRAMA DE HOY");
  const hasta = texto.indexOf("PARA REHACER TODO", desde);
  expect(desde, "no está la lista de cambios").toBeGreaterThan(-1);
  return texto
    .slice(desde, hasta)
    .split("\n")
    .filter((l) => /^\d+\. /.test(l));
}
const numerosDe = (indice: string[]) => indice.map((l) => Number(l.slice(0, l.indexOf("."))));
const identificadores = (texto: string) => new Set([...texto.matchAll(/\[([^\]\s]+)\]/g)].map((m) => m[1]));

const PEOR_CASO = propuestaGrande({ vivas: 94, nuevas: 130, seVan: 80, notaDeFase: 1_500, grupoDesmarcado: true });

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ el índice de la barra nunca se recorta", () => {
  it("⭐ cada número de la barra aparece UNA vez, idéntico con y sin recorte", () => {
    /* Sin el índice entero, «deja el 3 como estaba» sería adivinar: el recorte puede sacar el detalle
       y cortar títulos, nunca un número. La edición que la pone en rojo: acortar los títulos del
       índice (pasarles `titulo(…)`) o sacar renglones numerados en algún nivel. */
    const p = paraElChat(PEOR_CASO);
    const entero = armarContextoConPropuesta(entrada(p), { techo: Number.POSITIVE_INFINITY });
    const recortado = armarContextoConPropuesta(entrada(p), { techo: 1 });
    expect(entero.nivel).toBe(0);
    expect(recortado.nivel).toBe(2);
    const esperados = Array.from({ length: p.resumen.items.length + p.resumen.grupos.length }, (_, i) => i + 1);
    expect(esperados.length, "el fixture no tiene lista que recortar").toBeGreaterThan(10);
    for (const c of [entero, recortado]) expect(numerosDe(indiceDe(c.texto))).toEqual(esperados);
    expect(indiceDe(recortado.texto), "el recorte tocó el índice").toEqual(indiceDe(entero.texto));
  });

  it("⭐ 252 tareas nuevas: pasa el techo y se manda IGUAL, con el índice entero y el aviso", () => {
    /* Riesgo 1 de la especificación: una propuesta enorme pasa el techo. Va con el índice entero y
       deja un aviso (`excede`, que `contextoDeCronograma` escribe en el log): cuesta más caché, no
       falla. La edición que la pone en rojo: cortar filas o el índice para entrar a la fuerza. */
    const p = paraElChat(propuestaGrande({ vivas: 94, nuevas: 252, seVan: 80, largoDeTitulo: 90 }));
    const c = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
    expect(c.excede).toBe(true);
    expect(c.nivel).toBe(2);
    expect(c.texto.length).toBeGreaterThan(TECHO_DEL_PREFIJO_CHARS);
    const esperados = Array.from({ length: p.resumen.items.length + p.resumen.grupos.length }, (_, i) => i + 1);
    expect(numerosDe(indiceDe(c.texto))).toEqual(esperados);
    // Ninguna fila sale: las 252 nuevas están, cada una con su identificador.
    for (const g of p.resumen.grupos) {
      for (const t of g.tareas) expect(c.texto, t.ref).toContain(`[${c.handles.get(t.ref)}]`);
    }
  });
});

describe("el recorte va en su orden y no pierde identificadores", () => {
  const p = paraElChat(PEOR_CASO);
  const nivel0 = armarContextoConPropuesta(entrada(p), { techo: Number.POSITIVE_INFINITY });
  const nivel1 = armarContextoConPropuesta(entrada(p), { techo: nivel0.texto.length - 1 });
  const nivel2 = armarContextoConPropuesta(entrada(p), { techo: nivel1.texto.length - 1 });
  const largo = p.resumen.grupos.flatMap((g) => g.tareas).find((t) => t.signo === "+" && t.titulo.length > 40)!;

  it("el orden de los dos niveles: primero los «antes → después» y los motivos, después los títulos", () => {
    /* La edición que la pone en rojo: invertir los niveles (cortar títulos antes de sacar el detalle),
       o sacar el detalle sin decirlo. */
    expect(nivel0.texto).toContain("motivo: ");
    expect(nivel0.texto).toContain("» → «");
    expect(nivel0.texto).not.toContain("RECORTADO POR ESPACIO");

    expect(nivel1.nivel).toBe(1);
    expect(nivel1.texto).toContain(RECORTE_NIVEL_1);
    expect(nivel1.texto).not.toContain(RECORTE_NIVEL_2);
    expect(nivel1.texto, "el nivel 1 dejó un motivo").not.toMatch(/^ {3}motivo: /m);
    expect(nivel1.texto, "el nivel 1 dejó un «antes → después»").not.toContain("» → «");
    expect(nivel1.texto, "el nivel 1 cortó un título").toContain(largo.titulo);

    expect(nivel2.nivel).toBe(2);
    expect(nivel2.texto).toContain(RECORTE_NIVEL_1);
    expect(nivel2.texto).toContain(RECORTE_NIVEL_2);
    expect(nivel2.texto, "el nivel 2 no cortó los títulos").not.toContain(largo.titulo);
    expect(nivel2.texto).toContain(`${largo.titulo.slice(0, 20)}`);
    expect(nivel2.texto.length).toBeLessThan(nivel1.texto.length);
  });

  it("⛔ los identificadores de las filas sobreviven al nivel 2", () => {
    /* Un título cortado se sigue nombrando: el identificador va entero. La edición que la pone en rojo:
       cortar el renglón entero (con su identificador) o sacar filas en el nivel 2. */
    const antes = identificadores(nivel0.texto);
    const despues = identificadores(nivel2.texto);
    expect(antes.size).toBeGreaterThan(200);
    expect([...antes].filter((id) => !despues.has(id))).toEqual([]);
  });

  it("⛔ una nota de TAREA nunca aparece, en ningún nivel", () => {
    /* Las notas son contenido del CSE: el chat conversa sobre la estructura, y la guarda de
       contexto.test.ts lo exige en los dos archivos. La edición que la pone en rojo: pintar
       `t.notes` en el renglón de una tarea (viva o nueva). */
    for (const c of [nivel0, nivel1, nivel2]) expect(c.texto).not.toContain(NOTA_DE_TAREA);
  });

  it("sin REGLAS DURAS del modificador, y con lo que ve el cliente", () => {
    /* D11: son de «Pedir cambio con IA», no de la propuesta. La edición que la pone en rojo: pegar
       `REGLAS_DURAS_DEL_CRONOGRAMA` al contexto con propuesta. */
    expect(nivel0.texto).not.toContain("REGLAS DURAS");
    /* ⚠ ACTUALIZADA en la revisión de E3 (#8), con esta razón: decía «lo ve el cliente al aplicar», y es falso.
       El cliente lee solo la foto que congela «Subir al cliente»; aplicar no la toca. El chat se lo repetía
       al CSE. La edición que la pone en rojo: volver a prometer que el cliente lo ve al aplicar. */
    expect(nivel0.texto).toContain("lo ve el cliente cuando se suba el cronograma");
    expect(nivel0.texto).toContain("el cliente lo ve recién cuando se sube («Subir al cliente»)");
    expect(nivel0.texto, "el contexto le dice al modelo que el cliente lo ve al aplicar").not.toMatch(
      /cliente (sigue viendo|lo ve|ve)[^.]*(al aplicar|hasta que se aplique)/,
    );
    expect(nivel0.texto).toContain(`PROPUESTA ABIERTA ${p.desde}. ${LINEA_DE_LA_PROPUESTA_EDITABLE}`);
  });

  it("el grupo desmarcado se ve desmarcado, con sus tareas nombradas para recuperarlas", () => {
    const g = p.resumen.grupos.find((x) => x.estado === "excluido")!;
    expect(g, "el fixture no tiene un grupo desmarcado").toBeTruthy();
    const linea = indiceDe(nivel0.texto).find((l) => l.startsWith(`${g.numero}. `))!;
    expect(linea).toContain(`☐ Tareas de «${g.nombre}»`);
    const fila = nivel0.texto.split("\n").find((l) => l.startsWith("   desmarcadas: "))!;
    expect(fila, "las desmarcadas no se nombran").toBeTruthy();
    for (const t of g.tareas) expect(fila).toContain(`${t.signo} S${t.semana} ${t.titulo} [${nivel0.handles.get(t.ref)}]`);
  });
});

describe("los handles, el determinismo y la medida", () => {
  it("⛔ los handles son únicos aunque las claves nuevas choquen en sus últimos caracteres", () => {
    /* Dos claves `t:` que terminan igual: con el handle fijo de 5, el chat vería dos tareas con el mismo
       identificador y `resolverHandle` rechazaría las dos. La edición que la pone en rojo: armar los
       handles con `handleDeTarea` en vez de `handlesSinChoque`. */
    const chocan = ["t:1b9d6bcd-bbfd-4b2d-9b5d-ab8dfb3e7c1d", "t:6ec0bd7f-11c0-43da-975e-2a8ad93e7c1d"];
    const p = paraElChat(propuestaGrande({ fases: 4, vivas: 20, nuevas: 6, seVan: 3, clavesNuevas: chocan }));
    const c = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
    const refs = [...c.handles.keys()];
    const [a, b] = chocan.map((k) => c.handles.get(k)!);
    expect(a).not.toBe(b);
    for (const k of chocan) {
      expect(c.texto).toContain(`[${c.handles.get(k)}]`);
      expect(resolverHandle(c.handles.get(k)!, refs)).toEqual({ tipo: "una", id: k });
    }
    const impresos = [...c.handles.values()];
    expect(new Set(impresos).size, "dos tareas con el mismo identificador").toBe(impresos.length);
  });

  it("es determinista: el mismo texto con otra hora del reloj", () => {
    /* El prefijo se cachea: un texto que cambia solo (la hora, la fase de la corrida) paga la caché en
       cada turno. La edición que la pone en rojo: meter `Date.now()`, «hoy» o `currentPhase` al texto. */
    const p = paraElChat(PEOR_CASO);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-25T10:00:00Z"));
      const a = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
      vi.setSystemTime(new Date("2027-03-01T22:30:00Z"));
      const b = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
      expect(b.texto).toBe(a.texto);
      expect(b.nivel).toBe(a.nivel);
    } finally {
      vi.useRealTimers();
    }
  });

  it("📏 la medida del peor caso realista (12 fases, 94 vivas, 130 nuevas, 80 que se van, una nota de 1.500 y un grupo desmarcado)", () => {
    /* No se fija un número hasta medirlo: se imprime. Lo que sí se exige es lo de siempre (el índice
       entero) y que el aviso diga la verdad. */
    const p = paraElChat(PEOR_CASO);
    const c: ContextoConPropuesta = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
    const n0 = armarContextoConPropuesta(entrada(p), { techo: Number.POSITIVE_INFINITY });
    console.log(
      `[medida E3 P4] peor caso realista: ${c.texto.length} caracteres (techo ${TECHO_DEL_PREFIJO_CHARS}) · ` +
        `nivel ${c.nivel} · excede ${c.excede} · sin recorte ${n0.texto.length} · medidas ${JSON.stringify(c.medidas)} · ` +
        `${p.resumen.items.length} cambios de fases y ${p.resumen.grupos.length} grupos`,
    );
    expect(c.excede).toBe(c.texto.length > TECHO_DEL_PREFIJO_CHARS);
    expect(c.medidas.total).toBe(c.texto.length);
    expect(numerosDe(indiceDe(c.texto))).toEqual(
      Array.from({ length: p.resumen.items.length + p.resumen.grupos.length }, (_, i) => i + 1),
    );
  });
});

describe("una fase que se va", () => {
  it("lleva su id en el índice, y lo que se va con ella queda nombrado debajo", () => {
    /* Una fase que se va entera ya no está en LA PROPUESTA: sin su id en el índice, el chat no la podría
       nombrar para dejarla como estaba. La edición que la pone en rojo: sacar el `[id]` del renglón. */
    const base = propuestaGrande({ fases: 4, vivas: 16, nuevas: 0, seVan: 0 });
    const f = base.vivo.fases[3];
    const seVa: Cambio = {
      tipo: "fase-se-va",
      clave: claveDeFaseQueSeVa(f.id),
      faseId: f.id,
      desde: {
        name: f.name,
        durationWeeks: f.durationWeeks,
        startWeek: f.startWeek,
        sessionCount: f.sessionCount,
        notes: f.notes,
        activityType: f.activityType,
        status: "PENDING",
        tareas: (f.tareas ?? []).map((t) => ({ id: t.id, foto: fotoDeTarea(t) })),
      },
      porChat: true,
    };
    const p = paraElChat({ vivo: base.vivo, borrador: { ...base.borrador, cambios: [seVa] } });
    const c = armarContextoConPropuesta(entrada(p), { techo: TECHO_DEL_PREFIJO_CHARS });
    const linea = indiceDe(c.texto)[0];
    expect(linea).toContain(`Se quita la fase «${f.name}» [${f.id}]`);
    const pendientes = (f.tareas ?? []).filter((t) => t.status === "PENDING" && t.source !== "HUMAN");
    expect(pendientes.length).toBeGreaterThan(0);
    for (const t of pendientes) expect(c.texto).toContain(`[${c.handles.get(t.id)}]`);
    expect(c.texto).toContain("se van con la fase: ");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ── contextoDeCronograma, con una propuesta abierta (la base falsa) ───────────
// ─────────────────────────────────────────────────────────────────────────────

describe("⛔ P4 no cambia lo que hace el chat: ve la propuesta, pero `fases` sigue siendo lo de HOY", () => {
  const TL_ID = "tl-1";
  const vivo: Vivo = {
    ancla: "2026-10-05T00:00:00.000Z",
    fases: [
      fase("fa", "Kickoff", 1, [tarea("ta1", "Reunión de arranque", 0, { status: "DONE", source: "HUMAN" })]),
      fase("fb", "Diseño", 2, [tarea("tb1", "Mapear procesos", 0), tarea("tb2", "Definir pipeline", 1)]),
      fase("fc", "Pruebas", 2, [tarea("tc1", "Probar flujos", 1)]),
    ],
  };
  const borrador: Borrador = {
    formato: FORMATO_BORRADOR,
    version: 4,
    origen: "contexto",
    observaciones: [],
    cambios: [
      { tipo: "fase-cambia", clave: "fase:fc:durationWeeks", faseId: "fc", fase: "Pruebas", campo: "durationWeeks", desde: 2, a: 3 },
      {
        tipo: "fase-nueva",
        clave: "n:0000abcd",
        fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
        despuesDe: "fc",
      },
      {
        tipo: "tarea-nueva",
        clave: "t:11111111-2222-4333-a444-555555555555",
        fase: "n:0000abcd",
        tarea: { title: "Piloto con el equipo comercial", weekIndex: 0, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
      },
    ],
    pedido: "regenerar",
    tareas: { corrida: "run-4", listas: true },
    tareasArmadasPara: { fc: { nombre: "Pruebas", semanas: 3 }, "n:0000abcd": { nombre: "Piloto", semanas: 2 } },
  };
  const faseLeida = (f: FaseViva) => ({
    id: f.id,
    name: f.name,
    order: 0,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    sessionCount: f.sessionCount,
    notes: f.notes,
    activityType: f.activityType,
    status: f.status ?? "PENDING",
    tasks: (f.tareas ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      weekIndex: t.weekIndex,
      order: 0,
      notes: t.notes,
      party: t.party,
      type: t.type,
      status: t.status,
      source: t.source,
      startDateOverride: null,
      dueDateOverride: null,
      needsValidation: false,
    })),
  });
  function montarLaBase(guardado: unknown) {
    db.projectTimeline.count.mockImplementation(async (a: { where: Record<string, unknown> }) =>
      "pendingProposal" in a.where ? (guardado === null ? 0 : 1) : 0,
    );
    db.projectTimeline.findUnique.mockImplementation(async (a: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
      if ("id" in a.where) {
        return { anchorStartDate: new Date(vivo.ancla!), pendingProposal: guardado, pendingProposalRunId: "run-4", phases: vivo.fases.map(faseLeida) };
      }
      if (a.select.project) {
        return {
          id: TL_ID,
          anchorStartDate: new Date(vivo.ancla!),
          closeDateOverride: null,
          project: { name: "Wherex", client: { name: "Wherex" } },
          phases: vivo.fases.map((f) => ({
            id: f.id,
            name: f.name,
            durationWeeks: f.durationWeeks,
            startWeek: f.startWeek,
            activityType: f.activityType,
            tasks: (f.tareas ?? []).map((t) => ({ id: t.id, title: t.title, weekIndex: t.weekIndex, status: t.status, source: t.source })),
          })),
        };
      }
      return { pendingProposal: guardado };
    });
    db.agentRun.findUnique.mockResolvedValue(null);
  }
  afterEach(() => vi.clearAllMocks());

  it("⛔ con una propuesta abierta, `fases` es el cronograma de HOY y la propuesta viaja aparte", async () => {
    /* `fases` traduce lo acordado y alimenta el camino de hoy: si pasara a ser la proyección, lo que el
       chat acuerde se aplicaría sobre una fase que no existe (`n:…`). La edición que la pone en rojo:
       armar `fases` con `propuesta.resumen.proyeccion`. */
    montarLaBase(JSON.parse(JSON.stringify(borrador)));
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.fases?.map((f) => f.id)).toEqual(["fa", "fb", "fc"]);
    expect(ctx.fases?.find((f) => f.id === "fc")?.durationWeeks, "`fases` trae la duración propuesta").toBe(2);
    expect(ctx.fases?.flatMap((f) => f.items.map((t) => t.id))).toEqual(["ta1", "tb1", "tb2", "tc1"]);
    expect(ctx.tokenDeLaPropuesta).toBe("run-4");
    expect(ctx.propuesta?.modo).toBe("editable");
    expect(ctx.propuesta?.resumen?.proyeccion.fases.map((f) => f.clave)).toEqual(["fa", "fb", "fc", "n:0000abcd"]);
    expect(ctx.propuesta?.handles.get("t:11111111-2222-4333-a444-555555555555")).toBe("55555");
    // Lo lee el modelo: la propuesta, con la fase nueva y su tarea.
    expect(ctx.texto).toContain("PROPUESTA ABIERTA");
    expect(ctx.texto).toContain("Piloto [n:0000abcd]");
    expect(ctx.texto).toContain("+Piloto con el equipo comercial [55555]");
  });

  it("⭐ E3 P5: con la propuesta editable, el chat la EDITA: la línea lo dice, con sus consecuencias", async () => {
    /* ⚠ REESCRITA en E3 P5 (2026-09-25), con esta razón: decía «el chat todavía NO edita la propuesta» (P4
       solo se la mostraba, con la línea del freno). Desde P5 lo acordado edita la propuesta: la línea de
       arriba lo dice, van las consecuencias de editarla (mover conserva el estado…) y «PARA REHACER TODO»
       ofrece resolverla desde el chat. Las ediciones que la ponen en rojo: volver a `puedeEditar: false`, o
       dejar la línea del freno con la propuesta editable (el modelo no registraría nada). */
    montarLaBase(JSON.parse(JSON.stringify(borrador)));
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.texto).toContain(LINEA_DE_LA_PROPUESTA_EDITABLE);
    expect(ctx.texto, "con la propuesta editable volvió el freno").not.toContain("NINGÚN cambio que acuerdes se puede aplicar");
    expect(ctx.texto).not.toContain("pero no lo registres");
    expect(ctx.texto, "no se dicen las consecuencias de editarla").toContain("CONSECUENCIAS QUE HAY QUE DECIR ANTES");
    expect(ctx.texto, "«PARA REHACER TODO» no ofrece resolverla desde el chat").toContain("(o me lo pides acá)");
    expect(ctx.propuesta?.cierreFijado, "la línea de «aplicar» no conoce el cierre fijado").toBeNull();
  });

  it("⛔ E3 P5: mientras la IA arma las tareas, la propuesta se lee pero NO se edita", async () => {
    /* La edición que la pone en rojo: pasar `puedeEditar: true` también en solo lectura (el modelo
       registraría cambios que la ruta rechaza con 409). */
    montarLaBase(JSON.parse(JSON.stringify({ ...borrador, tareas: { corrida: "run-armando", listas: false } })));
    db.agentRun.findUnique.mockResolvedValue({ status: "RUNNING", updatedAt: new Date(), currentPhase: null, output: null });
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.propuesta?.modo).toBe("solo-lectura");
    expect(ctx.texto).toContain("PROPUESTA ABIERTA");
    expect(ctx.texto).not.toContain(LINEA_DE_LA_PROPUESTA_EDITABLE);
    expect(ctx.texto).toContain("pero no lo registres");
    expect(ctx.texto, "sin permiso de editar no se prometen las consecuencias de editarla").not.toContain(
      "CONSECUENCIAS QUE HAY QUE DECIR ANTES",
    );
    expect(ctx.texto, "ofrece resolverla desde el chat mientras no se puede").not.toContain("(o me lo pides acá)");
  });

  it("una ilegible (lo que no es un v1) sigue con el contexto de HOY, con su propio freno: solo «Descartarla»", async () => {
    /* ⚠ E4 (2026-09): era «el formato viejo», que ya no se lee: ahora es «ilegible» (se descarta arriba
       del Gantt). El chat no la puede leer con los números de la barra.
       ⚠ REESCRITA en la revisión de E4 (#5b, #9, #13), con esta razón: pedía el freno GENÉRICO («HAY UNA
       PROPUESTA DEL CRONOGRAMA SIN DECIDIR»), que manda a «desmarcar y «Aplicar»» en su barra. Con algo
       ilegible la pantalla solo muestra una línea con «Descartarla»: el modelo le indicaba al CSE botones que
       no existen. Las ediciones que la ponen en rojo: mostrar la propuesta en solo lectura para lo que no se
       sabe leer, volver al freno genérico, o dejar «PARA REHACER TODO» mandando a la barra. */
    montarLaBase({ phases: [{ id: "fa", name: "Kickoff", durationWeeks: 2 }] });
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.texto).toContain("EL CRONOGRAMA HOY");
    expect(ctx.texto).not.toContain("PROPUESTA ABIERTA");
    expect(ctx.texto, "el freno no dice que lo guardado no se sabe leer").toContain(
      "⛔ HAY UNA PROPUESTA GUARDADA QUE NEXUS NO SABE LEER arriba del Gantt",
    );
    expect(ctx.texto).toContain("hasta que se saque con «Descartarla» en esa línea");
    expect(ctx.texto, "volvió el freno genérico").not.toContain("HAY UNA PROPUESTA DEL CRONOGRAMA SIN DECIDIR");
    expect(ctx.texto, "manda a «Aplicar», que con algo ilegible no existe").not.toContain("«Aplicar»");
    expect(ctx.texto, "manda a una barra que con algo ilegible no existe").not.toContain("su barra");
    // «PARA REHACER TODO» también: primero se saca con «Descartarla».
    const rehacer = ctx.texto.split("\n").find((l) => l.startsWith("PARA REHACER TODO")) ?? "";
    expect(rehacer, "la guarda no encuentra la línea «PARA REHACER TODO»").not.toBe("");
    expect(rehacer).toContain("«Descartarla»");
    expect(ctx.tokenDeLaPropuesta).toBe("run-4");
    expect(ctx.propuesta?.modo).toBe("solo-lectura");
    expect(ctx.propuesta?.porQue).toBe("ilegible");
  });

  it("sin propuesta, nada cambia: el cronograma de hoy, sin token", async () => {
    montarLaBase(null);
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.texto).toContain("EL CRONOGRAMA HOY");
    expect(ctx.tokenDeLaPropuesta).toBeUndefined();
    expect(ctx.propuesta).toBeUndefined();
    expect(db.projectTimeline.findUnique.mock.calls.some((c) => "id" in (c[0] as { where: object }).where)).toBe(false);
  });

  it("⚠ si la propuesta no se puede leer, el chat sigue con el cronograma de hoy y el freno", async () => {
    /* La edición que la pone en rojo: sacar el `.catch` de la lectura (el turno entero se rompería). */
    montarLaBase(JSON.parse(JSON.stringify(borrador)));
    const leer = db.projectTimeline.findUnique.getMockImplementation()!;
    db.projectTimeline.findUnique.mockImplementation(async (a: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
      if ("id" in a.where) throw new Error("la base se cayó");
      return leer(a);
    });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = await contextoDeCronograma("p1");
    aviso.mockRestore();
    expect(ctx.texto).toContain("EL CRONOGRAMA HOY");
    expect(ctx.texto).toContain("HAY UNA PROPUESTA DEL CRONOGRAMA SIN DECIDIR");
    expect(ctx.propuesta).toBeUndefined();
  });
});
