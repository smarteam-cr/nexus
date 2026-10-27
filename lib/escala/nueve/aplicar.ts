/**
 * lib/escala/nueve/aplicar.ts — aplica el catálogo del borrador 9.0.0 sobre los datos de la 8.9.1. PURO.
 *
 * Trabaja sobre `EscalaDatos` (lib/escala/datos/tipos.ts), la misma forma que guarda `EscalaVersion`, y
 * respeta las reglas que la escala ya hace cumplir al publicar (lib/escala/documento/validar.ts):
 *   · Un identificador que sale no se vuelve a usar: el número nuevo salta los retirados de la
 *     especificación y los de este borrador (`nuevoIdDeCriterio`).
 *   · Nada queda nombrando a un criterio que se fue: quien lo requería pasa a requerir el que lo
 *     reemplaza (o lo deja de requerir), y cada edición deja de nombrarlo.
 *   · COBERTURA de las ediciones (prueba 8): si una edición toca una dimensión, dice algo de cada criterio
 *     general de ella. Un criterio nuevo entra en «Se leen igual» de esa edición, salvo que la entrada
 *     diga otra cosa. Lo que una edición decía de un criterio que salió queda anotado como CONSECUENCIA,
 *     para que se decida con la edición en «Lo que falta decidir».
 * Lo que no hace: tocar el cálculo ni la especificación (los identificadores retirados se anotan ahí al
 * publicar, prueba 5).
 */
import { ErrorDeFormato, type Letra } from "@/lib/escala/documento/tipos";
import { nuevoIdDeCriterio } from "@/lib/escala/datos/editar";
import { escalaDeLosDatos, generarMarkdown } from "@/lib/escala/datos/generar";
import { importarEscala } from "@/lib/escala/datos/importar";
import type {
  Bloque,
  CriterioDeLaEdicion,
  CriterioDeLaEscala,
  DimensionDeLaEdicion,
  DimensionDeLaMatriz,
  EdicionDeLaEscala,
  EscalaDatos,
  NivelDeLaEdicion,
  NivelDeLaMatriz,
  ParteDeEdiciones,
} from "@/lib/escala/datos/tipos";
import type { Campos, Entrada, Operacion, Ref } from "./tipos";

const LETRAS: readonly Letra[] = ["D", "I", "F", "E", "O"];
const ID_DE_NIVEL = /^(\d+\.\d+)\.([DIFEO])$/;
const ID_DE_CRITERIO = /^(\d+\.\d+)\.([DIFEO])(\d+)$/;

export class ErrorDelCatalogo extends Error {
  constructor(punto: string, mensaje: string) {
    super(`[${punto}] ${mensaje}`);
    this.name = "ErrorDelCatalogo";
  }
}

/** Lo que una edición decía de un criterio que cambió, y que hay que decidir con la edición. */
export interface Consecuencia {
  punto: string;
  edicion: string;
  texto: string;
}

export interface EstadoDelBorrador {
  datos: EscalaDatos;
  /** alias → identificador que le tocó. */
  alias: Record<string, string>;
  /** Los retirados de la especificación (no se reusan). */
  retiradosPrevios: string[];
  /** Los que retira este borrador, en orden. */
  retirados: string[];
  consecuencias: Consecuencia[];
}

export function estadoInicial(datos: EscalaDatos, retiradosPrevios: readonly string[]): EstadoDelBorrador {
  return { datos: structuredClone(datos), alias: {}, retiradosPrevios: [...retiradosPrevios], retirados: [], consecuencias: [] };
}

// ── Búsquedas ─────────────────────────────────────────────────────────────────

function dimensiones(datos: EscalaDatos): DimensionDeLaMatriz[] {
  return datos.partes.flatMap((p) => (p.tipo === "matriz" ? p.areas.flatMap((a) => a.capas.flatMap((c) => c.dimensiones)) : []));
}

function parteDeEdiciones(datos: EscalaDatos): ParteDeEdiciones | null {
  return (datos.partes.find((p) => p.tipo === "ediciones") as ParteDeEdiciones | undefined) ?? null;
}

function ediciones(datos: EscalaDatos): EdicionDeLaEscala[] {
  return parteDeEdiciones(datos)?.ediciones ?? [];
}

function nivelDeLaMatriz(datos: EscalaDatos, nivelId: string): { dim: DimensionDeLaMatriz; nivel: NivelDeLaMatriz } | null {
  const m = ID_DE_NIVEL.exec(nivelId);
  if (!m) return null;
  const dim = dimensiones(datos).find((d) => d.id === m[1]);
  const nivel = dim?.niveles.find((n) => n.letra === m[2]);
  return dim && nivel ? { dim, nivel } : null;
}

function criterioDeLaMatriz(datos: EscalaDatos, id: string): { dim: DimensionDeLaMatriz; nivel: NivelDeLaMatriz; criterio: CriterioDeLaEscala } | null {
  const m = ID_DE_CRITERIO.exec(id);
  if (!m) return null;
  const donde = nivelDeLaMatriz(datos, `${m[1]}.${m[2]}`);
  const criterio = donde?.nivel.criterios.find((c) => c.id === id);
  return donde && criterio ? { ...donde, criterio } : null;
}

function edicion(datos: EscalaDatos, clave: string): EdicionDeLaEscala | null {
  return ediciones(datos).find((e) => e.clave === clave) ?? null;
}

function dimensionDeLaEdicion(e: EdicionDeLaEscala, dimId: string): DimensionDeLaEdicion | null {
  for (const a of e.areas) for (const d of a.dimensiones) if (d.id === dimId) return d;
  return null;
}

/** ¿La edición dice algo de los criterios de esa dimensión? Si sí, tiene que decir algo de todos (prueba 8). */
function tocaCriterios(d: DimensionDeLaEdicion): boolean {
  return d.niveles.some((n) => n.criterios.length > 0) || d.noAplican.length > 0 || d.seLeenIgual.length > 0;
}

function nivelDeLaEdicion(d: DimensionDeLaEdicion, letra: Letra): NivelDeLaEdicion {
  let n = d.niveles.find((x) => x.letra === letra);
  if (!n) {
    n = { letra, frase: null, resultado: null, criterios: [] };
    d.niveles.push(n);
    d.niveles.sort((a, b) => LETRAS.indexOf(a.letra) - LETRAS.indexOf(b.letra));
  }
  return n;
}

/** Todos los identificadores de criterio en uso: matriz y propios de cada edición. */
function idsEnUso(datos: EscalaDatos): Set<string> {
  const out = new Set<string>();
  for (const d of dimensiones(datos)) for (const n of d.niveles) for (const c of n.criterios) out.add(c.id);
  for (const e of ediciones(datos)) for (const a of e.areas) for (const d of a.dimensiones) for (const n of d.niveles) for (const c of n.criterios) if (c.tipo === "propio") out.add(c.id);
  return out;
}

/** El orden de los criterios de una dimensión de la matriz: para dejar «Se leen igual» y «No aplican» en ese orden. */
function ordenar(datos: EscalaDatos, dimId: string, ids: string[]): string[] {
  const dim = dimensiones(datos).find((d) => d.id === dimId);
  const orden = dim ? dim.niveles.flatMap((n) => n.criterios.map((c) => c.id)) : [];
  return [...new Set(ids)].sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
}

/** La tabla «Riesgos» de la prosa (un bloque de tabla después del título «## Riesgos»). */
function tablaDeRiesgos(datos: EscalaDatos): Extract<Bloque, { tipo: "tabla" }> | null {
  for (const p of datos.partes) {
    if (p.tipo !== "prosa") continue;
    const i = p.bloques.findIndex((b) => b.tipo === "titulo" && b.nivel === 2 && b.texto === "Riesgos");
    if (i === -1) continue;
    const t = p.bloques.slice(i + 1).find((b) => b.tipo === "tabla" || b.tipo === "titulo");
    return t?.tipo === "tabla" ? t : null;
  }
  return null;
}

const idsDeLaCelda = (celda: string) => [...celda.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const celdaDeIds = (ids: string[]) => ids.map((x) => "`" + x + "`").join(", ");

const dimDe = (id: string) => ID_DE_CRITERIO.exec(id)?.[1] ?? ID_DE_NIVEL.exec(id)?.[1] ?? "";

// ── El aplicador ──────────────────────────────────────────────────────────────

class Aplicador {
  constructor(
    readonly s: EstadoDelBorrador,
    readonly punto: string,
  ) {}

  private falla(mensaje: string): never {
    throw new ErrorDelCatalogo(this.punto, mensaje);
  }

  ref(r: Ref): string {
    if (!r.startsWith("@")) return r;
    const id = this.s.alias[r];
    if (!id) this.falla(`el alias ${r} no existe todavía (¿lo crea una entrada anterior?).`);
    return id;
  }

  private retirados(): string[] {
    return [...this.s.retiradosPrevios, ...this.s.retirados];
  }

  private campos(c: Campos): Omit<CriterioDeLaEscala, "id"> {
    return {
      texto: c.texto,
      verificacion: c.verificacion,
      riesgo: !!c.riesgo,
      habito: !!c.habito,
      perfil: c.perfil ?? null,
      requiere: (c.requiere ?? []).map((r) => this.ref(r)),
    };
  }

  private cambiar(criterio: CriterioDeLaEscala, cambios: Partial<Campos>): void {
    if (cambios.texto !== undefined) criterio.texto = cambios.texto;
    if (cambios.verificacion !== undefined) criterio.verificacion = cambios.verificacion;
    if (cambios.riesgo !== undefined) criterio.riesgo = cambios.riesgo;
    if (cambios.habito !== undefined) criterio.habito = cambios.habito;
    if (cambios.perfil !== undefined) criterio.perfil = cambios.perfil;
    if (cambios.requiere !== undefined) criterio.requiere = cambios.requiere.map((r) => this.ref(r));
  }

  private registrarAlias(alias: string, id: string): void {
    if (!alias.startsWith("@")) this.falla(`el alias «${alias}» tiene que empezar con @.`);
    if (this.s.alias[alias]) this.falla(`el alias ${alias} ya existe.`);
    this.s.alias[alias] = id;
  }

  /** Un criterio nuevo de la matriz entra en «Se leen igual» de cada edición que toca su dimensión. */
  private cubrirEnLasEdiciones(id: string): void {
    for (const e of ediciones(this.s.datos)) {
      const d = dimensionDeLaEdicion(e, dimDe(id));
      if (!d || !tocaCriterios(d)) continue;
      if (d.noAplican.includes(id) || d.seLeenIgual.includes(id) || d.niveles.some((n) => n.criterios.some((c) => c.tipo === "reescrito" && c.id === id))) continue;
      d.seLeenIgual = ordenar(this.s.datos, d.id, [...d.seLeenIgual, id]);
    }
  }

  /** Quien requería `id` pasa a requerir `reemplazo` (o deja de requerirlo). En la matriz y en los propios. */
  private reapuntarRequeridos(id: string, reemplazo: string | null): void {
    const cambiar = (c: { requiere: string[] }) => {
      if (!c.requiere.includes(id)) return;
      c.requiere = [...new Set(c.requiere.flatMap((r) => (r === id ? (reemplazo ? [reemplazo] : []) : [r])))];
    };
    for (const d of dimensiones(this.s.datos)) for (const n of d.niveles) for (const c of n.criterios) cambiar(c);
    for (const e of ediciones(this.s.datos)) for (const a of e.areas) for (const d of a.dimensiones) for (const n of d.niveles) for (const c of n.criterios) if (c.tipo === "propio") cambiar(c);
  }

  /** En la tabla «Riesgos», `id` pasa a ser `reemplazo` (o sale; una fila que queda sin identificadores sale). */
  private reapuntarRiesgo(id: string, reemplazo: string | null): void {
    const t = tablaDeRiesgos(this.s.datos);
    if (!t) return;
    t.filas = t.filas.flatMap((fila) => {
      const ids = idsDeLaCelda(fila[0]);
      if (!ids.includes(id)) return [fila];
      const nuevos = [...new Set(ids.flatMap((x) => (x === id ? (reemplazo ? [reemplazo] : []) : [x])))];
      return nuevos.length ? [[celdaDeIds(nuevos), ...fila.slice(1)]] : [];
    });
  }

  /**
   * El texto general de un criterio cambió: lo que una edición decía de él con sus palabras ya no dice lo mismo.
   * Se suelta (pasa a «Se leen igual») y queda como consecuencia, para reescribirlo con la edición.
   */
  private soltarReescritos(id: string): void {
    for (const e of ediciones(this.s.datos)) {
      const d = dimensionDeLaEdicion(e, dimDe(id));
      if (!d) continue;
      for (const n of d.niveles) {
        const r = n.criterios.find((c) => c.tipo === "reescrito" && c.id === id);
        if (!r) continue;
        n.criterios = n.criterios.filter((c) => c !== r);
        d.seLeenIgual = ordenar(this.s.datos, d.id, [...d.seLeenIgual, id]);
        this.s.consecuencias.push({
          punto: this.punto,
          edicion: e.clave,
          texto: `${id} cambió en la escala general; la edición lo decía así: «${r.texto}». Se lee como el general hasta reescribirlo.`,
        });
      }
    }
  }

  /** Saca un criterio de la matriz y todo lo que lo nombra. Devuelve lo que cada edición decía de él. */
  private sacarDeLaMatriz(id: string, reemplazo: string | null): Map<string, { lista: "noAplican" | "seLeenIgual" | "reescrito"; texto?: string; letra?: Letra }> {
    const donde = criterioDeLaMatriz(this.s.datos, id);
    if (!donde) this.falla(`la escala no tiene el criterio ${id}.`);
    donde.nivel.criterios = donde.nivel.criterios.filter((c) => c.id !== id);
    this.s.retirados.push(id);
    this.reapuntarRequeridos(id, reemplazo);
    this.reapuntarRiesgo(id, reemplazo);
    const decia = new Map<string, { lista: "noAplican" | "seLeenIgual" | "reescrito"; texto?: string; letra?: Letra }>();
    for (const e of ediciones(this.s.datos)) {
      const d = dimensionDeLaEdicion(e, dimDe(id));
      if (!d) continue;
      if (d.noAplican.includes(id)) decia.set(e.clave, { lista: "noAplican" });
      if (d.seLeenIgual.includes(id)) decia.set(e.clave, { lista: "seLeenIgual" });
      d.noAplican = d.noAplican.filter((x) => x !== id);
      d.seLeenIgual = d.seLeenIgual.filter((x) => x !== id);
      for (const n of d.niveles) {
        const r = n.criterios.find((c) => c.tipo === "reescrito" && c.id === id);
        if (r) decia.set(e.clave, { lista: "reescrito", texto: r.texto, letra: n.letra });
        n.criterios = n.criterios.filter((c) => !(c.tipo === "reescrito" && c.id === id));
      }
    }
    return decia;
  }

  aplicar(op: Operacion): void {
    const datos = this.s.datos;
    switch (op.op) {
      case "editar": {
        const id = this.ref(op.id);
        const donde = criterioDeLaMatriz(datos, id);
        if (!donde) this.falla(`la escala no tiene el criterio ${id}.`);
        const textoAntes = donde.criterio.texto;
        this.cambiar(donde.criterio, op.cambios);
        if (donde.criterio.texto !== textoAntes) this.soltarReescritos(id);
        return;
      }
      case "nuevo": {
        const donde = nivelDeLaMatriz(datos, op.nivel);
        if (!donde) this.falla(`la escala no tiene el nivel ${op.nivel}.`);
        const id = nuevoIdDeCriterio(datos, op.nivel, this.retirados());
        donde.nivel.criterios.push({ id, ...this.campos(op.campos) });
        this.registrarAlias(op.alias, id);
        this.cubrirEnLasEdiciones(id);
        return;
      }
      case "retirar": {
        const id = this.ref(op.id);
        const decia = this.sacarDeLaMatriz(id, op.reemplazo ? this.ref(op.reemplazo) : null);
        for (const [clave, d] of decia) {
          if (d.lista === "reescrito") this.s.consecuencias.push({ punto: this.punto, edicion: clave, texto: `${id} sale de la escala; la edición lo decía así: «${d.texto}».` });
        }
        return;
      }
      case "mover": {
        const id = this.ref(op.id);
        const viejo = criterioDeLaMatriz(datos, id);
        if (!viejo) this.falla(`la escala no tiene el criterio ${id}.`);
        const destino = nivelDeLaMatriz(datos, op.nivel);
        if (!destino) this.falla(`la escala no tiene el nivel ${op.nivel}.`);
        const campos: CriterioDeLaEscala = structuredClone(viejo.criterio);
        const mismaDimension = viejo.dim.id === destino.dim.id;
        const nuevoId = nuevoIdDeCriterio(datos, op.nivel, [...this.retirados(), id]);
        const decia = this.sacarDeLaMatriz(id, nuevoId);
        // El número nuevo se pide de nuevo, ya sin el viejo en la matriz (y con el viejo retirado).
        const idFinal = nuevoIdDeCriterio(datos, op.nivel, this.retirados());
        if (idFinal !== nuevoId) {
          this.reapuntarRequeridos(nuevoId, idFinal);
          this.reapuntarRiesgo(nuevoId, idFinal);
        }
        campos.id = idFinal;
        this.cambiar(campos, op.cambios ?? {});
        destino.nivel.criterios.push(campos);
        this.registrarAlias(op.alias, idFinal);
        const textoIgual = op.cambios?.texto === undefined;
        const llevar = op.reescritos === "llevar" && mismaDimension && textoIgual;
        for (const e of ediciones(datos)) {
          const d = dimensionDeLaEdicion(e, destino.dim.id);
          const antes = decia.get(e.clave);
          if (llevar && d && antes) {
            if (antes.lista === "noAplican") d.noAplican = ordenar(datos, d.id, [...d.noAplican, idFinal]);
            else if (antes.lista === "seLeenIgual") d.seLeenIgual = ordenar(datos, d.id, [...d.seLeenIgual, idFinal]);
            else nivelDeLaEdicion(d, destino.nivel.letra).criterios.push({ tipo: "reescrito", id: idFinal, texto: antes.texto! });
            continue;
          }
          if (antes?.lista === "reescrito") {
            this.s.consecuencias.push({
              punto: this.punto,
              edicion: e.clave,
              texto: `${id} pasa a ser ${idFinal}; la edición decía «${antes.texto}». El nuevo se lee como el general hasta que se decida.`,
            });
          } else if (antes?.lista === "noAplican") {
            this.s.consecuencias.push({ punto: this.punto, edicion: e.clave, texto: `${id} no aplicaba en la edición; pasa a ser ${idFinal}, que se lee como el general hasta que se decida.` });
          }
        }
        this.cubrirEnLasEdiciones(idFinal);
        return;
      }
      case "edicion-reescrito": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const id = this.ref(op.id);
        const general = criterioDeLaMatriz(datos, id) ?? this.falla(`la escala no tiene el criterio ${id}.`);
        const d = dimensionDeLaEdicion(e, general.dim.id) ?? this.falla(`la edición ${op.edicion} no tiene la dimensión ${general.dim.id}.`);
        d.noAplican = d.noAplican.filter((x) => x !== id);
        d.seLeenIgual = d.seLeenIgual.filter((x) => x !== id);
        for (const n of d.niveles) n.criterios = n.criterios.filter((c) => !(c.tipo === "reescrito" && c.id === id));
        nivelDeLaEdicion(d, general.nivel.letra).criterios.push({ tipo: "reescrito", id, texto: op.texto });
        return;
      }
      case "edicion-propio": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const m = ID_DE_NIVEL.exec(op.nivel) ?? this.falla(`«${op.nivel}» no es un nivel.`);
        const d = dimensionDeLaEdicion(e, m[1]) ?? this.falla(`la edición ${op.edicion} no tiene la dimensión ${m[1]}.`);
        const id = this.idPropio(e, op.nivel);
        nivelDeLaEdicion(d, m[2] as Letra).criterios.push({ tipo: "propio", id, ...this.campos(op.campos) });
        this.registrarAlias(op.alias, id);
        return;
      }
      case "edicion-retirar-propio": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const id = this.ref(op.id);
        const n = this.nivelDelPropio(e, id);
        n.criterios = n.criterios.filter((c) => !(c.tipo === "propio" && c.id === id));
        this.s.retirados.push(id);
        this.reapuntarRequeridos(id, null);
        return;
      }
      case "edicion-editar-propio": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const id = this.ref(op.id);
        const c = this.nivelDelPropio(e, id).criterios.find((x): x is Extract<CriterioDeLaEdicion, { tipo: "propio" }> => x.tipo === "propio" && x.id === id)!;
        this.cambiar(c, op.cambios);
        return;
      }
      case "edicion-mover-propio": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const id = this.ref(op.id);
        const n = this.nivelDelPropio(e, id);
        const viejo = n.criterios.find((c): c is Extract<CriterioDeLaEdicion, { tipo: "propio" }> => c.tipo === "propio" && c.id === id)!;
        n.criterios = n.criterios.filter((c) => c !== viejo);
        this.s.retirados.push(id);
        const m = ID_DE_NIVEL.exec(op.nivel) ?? this.falla(`«${op.nivel}» no es un nivel.`);
        const d = dimensionDeLaEdicion(e, m[1]) ?? this.falla(`la edición ${op.edicion} no tiene la dimensión ${m[1]}.`);
        const nuevoId = this.idPropio(e, op.nivel);
        const campos = { ...structuredClone(viejo), id: nuevoId } as CriterioDeLaEscala;
        this.cambiar(campos, op.cambios ?? {});
        nivelDeLaEdicion(d, m[2] as Letra).criterios.push({ tipo: "propio", ...campos });
        this.reapuntarRequeridos(id, nuevoId);
        this.registrarAlias(op.alias, nuevoId);
        return;
      }
      case "edicion-frase": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const m = ID_DE_NIVEL.exec(op.nivel) ?? this.falla(`«${op.nivel}» no es un nivel.`);
        const d = dimensionDeLaEdicion(e, m[1]) ?? this.falla(`la edición ${op.edicion} no tiene la dimensión ${m[1]}.`);
        nivelDeLaEdicion(d, m[2] as Letra).frase = op.frase;
        return;
      }
      case "edicion-panoramica": {
        const e = edicion(datos, op.edicion) ?? this.falla(`no existe la edición ${op.edicion}.`);
        const a = e.areas.find((x) => x.id === op.area) ?? this.falla(`la edición ${op.edicion} no tiene el área ${op.area}.`);
        const p = a.panoramica.find((x) => x.letra === op.letra) ?? this.falla(`el área ${op.area} de ${op.edicion} no tiene vistazo de ${op.letra}.`);
        p.texto = op.texto;
        return;
      }
      case "riesgo": {
        const t = tablaDeRiesgos(datos) ?? this.falla("la escala no tiene la tabla «Riesgos».");
        const ids = op.ids.map((r) => this.ref(r));
        const fila = t.filas.find((f) => f[1] === op.criterio);
        if (fila) fila[0] = celdaDeIds([...new Set([...idsDeLaCelda(fila[0]), ...ids])]);
        else if (op.mensaje) t.filas.push([celdaDeIds(ids), op.criterio, op.mensaje]);
        else this.falla(`la tabla «Riesgos» no tiene la fila «${op.criterio}», y la entrada no trae su mensaje.`);
        return;
      }
      case "prosa-agregar": {
        this.parteDeProsa(op.parte).bloques.push(...this.conIds(op.bloques));
        return;
      }
      case "prosa-insertar": {
        const parte = this.parteDeProsa(op.parte);
        const i = this.bloqueQueEmpieza(parte.bloques, op.despuesDe, op.parte);
        parte.bloques.splice(i + 1, 0, ...this.conIds(op.bloques));
        return;
      }
      case "prosa-cambiar": {
        const parte = this.parteDeProsa(op.parte);
        const i = this.bloqueQueEmpieza(parte.bloques, op.empieza, op.parte);
        parte.bloques.splice(i, 1, ...this.conIds(op.bloques));
        return;
      }
      case "prosa-punto":
      case "prosa-punto-despues": {
        const parte = this.parteDeProsa(op.parte);
        const inicio = op.op === "prosa-punto" ? op.empieza : op.despuesDe;
        const lista = parte.bloques.find((x) => (x.tipo === "lista" || x.tipo === "numerada") && x.items.some((it) => it.startsWith(inicio)));
        if (!lista || (lista.tipo !== "lista" && lista.tipo !== "numerada")) this.falla(`«${op.parte}» no tiene un punto que empiece con «${inicio}».`);
        const i = lista.items.findIndex((it) => it.startsWith(inicio));
        const texto = (this.conIds([{ tipo: "parrafo", texto: op.texto }])[0] as { texto: string }).texto;
        if (op.op === "prosa-punto") lista.items.splice(i, 1, texto);
        else lista.items.splice(i + 1, 0, texto);
        return;
      }
      case "prosa-celda": {
        const parte = this.parteDeProsa(op.parte);
        const tabla = parte.bloques.find((x) => x.tipo === "tabla" && x.filas.some((f) => f[0] === op.fila));
        if (!tabla || tabla.tipo !== "tabla") this.falla(`«${op.parte}» no tiene una tabla con la fila «${op.fila}».`);
        const fila = tabla.filas.find((f) => f[0] === op.fila)!;
        if (op.columna < 0 || op.columna >= fila.length) this.falla(`la fila «${op.fila}» no tiene la columna ${op.columna}.`);
        fila[op.columna] = op.texto;
        return;
      }
      case "encabezado": {
        const campo = this.s.datos.encabezado.find((c) => c.clave === op.clave);
        if (!campo) this.falla(`el encabezado no tiene «${op.clave}».`);
        campo.valor = op.valor;
        return;
      }
    }
  }

  private parteDeProsa(titulo: string): Extract<EscalaDatos["partes"][number], { tipo: "prosa" }> {
    const parte = this.s.datos.partes.find((p) => p.tipo === "prosa" && p.bloques[0]?.tipo === "titulo" && p.bloques[0].texto.startsWith(titulo));
    if (!parte || parte.tipo !== "prosa") this.falla(`no hay una parte de prosa que empiece con «${titulo}».`);
    return parte;
  }

  /** El índice del primer bloque cuyo texto (o el primer punto, en una lista) empieza con `inicio`. */
  private bloqueQueEmpieza(bloques: Bloque[], inicio: string, parte: string): number {
    const i = bloques.findIndex((b) =>
      b.tipo === "titulo" || b.tipo === "parrafo" ? b.texto.startsWith(inicio) : b.tipo === "lista" || b.tipo === "numerada" ? (b.items[0] ?? "").startsWith(inicio) : false,
    );
    if (i === -1) this.falla(`«${parte}» no tiene un bloque que empiece con «${inicio}».`);
    return i;
  }

  /** Los bloques con cada `` `@alias` `` escrito con su identificador. */
  private conIds(bloques: Bloque[]): Bloque[] {
    const t = (s: string) => s.replace(/`(@[^`]+)`/g, (_, alias: string) => "`" + this.ref(alias) + "`");
    return structuredClone(bloques).map((b) => {
      if (b.tipo === "titulo" || b.tipo === "parrafo") return { ...b, texto: t(b.texto) };
      if (b.tipo === "lista" || b.tipo === "numerada") return { ...b, items: b.items.map(t) };
      if (b.tipo === "tabla") return { ...b, filas: b.filas.map((f) => f.map(t)) };
      return b;
    });
  }

  private idPropio(e: EdicionDeLaEscala, nivelId: string): string {
    const bloque = Number(/desde el (\d+)/.exec(e.criteriosPropios ?? "")?.[1]);
    if (!bloque) this.falla(`la edición ${e.clave} no dice desde qué número numera sus criterios propios.`);
    const enUso = idsEnUso(this.s.datos);
    const fuera = new Set(this.retirados());
    for (let n = bloque; n < bloque + 99; n++) {
      const id = `${nivelId}${n}`;
      if (!enUso.has(id) && !fuera.has(id)) return id;
    }
    this.falla(`el nivel ${nivelId} de ${e.clave} no tiene más números libres.`);
  }

  private nivelDelPropio(e: EdicionDeLaEscala, id: string): NivelDeLaEdicion {
    for (const a of e.areas) for (const d of a.dimensiones) for (const n of d.niveles) if (n.criterios.some((c) => c.tipo === "propio" && c.id === id)) return n;
    this.falla(`la edición ${e.clave} no tiene el criterio propio ${id}.`);
  }
}

/** Aplica una entrada y devuelve el estado nuevo (el de entrada no se toca). */
export function aplicarEntrada(estado: EstadoDelBorrador, entrada: Entrada): EstadoDelBorrador {
  const s = structuredClone(estado);
  const a = new Aplicador(s, entrada.punto);
  for (const op of entrada.ops) a.aplicar(op);
  return s;
}

/**
 * La garantía de siempre (lib/escala/datos/editar.ts): los datos generan un `.md` que se vuelve a leer igual
 * y que el lector entiende. Lanza con el porqué si no.
 */
export function comprobarQueSeLee(datos: EscalaDatos): void {
  const md = generarMarkdown(datos);
  let vuelta: EscalaDatos;
  try {
    vuelta = importarEscala(md);
    escalaDeLosDatos(vuelta);
  } catch (e) {
    const porque = e instanceof ErrorDeFormato ? e.message : String(e);
    throw new Error(`El borrador no se puede leer: ${porque}`);
  }
  if (generarMarkdown(vuelta) !== md) throw new Error("El borrador cambia al volver a leerlo: algún texto se lee como otra cosa.");
}

/** Aplica todo el catálogo, en orden. */
export function aplicarCatalogo(datos: EscalaDatos, retiradosPrevios: readonly string[], catalogo: readonly Entrada[]): EstadoDelBorrador {
  let s = estadoInicial(datos, retiradosPrevios);
  for (const entrada of catalogo) s = aplicarEntrada(s, entrada);
  return s;
}
