/**
 * lib/escala/herramientas/parsear.ts — lee el mapa de herramientas. PURO.
 *
 * Estricto donde importa y tolerante con la prosa del comienzo. Dentro de una herramienta, cada línea
 * es un campo o un criterio; una línea que no se entiende es un ERROR con su número: un criterio mal
 * escrito no puede desaparecer del mapa en silencio.
 *
 *   ## Insider One
 *   *Clave:* insider
 *   *Color:* fucsia
 *   *Qué es:* …
 *   - `2.2.O1` Lo que aporta ahí, en una línea.
 *
 * `### Ventas` (o cualquier subtítulo) puede ordenar la lista de una herramienta: no cambia nada.
 * `## Historial de versiones` no es una herramienta: son las entradas `**1.0.0 (2026-10-01).** …`.
 */
import { leerEncabezado, lineasDe, parrafos, sinTildes } from "../documento/parsear";
import { ErrorDeFormato, type Letra } from "../documento/tipos";
import {
  COLORES_DE_HERRAMIENTA,
  LETRAS_QUE_SE_MAPEAN,
  type ColorDeHerramienta,
  type EntradaDelHistorialDelMapa,
  type Herramienta,
  type MapaDeHerramientas,
} from "./tipos";

/** Los campos de una herramienta, por su nombre sin tildes ni mayúsculas. */
const CAMPOS = {
  clave: "clave",
  sigla: "sigla",
  color: "color",
  "que es": "queEs",
  "cuando conviene": "cuandoConviene",
  revisado: "revisado",
  responsable: "responsable",
} as const;
type Campo = (typeof CAMPOS)[keyof typeof CAMPOS];

const CAMPO = /^\*([^*:]+):\*\s*(.*)$/;
const CRITERIO = /^- `(\d\.\d\.([DIFEO])\d+)`\s+(.+)$/;
const CLAVE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HISTORIAL = /^\*\*(\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\.\*\*\s*(.*)$/;
const ES_HISTORIAL = /^historial de versiones$/;

/** Una línea de criterio tan larga ya no se lee de un vistazo en una celda de la matriz. */
export const LARGO_MAXIMO_DEL_APORTE = 180;

export function parsearMapaDeHerramientas(texto: string): MapaDeHerramientas {
  const lineas = lineasDe(texto);
  const encabezado = leerEncabezado(texto);
  if (!encabezado.version) throw new ErrorDeFormato("El mapa no dice su versión en el encabezado (version: 1.0.0).");
  if (!/^\d+\.\d+\.\d+$/.test(encabezado.version)) throw new ErrorDeFormato(`La versión «${encabezado.version}» no es del tipo 1.0.0.`);

  // Dónde empieza el cuerpo: después del encabezado, si lo hay.
  let i = 0;
  if (lineas[0]?.trim() === "---") {
    i = lineas.findIndex((l, j) => j > 0 && l.trim() === "---") + 1;
    if (i === 0) throw new ErrorDeFormato("El encabezado no se cierra con ---.", 1);
  }

  const intro: string[] = [];
  const herramientas: Herramienta[] = [];
  const historial: EntradaDelHistorialDelMapa[] = [];

  // La prosa del comienzo: lo que hay entre el título y la primera sección.
  const primeraSeccion = lineas.findIndex((l, j) => j >= i && /^## /.test(l));
  const prosa = lineas.slice(i, primeraSeccion === -1 ? undefined : primeraSeccion).filter((l) => !/^# /.test(l));
  intro.push(...parrafos(prosa).filter(Boolean));
  if (primeraSeccion === -1) throw new ErrorDeFormato("El mapa no trae ninguna herramienta (## Nombre).");

  let actual: (Partial<Record<Campo, string>> & { nombre: string; linea: number; aportes: Record<string, string> }) | null = null;
  let enHistorial = false;

  const cerrar = () => {
    if (!actual) return;
    herramientas.push(herramientaCompleta(actual));
    actual = null;
  };

  for (let j = primeraSeccion; j < lineas.length; j++) {
    const linea = lineas[j].trimEnd();
    const n = j + 1;
    if (!linea.trim()) continue;

    const seccion = /^## (.+)$/.exec(linea);
    if (seccion) {
      cerrar();
      const nombre = seccion[1].trim();
      enHistorial = ES_HISTORIAL.test(sinTildes(nombre).toLowerCase());
      if (!enHistorial) actual = { nombre, linea: n, aportes: {} };
      continue;
    }
    if (/^#{1,2} /.test(linea)) throw new ErrorDeFormato(`Un título de primer nivel va solo al comienzo: «${linea}».`, n);

    if (enHistorial) {
      const h = HISTORIAL.exec(linea);
      if (h) historial.push({ version: h[1], fecha: h[2], texto: h[3].trim() });
      else if (historial.length) historial[historial.length - 1].texto += ` ${linea.trim()}`;
      continue;
    }
    if (!actual) continue;
    const a = actual as NonNullable<typeof actual>;

    if (/^###+ /.test(linea)) continue;

    const campo = CAMPO.exec(linea);
    if (campo) {
      const nombre = sinTildes(campo[1].trim()).toLowerCase() as keyof typeof CAMPOS;
      const destino = CAMPOS[nombre];
      if (!destino) throw new ErrorDeFormato(`«${campo[1]}» no es un campo de una herramienta (${Object.keys(CAMPOS).join(", ")}).`, n);
      if (a[destino] !== undefined) throw new ErrorDeFormato(`«${a.nombre}» dice dos veces su ${campo[1].toLowerCase()}.`, n);
      a[destino] = campo[2].trim();
      continue;
    }

    const criterio = CRITERIO.exec(linea);
    if (criterio) {
      const [, id, letra, aporte] = criterio;
      if (!LETRAS_QUE_SE_MAPEAN.includes(letra as Letra)) {
        throw new ErrorDeFormato(`${id}: solo se mapean criterios de Funcional, Eficiente y Óptimo (Deficiente e Inicial describen lo que falta).`, n);
      }
      if (a.aportes[id] !== undefined) throw new ErrorDeFormato(`«${a.nombre}» nombra dos veces ${id}.`, n);
      const limpio = aporte.trim();
      if (limpio.length > LARGO_MAXIMO_DEL_APORTE) {
        throw new ErrorDeFormato(`${id}: lo que aporta «${a.nombre}» tiene ${limpio.length} caracteres; el máximo es ${LARGO_MAXIMO_DEL_APORTE}.`, n);
      }
      a.aportes[id] = limpio;
      continue;
    }

    throw new ErrorDeFormato(`No entiendo esta línea dentro de «${a.nombre}»: «${linea.trim().slice(0, 80)}». Una herramienta solo lleva campos (*Clave:* …) y criterios (- \`1.2.F3\` …).`, n);
  }
  cerrar();

  if (herramientas.length === 0) throw new ErrorDeFormato("El mapa no trae ninguna herramienta (## Nombre).");
  for (const [que, de] of [
    ["clave", (h: Herramienta) => h.clave],
    ["nombre", (h: Herramienta) => h.nombre.toLowerCase()],
    ["sigla", (h: Herramienta) => h.sigla],
  ] as const) {
    const vistos = new Set<string>();
    for (const h of herramientas) {
      if (vistos.has(de(h))) throw new ErrorDeFormato(`Dos herramientas tienen la misma ${que}: «${de(h)}».`);
      vistos.add(de(h));
    }
  }

  return {
    version: encabezado.version,
    escala: encabezado.escala || null,
    fecha: encabezado.fecha || null,
    estado: encabezado.estado || null,
    intro,
    herramientas,
    historial,
  };
}

function herramientaCompleta(h: Partial<Record<Campo, string>> & { nombre: string; linea: number; aportes: Record<string, string> }): Herramienta {
  const falta = (que: string) => new ErrorDeFormato(`«${h.nombre}» no dice su ${que}.`, h.linea);
  if (!h.clave) throw falta("clave (*Clave:* insider)");
  if (!CLAVE.test(h.clave)) throw new ErrorDeFormato(`La clave de «${h.nombre}» va en minúsculas y sin espacios: «${h.clave}».`, h.linea);
  if (!h.color) throw falta("color (*Color:* celeste)");
  const color = sinTildes(h.color).toLowerCase() as ColorDeHerramienta;
  if (!COLORES_DE_HERRAMIENTA.includes(color)) {
    throw new ErrorDeFormato(`El color de «${h.nombre}» es «${h.color}»; puede ser ${COLORES_DE_HERRAMIENTA.join(", ")}.`, h.linea);
  }
  if (!h.queEs) throw falta("qué es (*Qué es:* …)");
  const sigla = (h.sigla || h.nombre.charAt(0)).toUpperCase();
  if (sigla.length > 2) throw new ErrorDeFormato(`La sigla de «${h.nombre}» va en una o dos letras: «${sigla}».`, h.linea);
  if (Object.keys(h.aportes).length === 0) throw new ErrorDeFormato(`«${h.nombre}» no nombra ningún criterio.`, h.linea);
  return {
    clave: h.clave,
    nombre: h.nombre,
    sigla,
    color,
    queEs: h.queEs,
    cuandoConviene: h.cuandoConviene || null,
    revisado: h.revisado || null,
    responsable: h.responsable || null,
    aportes: h.aportes,
  };
}
