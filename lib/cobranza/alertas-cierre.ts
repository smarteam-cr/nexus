/**
 * lib/cobranza/alertas-cierre.ts
 *
 * Qué alertas se cierran solas y qué abre el refresco de cada noche. PURO: acá se decide;
 * `cerrarAlertasQueYaNoAplican` (lib/cobranza/mutations.ts) y `refrescarAlertasDeCobranza`
 * (lib/cobranza/alertas-refresco.ts) escriben.
 *
 * ── LO QUE PASABA HASTA EL 2026-09-12 ───────────────────────────────────────────
 * `upsertAlertas` abría y fundía, pero no cerraba nunca. Y lo único que la llamaba con la cartera
 * entera era el corte quincenal, apagado desde el 24-jul: el feed era una foto de ese día. Medido
 * en solo lectura el 2026-09-12, de 38 alertas vivas:
 *  - 9 hablaban de cobros que ya estaban cobrados (PRIMO, Cicadex, Honda, AMVAC, APRECAP);
 *  - 7 pedían confirmar catch-ups de Kaizen que el plan ya había corrido al futuro;
 *  - la INCONSISTENCIA_CICLO de Librería Internacional seguía abierta con la factura ya emitida;
 *  - y la promesa rota de ALMOTEC (31-ago) no iba a subir hasta el corte siguiente.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * 1. **Se cierra lo que el motor ya no ve.** Una alerta viva cuya situación `computeAlertSet` ya no
 *    produce se cierra. En las cuatro del ciclo de un cobro (alertas-merge.ts) se pregunta por el
 *    cobro y no por la clave: si el cobro pasó de vencido a promesa incumplida, la fila sube, no
 *    se cierra.
 * 2. **Una fila por situación.** Si quedaron dos vivas sobre lo mismo, se queda la que elige el
 *    merge (`filaQueSeQueda`) y la otra se cierra como copia.
 * 3. **Solo lo que produce el motor, y solo en las cuentas que evaluó.** SYNC_ODOO_FALLIDO y
 *    FACTURA_SIN_COBRO las abre el espejo de Odoo: medidas contra `computeAlertSet` se cerrarían
 *    todas, e INV24 exige que cada corrida fallida tenga la suya. Una cuenta excluida de la
 *    operación no se evalúa, así que tampoco se decide nada sobre ella.
 * 4. **El refresco de la noche solo ABRE la deuda del cliente** (COBRO_VENCIDO y
 *    PROMESA_INCUMPLIDA), que es lo que no puede esperar al corte. Lo demás —falta facturar,
 *    cuentas sin datos, catch-ups— lo sigue abriendo el corte, para no llenar el feed cada mañana.
 *    Pero una fila que YA está en el feed se pone al día aunque sea de otro tipo: la cuota #1 de
 *    Kaizen seguía «vencida hace 175 días» sobre una factura que se soltó. Una alerta que dice
 *    algo que dejó de ser cierto es peor que el ruido que se quería evitar.
 *    ⚠ Una excepción, por clave: la recurrencia que se apaga (etapa 14, `esAlertaDeRecurrencia`). Es
 *    un CUENTA_SIN_DATOS pero no es backlog de datos: es facturación que deja de existir, y avisa
 *    con 45 días. Esperar al corte, apagado en producción, era no avisar. Es una fila por servicio
 *    que se funde cada noche: no llena el feed.
 * 5. ⚠ **Lo que cierra el sistema no silencia lo que vuelve.** La supresión de 7 días de
 *    `upsertAlertas` existe para no volver a abrirle a una persona lo que ella acaba de resolver.
 *    Si la fila la cerró el sistema porque la situación desapareció y la situación vuelve —Alex
 *    saca de Cobrado un cobro mal confirmado—, es una alerta nueva y tiene que salir. Por eso
 *    estos cierres se firman con `RESUELTA_POR_SISTEMA`, y la supresión no los cuenta.
 */
import { esAlertaDeRecurrencia, type AlertaDraft, type CarteraEngineInput } from "./engine";
import {
  esDeLaFamiliaDelCobro,
  filaQueSeQueda,
  filasQueLeImportan,
  resolverMergeAlerta,
  type FilaViva,
} from "./alertas-merge";

/** Quién firma un cierre automático. ⚠ `upsertAlertas` lo lee: estos cierres no suprimen la reaparición (regla 5). */
export const RESUELTA_POR_SISTEMA = "sistema";

/** Los tipos que produce `computeAlertSet`: los únicos que se miden contra él (regla 3). */
export const TIPOS_DEL_MOTOR = [
  "COBRO_PROXIMO",
  "FACTURACION_ATRASADA",
  "COBRO_VENCIDO",
  "PROMESA_INCUMPLIDA",
  "CUENTA_SIN_DATOS",
  "INCONSISTENCIA_CICLO",
  "ARRANQUE_CAMBIADO",
  "MONTOS_DESCUADRADOS",
] as const satisfies readonly AlertaDraft["tipo"][];

/** Lo único que el refresco de la noche puede abrir: la deuda del cliente (regla 4). */
export const TIPOS_QUE_ABRE_EL_REFRESCO = ["COBRO_VENCIDO", "PROMESA_INCUMPLIDA"] as const satisfies readonly AlertaDraft["tipo"][];

const DEL_MOTOR = new Set<string>(TIPOS_DEL_MOTOR);
const ABRE_EL_REFRESCO = new Set<string>(TIPOS_QUE_ABRE_EL_REFRESCO);

export function esDelMotor(tipo: string): boolean {
  return DEL_MOTOR.has(tipo);
}

/** Las cuentas que `computeAlertSet` evaluó de verdad: con cuenta y dentro de la operación. */
export function cuentasEvaluadas(cartera: CarteraEngineInput): Set<string> {
  return new Set(cartera.cuentas.filter((c) => c.tieneCuenta && !c.excluidaOperacion).map((c) => c.cuentaId));
}

/**
 * Lo que el refresco de la noche le pasa a `upsertAlertas`: la deuda del cliente y la recurrencia que
 * se apaga, más todo borrador que cae sobre una fila que ya está viva (regla 4). Nunca abre otra cosa.
 */
export function borradoresDelRefresco(set: readonly AlertaDraft[], vivas: readonly FilaViva[]): AlertaDraft[] {
  return set.filter(
    (d) => ABRE_EL_REFRESCO.has(d.tipo) || esAlertaDeRecurrencia(d) || resolverMergeAlerta(d, vivas).accion === "fundir",
  );
}

/** Lo que el cierre necesita de una fila viva, además de lo que necesita el merge. */
export interface FilaCerrable extends FilaViva {
  cuentaId: string;
  mensaje: string;
}

export type MotivoDeCierre = "ya-no-aplica" | "copia";

export interface CierreDeAlerta {
  id: string;
  motivo: MotivoDeCierre;
  /** El texto con que queda la fila. Conserva lo que decía: es la traza de por qué estuvo abierta. */
  mensaje: string;
}

const CERRO_SOLA = "Se cerró sola:";

export function mensajeDeCierre(motivo: MotivoDeCierre, anterior: string): string {
  // Una fila que alguien reabrió y se vuelve a cerrar no encadena «Decía: «Se cerró sola…»».
  if (anterior.startsWith(CERRO_SOLA)) return anterior;
  const porque =
    motivo === "copia"
      ? `${CERRO_SOLA} había otra alerta abierta sobre lo mismo.`
      : `${CERRO_SOLA} lo que la abrió ya no pasa.`;
  return `${porque} Decía: «${anterior}»`;
}

/** El texto de las alertas de un cobro que se acaba de confirmar como cobrado. */
export function mensajeCobroConfirmado(confirmadoPor: string): string {
  return `${CERRO_SOLA} ${confirmadoPor} confirmó que el cobro entró.`;
}

/**
 * Las filas vivas que hay que cerrar, dado el set completo que produjo el motor HOY (reglas 1 a 3).
 *
 * ⚠ `set` tiene que ser el set COMPLETO de `computeAlertSet` para esas cuentas, no el filtrado del
 * refresco: medido contra el filtrado, todo lo que no es deuda se cerraría cada noche.
 */
export function alertasQueYaNoAplican(
  vivas: readonly FilaCerrable[],
  set: readonly AlertaDraft[],
  evaluadas: ReadonlySet<string>,
): CierreDeAlerta[] {
  const porClave = new Map<string, AlertaDraft>();
  const porCobro = new Map<string, AlertaDraft>();
  for (const d of set) {
    if (!porClave.has(d.dedupeKey)) porClave.set(d.dedupeKey, d);
    const { cobroDeLaFamilia } = filasQueLeImportan(d);
    if (cobroDeLaFamilia !== null && !porCobro.has(cobroDeLaFamilia)) porCobro.set(cobroDeLaFamilia, d);
  }

  const enAlcance = vivas.filter((f) => evaluadas.has(f.cuentaId) && esDelMotor(f.tipo));
  const cierres: CierreDeAlerta[] = [];
  for (const f of enAlcance) {
    const vigente =
      esDeLaFamiliaDelCobro(f.tipo) && f.cobroId !== null ? porCobro.get(f.cobroId) : porClave.get(f.dedupeKey);
    const motivo: MotivoDeCierre | null = !vigente
      ? "ya-no-aplica"
      : filaQueSeQueda(vigente, enAlcance)?.id === f.id
        ? null
        : "copia";
    if (motivo) cierres.push({ id: f.id, motivo, mensaje: mensajeDeCierre(motivo, f.mensaje) });
  }
  return cierres;
}
