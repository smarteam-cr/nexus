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
 *   7. (L2) mientras la IA arma la propuesta, la pantalla no la muestra: el chat va sin «LOS CAMBIOS».
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
  COMO_SE_LEEN_LAS_SEMANAS,
  DEL_SISTEMA_SE_CREA,
  DEL_SISTEMA_SE_QUITA,
  LEYENDA_DE_LA_SUGERIDA,
  LINEA_DE_LA_PROPUESTA_EDITABLE,
  lineaDeSoloLectura,
  RECORTE_NIVEL_1,
  RECORTE_NIVEL_2,
  type ContextoConPropuesta,
  type EntradaDelContextoConPropuesta,
} from "./contexto-del-cronograma";
import { contextoDeCronograma, lineaParaRehacerTodo, TECHO_DEL_PREFIJO_CHARS } from "./contexto";
import { avisoDelChat, estadoParaElChat } from "@/lib/timeline/apertura-del-chat";
import { propuestaParaElChat } from "@/lib/timeline/propuesta-para-el-chat";
import { resolverHandle } from "@/lib/timeline/handle-de-tarea";
import { computePhaseRanges } from "@/lib/timeline/weeks";
import {
  claveDeFaseQueSeVa,
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  type Borrador,
  type Cambio,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "@/lib/timeline/borrador";
import { MOTIVO_DEL_KICKOFF_QUE_FALTA, TAREA_DE_KICKOFF } from "@/lib/timeline/hitos";

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
    /* ⚠ ACTUALIZADA en L3 (D4), con esta razón: pedía «S2» para la semana 2 de la fase; la tarea ahora va con
       su etiqueta única («Semana 2 · S23»: la de la fase y la del proyecto, la de la cabecera del Gantt). */
    for (const t of g.tareas) expect(fila).toContain(`${t.signo} ${t.etiqueta} ${t.titulo} [${nivel0.handles.get(t.ref)}]`);
    for (const t of g.tareas) expect(t.etiqueta).toMatch(new RegExp(`^Semana ${t.semana} · S\\d+$`));
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
    /* L2 (2026-09-26): mientras la IA arma la propuesta no hay barra en pantalla: el contexto lo dice y va sin el
       índice numerado (no hay números que citar). */
    expect(ctx.propuesta?.porQue).toBe("tareas-armando");
    expect(ctx.texto, "manda el índice mientras se arma").not.toContain("LOS CAMBIOS");
    expect(ctx.texto).toContain("todavía no se ve en pantalla");
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

  it("⛔ L3 (D4) · sin propuesta, las semanas dicen «Semana N · SK» (la del proyecto, desde S0) y se explica cómo se leen", async () => {
    /* Con y sin propuesta el chat lee la MISMA etiqueta: «pásala a la S5» es la columna S5 de la cabecera.
       La edición que la pone en rojo: volver a `S${w + 1}` en `contexto.ts` (la semana de la fase, que el chat
       confundía con la S de la cabecera), o dejar el texto sin `COMO_SE_LEEN_LAS_SEMANAS`. */
    montarLaBase(null);
    const ctx = await contextoDeCronograma("p1");
    expect(ctx.texto).toContain(COMO_SE_LEEN_LAS_SEMANAS);
    // «Kickoff» arranca en S0; «Diseño» (2 semanas) en S1; «Pruebas» en S3.
    expect(ctx.texto).toContain("   Semana 1 · S0: Reunión de arranque");
    expect(ctx.texto).toContain("   Semana 1 · S1: Mapear procesos");
    expect(ctx.texto).toContain("   Semana 2 · S2: Definir pipeline");
    expect(ctx.texto).toContain("   Semana 1 · S3: (vacía)");
    expect(ctx.texto).toContain("   Semana 2 · S4: Probar flujos");
    expect(ctx.texto, "una semana con «S» de la fase (base 1)").not.toMatch(/^ {3}S\d+: /m);
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

/**
 * L1 (2026-09-26): el cajón le dice al CSE, arriba del campo, qué pasa con lo que pide; el contexto se lo dice al
 * modelo. Tienen que decir lo mismo: con una propuesta editable, el cronograma no cambia hasta aplicarla.
 */
describe("⛔ L1 · el aviso del cajón y la línea del contexto dicen lo mismo", () => {
  it("con una propuesta editable, los dos dicen que el cronograma no cambia hasta que se aplica", () => {
    /* La edición que la pone en rojo: cambiar el aviso del cajón a otra idea (el modelo contestaría una cosa y la
       pantalla diría otra). `LINEA_DE_LA_PROPUESTA_EDITABLE` no cambia en L1. */
    const editable = avisoDelChat(
      estadoParaElChat({
        puedeEditar: true,
        hayBorrador: true,
        ilegible: false,
        conDesconocidos: false,
        vacioFallido: false,
        tareasArmando: false,
        recalculando: false,
        desde: "desde «Regenerar todo»",
        ejemplos: null,
      }),
    );
    expect(editable.variante).toBe("editable");
    expect(editable.aviso).toMatch(/hasta que (la|se) apli/);
    expect(LINEA_DE_LA_PROPUESTA_EDITABLE).toMatch(/hasta que (la|se) apli/);
    expect(editable.aviso).toContain("cambia la propuesta");
    expect(LINEA_DE_LA_PROPUESTA_EDITABLE).toContain("EDITA ESTA PROPUESTA");
  });
});

/**
 * L2 (2026-09-26, D10): mientras la IA arma la propuesta, la pantalla no la muestra (ni barra ni números). El chat
 * no recibe el índice numerado: «deja el 3» no tendría a qué apuntar en pantalla. El recálculo no cambia: su barra
 * se ve, y su índice viaja.
 */
describe("⛔ L2 · mientras se arma la propuesta, el chat no recibe números que no se ven", () => {
  const base = propuestaGrande({ vivas: 30, nuevas: 20, seVan: 8 });
  const leida = (tareas: Parameters<typeof propuestaParaElChat>[0]["tareas"]) => {
    const l = propuestaParaElChat({ guardado: JSON.parse(JSON.stringify(base.borrador)), token: "run-grande", vivo: base.vivo, tareas });
    if (!l.resumen) throw new Error("la propuesta de prueba no se leyó");
    return { ...l, resumen: l.resumen };
  };
  const armar = (p: ReturnType<typeof leida>, porQue: "tareas-armando" | "recalculando") =>
    armarContextoConPropuesta(entrada(p, { puedeEditar: false, porQue: lineaDeSoloLectura(porQue) }), { techo: TECHO_DEL_PREFIJO_CHARS });

  it("⭐ con «tareas-armando»: sin «LOS CAMBIOS» ni «se ve arriba del Gantt»; la propuesta sí va", () => {
    /* La edición que la pone en rojo: mandar el índice mientras se arma (la sección 5 sin mirar `porQue`), o
       volver a decir que se ve arriba del Gantt. */
    const p = leida({ estado: "armando", fase: "Analizando sesiones…", motivo: null });
    expect(p.porQue).toBe("tareas-armando");
    expect(p.resumen.items.length + p.resumen.grupos.length, "la prueba necesita números que esconder").toBeGreaterThan(3);
    const c = armar(p, "tareas-armando");
    expect(c.texto, "manda el índice mientras se arma").not.toContain("LOS CAMBIOS");
    expect(c.texto).not.toContain("se ve arriba del Gantt");
    expect(c.medidas.indice, "cuenta un índice que no viaja").toBe(0);
    expect(c.medidas.detalle).toBe(0);
    expect(c.texto).toContain(
      "⏳ LA IA ESTÁ ARMANDO ESTA PROPUESTA: todavía no se ve en pantalla, aparece entera cuando termina.",
    );
    expect(c.texto).toContain("no hay números que citar");
    expect(c.texto, "la propuesta (lo que se va a ver) tiene que ir").toContain("LA PROPUESTA: el cronograma como quedaría");
    expect(c.texto).toContain("PARA REHACER TODO");
    expect(c.texto, "el recorte nombra una lista que no va").not.toContain(RECORTE_NIVEL_1);
  });

  it("con «recalculando» nada cambia: su barra se ve, y el índice viaja", () => {
    /* La edición que la pone en rojo: esconder el índice también en el recálculo. */
    const faseId = base.vivo.fases[2].id;
    const p = leida({
      estado: "listas",
      fase: null,
      motivo: null,
      recalculo: { estado: "armando", corrida: "run-r", fases: [faseId], nombres: [base.vivo.fases[2].name], fase: null, motivo: null },
    });
    expect(p.porQue).toBe("recalculando");
    const c = armar(p, "recalculando");
    expect(c.texto).toContain("LOS CAMBIOS");
    expect(c.texto).toContain("(se ve arriba del Gantt)");
    expect(indiceDe(c.texto).length).toBeGreaterThan(3);
  });

  it("las líneas de solo lectura, en tuteo", () => {
    const VOSEO = /\b(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)\b/i;
    for (const porQue of ["tareas-armando", "recalculando"] as const) expect(lineaDeSoloLectura(porQue)).not.toMatch(VOSEO);
  });
});

/**
 * L3 (D3, D4) · el chat ve los números y las semanas como el Gantt. Un número es siempre un número de la
 * propuesta (cambios y grupos intercalados, fase por fase, `r.indice`); las fases de «LA PROPUESTA» ya no
 * llevan ordinal (se confundía con «el 3»). Cada semana dice «Semana N · SK»: N la de la fase, SK la del
 * proyecto desde S0, la de la cabecera.
 */
describe("⛔ L3 · el chat ve los números y las semanas del Gantt", () => {
  const p = paraElChat(PEOR_CASO);
  const c = armarContextoConPropuesta(entrada(p), { techo: Number.POSITIVE_INFINITY });
  const bloque = c.texto.slice(c.texto.indexOf("LA PROPUESTA: "), c.texto.indexOf("\nArranque: "));

  it("⭐ el índice va 1..N en el orden de la numeración: cambios y grupos intercalados", () => {
    /* La edición que la pone en rojo: recorrer `r.items` y después `r.grupos` (los números saldrían salteados:
       el grupo de la primera fase es el 1 y los cambios de fases vienen después). */
    const indice = indiceDe(c.texto);
    const r = p.resumen;
    expect(numerosDe(indice)).toEqual(r.indice.map((u) => u.numero));
    expect(numerosDe(indice)).toEqual(r.indice.map((_, i) => i + 1));
    expect(indice.map((l) => (/^\d+\. \S+ Tareas de «/.test(l) ? "grupo" : "cambio"))).toEqual(r.indice.map((u) => u.tipo));
    const primerCambio = r.indice.findIndex((u) => u.tipo === "cambio");
    const ultimoGrupo = r.indice.map((u) => u.tipo).lastIndexOf("grupo");
    expect(primerCambio, "la guarda no está mirando grupos y cambios intercalados").toBeGreaterThan(0);
    expect(ultimoGrupo).toBeGreaterThan(primerCambio);
  });

  it("⛔ las fases de «LA PROPUESTA» no empiezan con número", () => {
    /* La edición que la pone en rojo: volver a numerar las fases (`${i + 1}. ${f.name}`): el modelo leía «el 3»
       como la tercera fase. */
    expect(bloque, "la guarda no encuentra «LA PROPUESTA»").toContain("LA PROPUESTA: ");
    for (const f of p.resumen.proyeccion.fases) {
      const linea = bloque.split("\n").find((l) => l.includes(`[${f.clave}] — `));
      expect(linea, `no está la fase «${f.name}»`).toBeTruthy();
      expect(linea!.startsWith(`- ${f.name} [${f.clave}]`), linea).toBe(true);
    }
    expect(bloque, "un renglón numerado en «LA PROPUESTA»").not.toMatch(/^\d+\. /m);
  });

  it("⛔ cada semana dice «Semana N · SK», con la S del proyecto desde S0, y el encabezado explica N − 1 y K", () => {
    /* La edición que la pone en rojo: volver a `S${w + 1}` (la semana de la fase con «S», que el chat confundía
       con la cabecera) o sumarle 1 a la del proyecto. */
    const rangos = computePhaseRanges(p.resumen.proyeccion.fases);
    const filas = bloque.split("\n").filter((l) => /^ {3}\S/.test(l) && !l.startsWith("   ⚠"));
    expect(filas.length).toBeGreaterThan(20);
    for (const l of filas) expect(l).toMatch(/^ {3}Semana \d+ · S\d+: /);
    p.resumen.proyeccion.fases.forEach((f, i) => {
      const desde = bloque.indexOf(`[${f.clave}] — `);
      const primera = bloque.slice(desde).split("\n")[1];
      expect(primera, f.name).toMatch(new RegExp(`^ {3}Semana 1 · S${rangos[i].start}: `));
    });
    expect(bloque).toContain(COMO_SE_LEEN_LAS_SEMANAS);
    expect(COMO_SE_LEEN_LAS_SEMANAS).toContain("N − 1");
    expect(COMO_SE_LEEN_LAS_SEMANAS).toContain("`fase.arranque-relativo` va K");
    // Las tareas de «LOS CAMBIOS» también, con su etiqueta.
    const seVan = c.texto.split("\n").find((l) => l.startsWith("   se van: "));
    expect(seVan, "el fixture no tiene tareas que se van").toBeTruthy();
    expect(seVan).toMatch(/^ {3}se van: Semana \d+ · S\d+ /);
  });
});

/**
 * L7 (spec §8.2): una mudanza que SUGIERE la IA (una hecha que parece de otra fase) llega al chat como la ve el CSE: en
 * el grupo de su fase de HOY (el origen), con «?» y la pregunta «¿es de «X»?», y la leyenda dice qué es «?». Nunca
 * «viene de»: eso es lo que diría si se agrupara en el destino, y todavía no se mudó.
 */
describe("⛔ L7 · la mudanza sugerida, en el contexto del chat", () => {
  const base = propuestaGrande({ fases: 6, vivas: 120, nuevas: 6, seVan: 4 });
  const origen = base.vivo.fases[1];
  const destino = base.vivo.fases[4];
  const hechas = (origen.tareas ?? []).filter((t) => t.status === "DONE").slice(0, 2);
  const sugeridas: Cambio[] = hechas.map((t) => ({
    tipo: "tarea-cambia",
    clave: claveDeTareaQueCambia(t.id),
    tareaId: t.id,
    faseId: origen.id,
    desde: fotoDeTarea(t),
    a: { fase: destino.id },
    motivo: `Parece de «${destino.name}»`,
    sugerida: "otra-fase",
  }));
  const conSugeridas = {
    vivo: base.vivo,
    borrador: {
      ...base.borrador,
      cambios: [...base.borrador.cambios, ...sugeridas],
      excluidos: [...(base.borrador.excluidos ?? []), ...sugeridas.map((c) => c.clave)],
    },
  };

  it("⭐ sale con «?» y «¿es de «X»?» en el grupo de su ORIGEN, la leyenda explica «?», y ninguna línea suya dice «viene de»", () => {
    /* La edición que la pone en rojo: pintarla con `textoDelCambioDeTarea(…, "en-su-grupo")` (diría «viene de «origen»»,
       lo contrario de lo que pasa), agruparla en el destino, o no explicar «?» (el modelo no sabría que viene sin
       marcar y que solo se aplica si se marca). */
    expect(hechas, "el fixture no tiene dos hechas en la fase de origen").toHaveLength(2);
    const p = paraElChat(conSugeridas);
    const c = armarContextoConPropuesta(entrada(p), { techo: Number.POSITIVE_INFINITY });
    const lineas = c.texto.split("\n");
    expect(lineas, "falta la leyenda de «?»").toContain(LEYENDA_DE_LA_SUGERIDA);
    const grupo = p.resumen.grupos.find((g) => g.fase === origen.id)!;
    const cabeza = lineas.findIndex((l) => l.startsWith(`${grupo.numero}. `) && l.includes(` Tareas de «${origen.name}»`));
    expect(cabeza, "no está el grupo del origen").toBeGreaterThan(-1);
    expect(lineas[cabeza]).toContain("?2 sugeridas");
    const debajo = lineas.slice(cabeza + 1).filter((_, i, arr) => arr.slice(0, i + 1).every((l) => l.startsWith("   ")));
    const linea = debajo.find((l) => l.startsWith("   sugeridas: "));
    expect(linea, "las sugeridas no van debajo de su grupo de origen").toBeTruthy();
    for (const t of hechas) {
      const h = c.handles.get(t.id) ?? t.id;
      expect(linea).toContain(`[${h}] (¿es de «${destino.name}»?)`);
      const it = grupo.tareas.find((x) => x.ref === t.id)!;
      expect(it.etiqueta).toMatch(/^Semana \d+ · S\d+$/);
      expect(linea).toContain(`☐ ? ${it.etiqueta} ${it.titulo} [${h}] (¿es de «${destino.name}»?)`);
      for (const l of lineas.filter((x) => x.includes(`[${h}]`))) expect(l, "una línea de la sugerida dice «viene de»").not.toContain("viene de");
    }
    // El grupo del destino no las nombra.
    const delDestino = p.resumen.grupos.find((g) => g.fase === destino.id);
    for (const t of delDestino?.tareas ?? []) expect(hechas.map((x) => x.id)).not.toContain(t.ref);
    // Sin sugeridas, la leyenda no va (el texto de siempre).
    const sin = armarContextoConPropuesta(entrada(paraElChat(base)), { techo: Number.POSITIVE_INFINITY });
    expect(sin.texto).not.toContain(LEYENDA_DE_LA_SUGERIDA);
  });
});

describe("⛔ M2 P2e · lo que decide el sistema, en el contexto del chat", () => {
  /* Spec del replanteo §3.6 y D9 (2026-09-27): el kickoff que sobra y el que faltaba los decide el SISTEMA. Si el chat
     no lo supiera, los explicaría como una idea de la IA («la IA propone quitar…») o prometería que la IA los cambia. */
  const base = propuestaGrande({ fases: 6, vivas: 60, nuevas: 6, seVan: 4 });
  const seVa = base.borrador.cambios.find((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va")!;
  const kickoff: CambioTareaNueva = {
    tipo: "tarea-nueva",
    clave: "t:0f0f0f0f-0000-4000-a000-000000000001",
    fase: base.vivo.fases[0].id,
    tarea: { ...TAREA_DE_KICKOFF, hito: ["kickoff"] },
    motivo: MOTIVO_DEL_KICKOFF_QUE_FALTA,
    delSistema: "hito",
  };
  const conSistema = (excluidos: string[] = []) => ({
    vivo: base.vivo,
    borrador: {
      ...base.borrador,
      cambios: [
        ...base.borrador.cambios.map((c): Cambio => (c === seVa ? { ...seVa, motivo: "Ya hay un kickoff hecho: «X».", delSistema: "hito" } : c)),
        kickoff,
      ],
      ...(excluidos.length > 0 ? { excluidos } : {}),
    },
  });
  const veces = (texto: string, sub: string) => texto.split(sub).length - 1;

  it("⭐ la que quita dice «(lo decide el sistema: ya hay un kickoff)» y la que agrega «(… faltaba el kickoff)»; nada más lo dice", () => {
    /* Las ediciones que la ponen en rojo: no sumar `delSistema` a `fila` (la lista «se van») o a `renglon` (la fila
       «+» de LA PROPUESTA), o sumarlo a cualquier fila. */
    const c = armarContextoConPropuesta(entrada(paraElChat(conSistema())), { techo: Number.POSITIVE_INFINITY });
    const hSeVa = c.handles.get(seVa.tareaId) ?? seVa.tareaId;
    const hNueva = c.handles.get(kickoff.clave) ?? kickoff.clave;
    const seVanLinea = c.texto.split("\n").find((l) => l.startsWith("   se van: ") && l.includes(`[${hSeVa}]`));
    expect(seVanLinea, "la que quita el sistema no dice que es del sistema").toContain(`[${hSeVa}] ${DEL_SISTEMA_SE_QUITA}`);
    expect(c.texto).toContain(`+${TAREA_DE_KICKOFF.title} [${hNueva}] ${DEL_SISTEMA_SE_CREA}`);
    expect(veces(c.texto, "(lo decide el sistema")).toBe(2);
    // Sin lo del sistema, el texto de siempre.
    const sin = armarContextoConPropuesta(entrada(paraElChat(base)), { techo: Number.POSITIVE_INFINITY });
    expect(sin.texto).not.toContain("lo decide el sistema");
  });

  it("⭐ desmarcada, la que quita el sistema lo sigue diciendo (en su fila y en «desmarcadas»), también recortado", () => {
    /* La edición que la pone en rojo: decirlo solo en «se van» (desmarcada se leería como una pendiente cualquiera). */
    const c = armarContextoConPropuesta(entrada(paraElChat(conSistema([seVa.clave]))), { techo: Number.POSITIVE_INFINITY });
    const h = c.handles.get(seVa.tareaId) ?? seVa.tareaId;
    const lineas = c.texto.split("\n");
    expect(lineas.find((l) => l.startsWith("   desmarcadas: "))).toContain(`[${h}] ${DEL_SISTEMA_SE_QUITA}`);
    expect(lineas.some((l) => !l.startsWith("   desmarcadas: ") && l.includes(`[${h}] ${DEL_SISTEMA_SE_QUITA}`)), "su fila de LA PROPUESTA no lo dice").toBe(true);
    const recortado = armarContextoConPropuesta(entrada(paraElChat(conSistema([seVa.clave]))), { techo: 1_000 });
    expect(recortado.nivel).toBe(2);
    expect(veces(recortado.texto, DEL_SISTEMA_SE_QUITA)).toBe(2);
    expect(veces(recortado.texto, DEL_SISTEMA_SE_CREA)).toBe(1);
  });
});
