/**
 * lib/ai/proyeccion-base.ts — LA CUENTA DE LA BASE DE LA PROYECCIÓN, SIN BASE. PURO: recibe las sumas de los últimos
 * 30 días que lee lib/ai/proyeccion-server.ts y arma los componentes y las fracciones de ahorro de lib/ai/proyeccion.ts.
 * Separada del servidor para poder probarla con filas armadas a mano (lib/ai/proyeccion-base.test.ts).
 *
 * Cada componente agrupa procesos de lib/uso/ia.ts (`procesoDeLaFila`): así «leer una reunión» incluye lo que esa
 * lectura dispara (el clasificador, las tareas, el avance y la ficha), que es lo que de verdad cuesta una reunión más.
 */
import { crDateParts } from "@/lib/jobs/time";
import type { ClaveDeProceso } from "@/lib/uso/ia";
import { MODELO_DEL_CLASIFICADOR } from "./ahorro";
import { precioDe } from "./precios";
import { procesoDeLaFila } from "./gasto-mensual";
import { fraccionDeLaCacheDelPrompt, fraccionDelPrefijoCompartido, mesSiguiente, type BaseDeCalculo, type ComponenteMedido } from "./proyeccion";

export type BaseDeLaProyeccion = BaseDeCalculo & { desde: string; hasta: string };

const SLUG_LECTURA = "agent-post-session";
const SLUG_CLASIFICADOR = "agent-session-project-classifier";
export const SONNET = "claude-sonnet-4-6";
/** Lo que el pedido de los hechos manda además de la reunión (el cliente, los proyectos, las instrucciones). */
const TOKENS_FUERA_DE_LA_REUNION = 1_500;
/** Caracteres por token, para estimar el prompt del vigía. */
const CARACTERES_POR_TOKEN = 3.5;
/** El `stepLabel` de una corrida del vigía que salió del barrido diario. */
export const ETIQUETA_DEL_BARRIDO = "Watchdog CS (sweep)";

/** Los procesos del componente «Leer cada reunión»; los demás con unidad propia van aparte y el resto, a «resto». */
const DE_LAS_REUNIONES: readonly ClaveDeProceso[] = ["lectura", "tareas", "avance", "ficha"];

export interface FilaAgente {
  agentSlug: string | null;
  esAvance: boolean;
  esLectura: boolean;
  model: string;
  costo: number;
  llamadas: number;
  corridas: number;
  entrada: number;
}

/** La cuenta de la base, sin base: separada para poder probarla con filas armadas a mano. */
export function armarLaBase(e: {
  ahora: Date;
  desde: Date;
  agentes: readonly FilaAgente[];
  hechos: readonly { agentSlug: string; costo: number; llamadas: number; entrada: number }[];
  corridasDelVigia: Record<string, number>;
  /**
   * Las tandas del vigía: corridas que salen juntas y comparten la caché del prompt (el barrido de un día; los proyectos
   * de un cliente al entrar, en la misma hora).
   */
  tandasDelVigia: number;
  largoDelPromptDelVigia: number;
  proyectosActivos: number;
  hechosPrendidosHoy: boolean;
}): BaseDeLaProyeccion {
  const suma = (filtro: (f: FilaAgente) => boolean) =>
    e.agentes.filter(filtro).reduce((s, f) => ({ costo: s.costo + f.costo, llamadas: s.llamadas + f.llamadas, corridas: s.corridas + f.corridas, entrada: s.entrada + f.entrada }), { costo: 0, llamadas: 0, corridas: 0, entrada: 0 });
  const de = (claves: readonly ClaveDeProceso[]) => suma((f) => claves.includes(procesoDeLaFila(f)));

  const reuniones = de(DE_LAS_REUNIONES);
  const lecturas = suma((f) => f.agentSlug === SLUG_LECTURA).llamadas;
  const clasificador = suma((f) => f.agentSlug === SLUG_CLASIFICADOR && f.model === SONNET);
  const enLoteReuniones = de(["avance", "ficha"]);
  const vigia = de(["vigia"]);
  const chat = de(["chat"]);
  const procesos = de(["procesos"]);
  const venta = de(["venta"]);
  const todo = suma(() => true);
  const hechosHoy = de(["hechos"]);
  const resto = todo.costo - reuniones.costo - vigia.costo - chat.costo - procesos.costo - venta.costo - hechosHoy.costo;

  // Los hechos: lo medido en producción si ya corren; si no, el sondeo con Sonnet.
  const h = e.hechos.find((x) => x.agentSlug === "seguimiento-hechos" && x.llamadas >= 5) ?? e.hechos.find((x) => x.agentSlug === "sondeo-de-hechos");
  const costoHechos = h && h.llamadas ? h.costo / h.llamadas : 0;
  const tokensReunion = h && h.llamadas ? Math.max(0, h.entrada / h.llamadas - TOKENS_FUERA_DE_LA_REUNION) : 0;
  const entradaSonnet = precioDe(SONNET)?.entrada ?? 3;

  const corridasVigia = Object.values(e.corridasDelVigia).reduce((s, n) => s + n, 0);
  const delBarrido = e.corridasDelVigia[ETIQUETA_DEL_BARRIDO] ?? 0;
  const parteDelBarrido = corridasVigia ? delBarrido / corridasVigia : 0;
  const costoPorCorrida = vigia.llamadas ? vigia.costo / vigia.llamadas : 0;
  const porTanda = e.tandasDelVigia ? corridasVigia / e.tandasDelVigia : 0;

  const precioHaiku = precioDe("claude-haiku-4-5-20251001")?.entrada ?? 1;
  const yaEnHaiku = MODELO_DEL_CLASIFICADOR !== SONNET;

  const unitario = (x: { costo: number }, n: number) => (n > 0 ? x.costo / n : 0);
  const comp = (c: ComponenteMedido) => c;
  const componentes: ComponenteMedido[] = [
    comp({
      clave: "reuniones",
      nombre: "Leer cada reunión",
      unidad: "reunión leída",
      costoUnitario: unitario(reuniones, lecturas),
      volumenMensual: lecturas,
      escala: "reuniones",
      deDondeSale: `${lecturas} reuniones leídas en 30 días; incluye el clasificador, las tareas, el avance y la ficha que dispara cada una.`,
    }),
    comp({
      clave: "hechos",
      nombre: "Hechos de las reuniones",
      unidad: "reunión leída",
      costoUnitario: costoHechos,
      volumenMensual: lecturas,
      escala: "reuniones",
      deDondeSale: h
        ? `${h.agentSlug === "seguimiento-hechos" ? "Lo medido" : "El sondeo de hechos"} con Sonnet: ${h.llamadas} llamadas.${e.hechosPrendidosHoy ? "" : " Hoy están apagados (SEGUIMIENTO_HECHOS)."}`
        : "Sin medición todavía.",
    }),
    comp({
      clave: "vigia",
      nombre: "Vigía de las cuentas",
      unidad: "corrida",
      costoUnitario: costoPorCorrida,
      volumenMensual: vigia.llamadas,
      escala: "proyectos",
      deDondeSale: `${vigia.llamadas} corridas en 30 días (${Math.round(parteDelBarrido * 100)} % del barrido diario; el resto, al entrar a un cliente) sobre ${e.proyectosActivos} proyectos de la cartera.`,
    }),
    comp({ clave: "chat", nombre: "Chat", unidad: "turno", costoUnitario: unitario(chat, chat.llamadas), volumenMensual: chat.llamadas, escala: "clientes", deDondeSale: `${chat.llamadas} turnos en 30 días.` }),
    comp({
      clave: "procesos",
      nombre: "Mapeo de procesos (Opus)",
      unidad: "mapeo",
      costoUnitario: unitario(procesos, procesos.corridas || procesos.llamadas),
      volumenMensual: procesos.corridas || procesos.llamadas,
      escala: "clientes",
      deDondeSale: `${procesos.corridas} mapeos en 30 días.`,
    }),
    comp({ clave: "venta", nombre: "Preventa y propuestas", unidad: "mes", costoUnitario: venta.costo, volumenMensual: 1, escala: "clientes", deDondeSale: "Lo gastado en 30 días." }),
    comp({ clave: "resto", nombre: "Documentos, cronograma y lo demás", unidad: "mes", costoUnitario: Math.max(0, resto), volumenMensual: 1, escala: "clientes", deDondeSale: "Lo gastado en 30 días que no entra arriba." }),
  ];

  const cr = crDateParts(e.ahora);
  return {
    desde: e.desde.toISOString(),
    hasta: e.ahora.toISOString(),
    primerMes: mesSiguiente(cr.dateKey.slice(0, 7)),
    proyectosActivos: e.proyectosActivos,
    hechosPrendidosHoy: e.hechosPrendidosHoy,
    ultimoMesCompleto: null,
    componentes,
    ahorros: {
      modelosBaratos: yaEnHaiku || !reuniones.costo ? 0 : (clasificador.costo / reuniones.costo) * (1 - precioHaiku / entradaSonnet),
      lotesReuniones: reuniones.costo ? (enLoteReuniones.costo / reuniones.costo) * 0.5 : 0,
      lotesVigia: parteDelBarrido * 0.5,
      cacheVigia: fraccionDeLaCacheDelPrompt({
          tokensPrompt: e.largoDelPromptDelVigia / CARACTERES_POR_TOKEN,
          precioEntrada: entradaSonnet,
          costoPorCorrida,
          llamadasPorTanda: porTanda,
        }),
      prefijoCompartido: fraccionDelPrefijoCompartido({ tokensReunion, precioEntrada: entradaSonnet, costoHechos }),
    },
  };
}
