/**
 * lib/carga/calibracion.ts — lo que la calibración PROPONE para los supuestos de la carga (2026-10-07). PURO.
 *
 * Nexus compara lo que el equipo respondió con lo que suponía la carga y propone un número nuevo. Nada entra solo: la
 * CSL o dirección lo usa («Usar» guarda una fila nueva de `ConfigCarga` con el porqué) o lo descarta (queda en
 * `descartes` y no vuelve hasta que cambie el número propuesto).
 *
 * ── TRES CLASES DE PROPUESTA ─────────────────────────────────────────────────
 * 1. Por TIPO DE FASE, con META_PARA_CALIBRAR (20) respuestas al terminar una tarea común de ese tipo. Cada respuesta se
 *    compara con lo que suponía la carga PARA ESA TAREA (con su parte y el factor de su cuenta): la propuesta es
 *    «supuesto × la mediana de las razones». Así una cuenta difícil no infla el número de todos.
 * 2. Por TAREA CLAVE (lib/tiempos/familias.ts), en dos niveles, porque una tarea clave se termina pocas veces al mes:
 *    - con META_DE_TAREA_CLAVE (10) respuestas al terminarla: lo que tomaron, descontando la parte y el factor de cada
 *      cuenta (la mediana);
 *    - si no, con MINIMO_DEL_ARRANQUE (3) respuestas de la encuesta de arranque: la mediana de lo que dijo el equipo.
 * 3. Por VARIABLE DEL FACTOR, con CUENTAS_POR_GRUPO (5) cuentas con la variable y 5 sin ella: si las que la tienen
 *    piden más (o menos) de lo que predice su factor que las demás, se propone subir (o bajar) su peso.
 *
 * Solo se propone un cambio que se note (POCO_CAMBIO): mover 2 h a 2,1 h es ruido.
 */
import { familiaDe, FAMILIAS, type ClaveDeFamilia } from "@/lib/tiempos/familias";
import { cuantil, META_DE_TAREA_CLAVE, META_PARA_CALIBRAR, MINIMO_DEL_ARRANQUE } from "@/lib/tiempos/reglas";
import { DESCRIPCION_DE_PESO, ETIQUETA_DE_TIPO, PESOS, TIPOS_DE_FASE, type ConfigCarga, type Peso, type TipoDeFase } from "./config";
import type { FactorExplicado } from "./complejidad";

/** Cuentas con la variable y sin ella que hacen falta para proponer un peso. */
export const CUENTAS_POR_GRUPO = 5;
/** Una razón entre 0,9 y 1,1 no se propone: es ruido. */
export const POCO_CAMBIO = 0.1;

export type ClaseDePropuesta = "tipo" | "familia" | "peso";

export interface PropuestaDeCalibracion {
  /** «tipo:CONFIGURACION», «familia:pipeline», «peso:integracion»: identifica qué cambia (y su descarte). */
  clave: string;
  clase: ClaseDePropuesta;
  /** Qué cambia, para una persona: «Configuración», «Pipeline o etapas», «Integración». */
  que: string;
  /** El valor de hoy (horas o peso). null = una tarea clave sin número propio (cuenta como su tipo de fase). */
  actual: number | null;
  propuesto: number;
  unidad: "h" | "peso";
  /** Por qué, en una frase con sus números. Es lo que queda como motivo si se usa. */
  porque: string;
  respuestas: number;
  fuente: "al-terminar" | "arranque" | "cuentas";
  /** Alguien ya la descartó con este mismo número. */
  descartada: boolean;
}

export interface RespuestaAlTerminar {
  tipoFase: string | null;
  titulo: string;
  minutos: number;
  /** Lo que suponía la carga al preguntar, con la parte y el factor (minutos). */
  estimado: number | null;
}

export interface RespuestaDelArranque {
  familia: string;
  minutos: number;
}

export interface CuentaParaCalibrar {
  factor: FactorExplicado;
  horasSemana: number;
}

const r = (x: number, paso: number) => Math.round(x / paso) * paso;
const redondearHoras = (h: number) => Math.max(0.25, r(h, 0.25));
const redondearPeso = (p: number) => Math.min(2, Math.max(0, Math.round(r(p, 0.05) * 100) / 100));
const coma = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const horasTexto = (h: number) => `${coma(h, 2)} h`;

function tipoDe(t: string | null): TipoDeFase {
  return t && (TIPOS_DE_FASE as readonly string[]).includes(t) ? (t as TipoDeFase) : "SIN";
}

/** Una razón que no se aleja de 1 no se propone. */
const seNota = (razon: number) => Math.abs(razon - 1) >= POCO_CAMBIO;

export function propuestasDeCalibracion(
  config: ConfigCarga,
  alTerminar: readonly RespuestaAlTerminar[],
  delArranque: readonly RespuestaDelArranque[],
  cuentas: readonly CuentaParaCalibrar[],
): PropuestaDeCalibracion[] {
  const out: PropuestaDeCalibracion[] = [];
  const descartada = (clave: string, propuesto: number) => config.descartes[clave] !== undefined && Math.abs(config.descartes[clave] - propuesto) < 1e-6;
  const validas = alTerminar.filter((x) => x.minutos > 0 && x.estimado !== null && x.estimado > 0);

  // 1 · Por tipo de fase: las tareas comunes, o las clave que todavía cuentan como su tipo.
  for (const tipo of TIPOS_DE_FASE) {
    const suyas = validas.filter((x) => {
      if (tipoDe(x.tipoFase) !== tipo) return false;
      const f = familiaDe(x.titulo);
      return !f || config.horasPorFamilia[f] === undefined;
    });
    if (suyas.length < META_PARA_CALIBRAR) continue;
    const razon = cuantil(
      suyas.map((x) => Math.round((x.minutos / (x.estimado as number)) * 1000)),
      0.5,
    )! / 1000;
    if (!seNota(razon)) continue;
    const actual = config.horasPorTipo[tipo];
    const propuesto = redondearHoras(actual * razon);
    if (propuesto === actual) continue;
    const clave = `tipo:${tipo}`;
    out.push({
      clave,
      clase: "tipo",
      que: ETIQUETA_DE_TIPO[tipo],
      actual,
      propuesto,
      unidad: "h",
      porque: `${suyas.length} respuestas al terminar una tarea de ${ETIQUETA_DE_TIPO[tipo]}: tomaron ${coma(razon, 2)} veces lo que suponía la carga para cada una (la mediana). Pasa de ${horasTexto(actual)} a ${horasTexto(propuesto)} por tarea, antes del factor.`,
      respuestas: suyas.length,
      fuente: "al-terminar",
      descartada: descartada(clave, propuesto),
    });
  }

  // 2 · Por tarea clave.
  for (const f of FAMILIAS) {
    const actual = config.horasPorFamilia[f.clave] ?? null;
    const clave = `familia:${f.clave}`;
    const terminadas = validas.filter((x) => familiaDe(x.titulo) === f.clave);
    if (terminadas.length >= META_DE_TAREA_CLAVE) {
      // Lo que tomó cada una, sin su parte ni el factor de su cuenta: lo que hubiera tomado en la cuenta base.
      const bases = terminadas.map((x) => {
        const baseDeEntonces = actual ?? config.horasPorTipo[tipoDe(x.tipoFase)];
        return Math.round((x.minutos / (x.estimado as number)) * baseDeEntonces * 100);
      });
      const propuesto = redondearHoras(cuantil(bases, 0.5)! / 100);
      if (actual !== null && (propuesto === actual || !seNota(propuesto / actual))) continue;
      out.push({
        clave,
        clase: "familia",
        que: f.nombre,
        actual,
        propuesto,
        unidad: "h",
        porque: `${terminadas.length} respuestas al terminar «${f.nombre}»: descontando la parte de Smarteam y el factor de cada cuenta, la mediana es ${horasTexto(propuesto)}.${actual === null ? " Hoy cuenta como su tipo de fase." : ` Hoy son ${horasTexto(actual)}.`}`,
        respuestas: terminadas.length,
        fuente: "al-terminar",
        descartada: descartada(clave, propuesto),
      });
      continue;
    }
    const dichas = delArranque.filter((x) => x.familia === f.clave && x.minutos > 0).map((x) => x.minutos);
    if (dichas.length >= MINIMO_DEL_ARRANQUE) {
      const propuesto = redondearHoras(cuantil(dichas, 0.5)! / 60);
      if (actual !== null && (propuesto === actual || !seNota(propuesto / actual))) continue;
      out.push({
        clave,
        clase: "familia",
        que: f.nombre,
        actual,
        propuesto,
        unidad: "h",
        porque: `${dichas.length} personas dijeron en la encuesta de arranque cuánto les toma normalmente: la mediana es ${horasTexto(propuesto)}. Se confirma con ${META_DE_TAREA_CLAVE} respuestas al terminarla (hoy ${terminadas.length}).${actual === null ? " Hoy cuenta como su tipo de fase." : ""}`,
        respuestas: dichas.length,
        fuente: "arranque",
        descartada: descartada(clave, propuesto),
      });
    }
  }

  // 3 · Por variable del factor: ¿las cuentas con la variable piden más de lo que predice su factor que las demás?
  const conRazon = cuentas.filter((c) => c.horasSemana > 0 && c.factor.factor > 0);
  if (conRazon.length >= CUENTAS_POR_GRUPO * 2) {
    const k = conRazon.reduce((a, c) => a + c.horasSemana, 0) / conRazon.reduce((a, c) => a + c.factor.factor, 0);
    const razonDe = (c: CuentaParaCalibrar) => c.horasSemana / (k * c.factor.factor);
    for (const peso of PESOS) {
      const variable = DESCRIPCION_DE_PESO[peso].variable;
      if (peso === "topeHubs") continue; // es un tope, no una variable que se tenga o no
      const tiene = (c: CuentaParaCalibrar) => c.factor.variables.some((v) => v.clave === variable && v.suma > 0 && pesoDeLaVariable(peso, v, config));
      const sinDato = (c: CuentaParaCalibrar) => c.factor.variables.some((v) => v.clave === variable && v.estado === "falta");
      const con = conRazon.filter(tiene);
      const sin = conRazon.filter((c) => !tiene(c) && !sinDato(c));
      if (con.length < CUENTAS_POR_GRUPO || sin.length < CUENTAS_POR_GRUPO) continue;
      const rCon = cuantil(con.map((c) => Math.round(razonDe(c) * 1000)), 0.5)! / 1000;
      const rSin = cuantil(sin.map((c) => Math.round(razonDe(c) * 1000)), 0.5)! / 1000;
      if (rSin <= 0) continue;
      const relativa = rCon / rSin;
      if (!seNota(relativa)) continue;
      const actual = config.pesos[peso];
      const factorCon = con.reduce((a, c) => a + c.factor.factor, 0) / con.length;
      const propuesto = redondearPeso(actual + factorCon * (relativa - 1));
      if (propuesto === actual) continue;
      const clave = `peso:${peso}`;
      const nombre = DESCRIPCION_DE_PESO[peso].nombre;
      out.push({
        clave,
        clase: "peso",
        que: nombre,
        actual,
        propuesto,
        unidad: "peso",
        porque: `Las ${con.length} cuentas con «${nombre}» piden ${coma(rCon, 2)} veces lo que predice su factor; las ${sin.length} sin ella, ${coma(rSin, 2)}. ${relativa > 1 ? "Su peso se queda corto" : "Su peso sobra"}: pasa de +${coma(actual, 2)} a +${coma(propuesto, 2)}.`,
        respuestas: con.length + sin.length,
        fuente: "cuentas",
        descartada: descartada(clave, propuesto),
      });
    }
  }
  return out;
}

/**
 * Los pesos que comparten una variable se separan por lo que dice el valor: «usuarios» suma `usuarios10` o
 * `usuarios30`; «etapa», `implementacion` o `adopcion`. Sin esto, las cuentas con 30 usuarios contarían para el peso de
 * 10 a 29.
 */
function pesoDeLaVariable(peso: Peso, v: { valor: string; suma: number }, config: ConfigCarga): boolean {
  const n = Number.parseInt(v.valor, 10);
  if (peso === "usuarios10") return Number.isFinite(n) && n >= 10 && n < 30;
  if (peso === "usuarios30") return Number.isFinite(n) && n >= 30;
  if (peso === "implementacion") return Math.abs(v.suma - config.pesos.implementacion) < 0.005;
  if (peso === "adopcion") return Math.abs(v.suma - config.pesos.adopcion) < 0.005 && Math.abs(v.suma - config.pesos.implementacion) >= 0.005;
  return true;
}

/** Aplica una propuesta a una configuración (lo que hace «Usar»). Devuelve una copia. */
export function aplicarPropuesta(config: ConfigCarga, clave: string, propuesto: number): ConfigCarga {
  const c: ConfigCarga = structuredClone(config);
  const [clase, cual] = clave.split(":");
  if (clase === "tipo" && (TIPOS_DE_FASE as readonly string[]).includes(cual)) c.horasPorTipo[cual as TipoDeFase] = propuesto;
  else if (clase === "familia" && FAMILIAS.some((f) => f.clave === cual)) c.horasPorFamilia[cual as ClaveDeFamilia] = propuesto;
  else if (clase === "peso" && (PESOS as readonly string[]).includes(cual)) c.pesos[cual as Peso] = propuesto;
  else throw new Error(`No se reconoce la propuesta «${clave}».`);
  delete c.descartes[clave];
  return c;
}

/** Guarda el descarte de una propuesta (lo que hace «Descartar»). Devuelve una copia. */
export function descartarPropuesta(config: ConfigCarga, clave: string, propuesto: number): ConfigCarga {
  const c: ConfigCarga = structuredClone(config);
  c.descartes[clave] = propuesto;
  return c;
}
