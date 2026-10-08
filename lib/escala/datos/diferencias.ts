/**
 * lib/escala/datos/diferencias.ts — qué cambió entre dos versiones de la escala, como datos. PURO.
 *
 * Es la bitácora del borrador (`EscalaCambio`): cada cambio anclado a lo que tocó, con el antes y el
 * después de ese campo. Las anclas son las mismas que usa el resto de Nexus para la escala (el
 * feedback y los comentarios se anclan a `1.7`, `1.7.F` o `1.7.F1`), así un cambio se cruza con lo
 * que se dijo de ese criterio:
 *
 *   `encabezado:version` · `texto:Parte 2 — Cómo se aplica / Cómo se leen los criterios` · `1` (área)
 *   · `1.7` (dimensión) · `1.7.F` (nivel) · `1.7.F1` (criterio) · `edicion:ecommerce-retail` y,
 *   adentro de una edición, `edicion:ecommerce-retail/1.7.F1`.
 *
 * Nada cambia en silencio: si dos versiones generan un `.md` distinto y ningún campo cambió (solo se
 * movió algo de lugar), sale un cambio de «orden».
 */
import { bloqueComoTexto, criterioComoTexto, generarMarkdown } from "./generar";
import type { AccionDelCambio, TipoDeAncla } from "./reglas";
import type { CriterioDeLaEdicion, CriterioDeLaEscala, EscalaDatos } from "./tipos";

export interface CambioDeLaEscala {
  ancla: string;
  tipoDeAncla: TipoDeAncla;
  accion: AccionDelCambio;
  /** Qué campo cambió (`texto`, `frase`, `verificacion`…). null si se agregó o se quitó entero. */
  campo: string | null;
  antes: string | null;
  despues: string | null;
}

type Campos<T> = [campo: string, valor: (x: T) => string | null][];

const siNo = (b: boolean) => (b ? "sí" : "no");
const lista = (xs: string[]) => (xs.length ? xs.join(", ") : null);

/** Compara dos mapas por clave, en el orden de `antes` y después lo nuevo. */
function comparar<T>(
  antes: Map<string, T>,
  despues: Map<string, T>,
  tipoDeAncla: TipoDeAncla,
  completo: (x: T) => string,
  campos: Campos<T>,
): CambioDeLaEscala[] {
  const out: CambioDeLaEscala[] = [];
  for (const [ancla, a] of antes) {
    const d = despues.get(ancla);
    if (d === undefined) {
      out.push({ ancla, tipoDeAncla, accion: "quitado", campo: null, antes: completo(a), despues: null });
      continue;
    }
    for (const [campo, valor] of campos) {
      const va = valor(a);
      const vd = valor(d);
      if (va !== vd) out.push({ ancla, tipoDeAncla, accion: "cambiado", campo, antes: va, despues: vd });
    }
  }
  for (const [ancla, d] of despues) {
    if (!antes.has(ancla)) out.push({ ancla, tipoDeAncla, accion: "agregado", campo: null, antes: null, despues: completo(d) });
  }
  return out;
}

// ── El texto (la prosa), por sección ──────────────────────────────────────────

/** Cada sección de texto (lo que va bajo un título) con su ruta de títulos como clave. */
function seccionesDeTexto(datos: EscalaDatos): Map<string, string> {
  const out = new Map<string, string>();
  const vistas = new Map<string, number>();
  for (const parte of datos.partes) {
    let ruta: string[] = [];
    let clave: string | null = null;
    let textos: string[] = [];
    const cerrar = () => {
      if (clave !== null) out.set(`texto:${clave}`, textos.join("\n\n"));
    };
    for (const b of parte.bloques) {
      if (b.tipo !== "titulo") {
        textos.push(bloqueComoTexto(b));
        continue;
      }
      cerrar();
      ruta = [...ruta.slice(0, b.nivel - 1), b.texto];
      const base = ruta.join(" / ");
      const n = (vistas.get(base) ?? 0) + 1;
      vistas.set(base, n);
      clave = n > 1 ? `${base} (${n})` : base;
      textos = [];
    }
    cerrar();
  }
  return out;
}

// ── La matriz ─────────────────────────────────────────────────────────────────

function piezasDeLaMatriz(datos: EscalaDatos) {
  const areas = new Map<string, { nombre: string; descripcion: string }>();
  const dimensiones = new Map<string, { nombre: string; pregunta: string; descripcion: string | null; costo: string; capa: string }>();
  const niveles = new Map<string, { frase: string; resultado: string | null; orden: string }>();
  const criterios = new Map<string, CriterioDeLaEscala>();
  for (const parte of datos.partes) {
    if (parte.tipo !== "matriz") continue;
    for (const a of parte.areas) {
      areas.set(a.id, { nombre: a.nombre, descripcion: a.descripcion });
      for (const capa of a.capas) {
        for (const d of capa.dimensiones) {
          dimensiones.set(d.id, { nombre: d.nombre, pregunta: d.pregunta, descripcion: d.descripcion, costo: d.costoDeQuedarse, capa: capa.nombre });
          for (const n of d.niveles) {
            niveles.set(`${d.id}.${n.letra}`, { frase: n.frase, resultado: n.resultado, orden: n.criterios.map((c) => c.id).join(" ") });
            for (const c of n.criterios) criterios.set(c.id, c);
          }
        }
      }
    }
  }
  return { areas, dimensiones, niveles, criterios };
}

const CAMPOS_DEL_CRITERIO: Campos<CriterioDeLaEscala> = [
  ["texto", (c) => c.texto],
  ["verificacion", (c) => c.verificacion],
  ["riesgo", (c) => siNo(c.riesgo)],
  ["habito", (c) => siNo(c.habito)],
  ["perfil", (c) => c.perfil],
  ["requiere", (c) => lista(c.requiere)],
];

// ── Las ediciones ─────────────────────────────────────────────────────────────

function piezasDeLasEdiciones(datos: EscalaDatos) {
  type E = { nombre: string; descripcion: string | null; perfilHabitual: string | null; criteriosPropios: string | null; palabras: string | null };
  const ediciones = new Map<string, E>();
  const areas = new Map<string, { nombre: string; descripcion: string | null; panoramica: string | null }>();
  const dimensiones = new Map<
    string,
    { nombre: string; pregunta: string | null; descripcion: string | null; costo: string | null; noAplican: string | null; seLeenIgual: string | null }
  >();
  const niveles = new Map<string, { frase: string | null; resultado: string | null; orden: string }>();
  const criterios = new Map<string, CriterioDeLaEdicion>();
  for (const parte of datos.partes) {
    if (parte.tipo !== "ediciones") continue;
    for (const e of parte.ediciones) {
      const pre = `edicion:${e.clave}`;
      ediciones.set(pre, {
        nombre: e.nombre,
        descripcion: e.descripcion,
        perfilHabitual: e.perfilHabitual,
        criteriosPropios: e.criteriosPropios,
        palabras: e.palabras ? e.palabras.filas.map((f) => `${f.general} → ${f.edicion}`).join("\n") : null,
      });
      for (const a of e.areas) {
        areas.set(`${pre}/${a.id}`, {
          nombre: a.nombre,
          descripcion: a.descripcion,
          panoramica: a.panoramica.length ? a.panoramica.map((p) => `${p.letra}: ${p.texto}`).join("\n") : null,
        });
        for (const d of a.dimensiones) {
          dimensiones.set(`${pre}/${d.id}`, {
            nombre: d.nombre,
            pregunta: d.pregunta,
            descripcion: d.descripcion,
            costo: d.costoDeQuedarse,
            noAplican: lista(d.noAplican),
            seLeenIgual: lista(d.seLeenIgual),
          });
          for (const n of d.niveles) {
            niveles.set(`${pre}/${d.id}.${n.letra}`, { frase: n.frase, resultado: n.resultado, orden: n.criterios.map((c) => c.id).join(" ") });
            for (const c of n.criterios) criterios.set(`${pre}/${c.id}`, c);
          }
        }
      }
    }
  }
  return { ediciones, areas, dimensiones, niveles, criterios };
}

const propio = (c: CriterioDeLaEdicion) => (c.tipo === "propio" ? c : null);

/** Los niveles que tienen los mismos criterios en otro orden (si cambió cuáles, ya lo dicen los criterios). */
function criteriosReordenados(antes: Map<string, { orden: string }>, despues: Map<string, { orden: string }>): CambioDeLaEscala[] {
  const out: CambioDeLaEscala[] = [];
  const mismos = (a: string, b: string) => a.split(" ").sort().join(" ") === b.split(" ").sort().join(" ");
  for (const [ancla, a] of antes) {
    const d = despues.get(ancla);
    if (d && d.orden !== a.orden && mismos(a.orden, d.orden)) {
      out.push({ ancla, tipoDeAncla: "nivel", accion: "cambiado", campo: "orden", antes: a.orden, despues: d.orden });
    }
  }
  return out;
}

// ── La entrada ────────────────────────────────────────────────────────────────

/** Los cambios de `antes` a `despues`, anclados. Vacío si generan el mismo `.md`. */
export function cambiosEntre(antes: EscalaDatos, despues: EscalaDatos): CambioDeLaEscala[] {
  const out: CambioDeLaEscala[] = [];

  const encabezado = (d: EscalaDatos) => new Map(d.encabezado.map((c) => [`encabezado:${c.clave}`, c.valor]));
  out.push(...comparar(encabezado(antes), encabezado(despues), "encabezado", (v) => v, [["valor", (v) => v]]));

  out.push(...comparar(seccionesDeTexto(antes), seccionesDeTexto(despues), "texto", (t) => t, [["texto", (t) => t]]));

  const ma = piezasDeLaMatriz(antes);
  const md = piezasDeLaMatriz(despues);
  out.push(
    ...comparar(ma.areas, md.areas, "area", (a) => a.nombre, [
      ["nombre", (a) => a.nombre],
      ["descripcion", (a) => a.descripcion],
    ]),
    ...comparar(ma.dimensiones, md.dimensiones, "dimension", (d) => d.nombre, [
      ["nombre", (d) => d.nombre],
      ["capa", (d) => d.capa],
      ["pregunta", (d) => d.pregunta],
      ["descripcion", (d) => d.descripcion],
      ["costoDeQuedarse", (d) => d.costo],
    ]),
    ...comparar(ma.niveles, md.niveles, "nivel", (n) => n.frase, [
      ["frase", (n) => n.frase],
      ["resultado", (n) => n.resultado],
    ]),
    ...comparar(ma.criterios, md.criterios, "criterio", criterioComoTexto, CAMPOS_DEL_CRITERIO),
  );

  const ea = piezasDeLasEdiciones(antes);
  const ed = piezasDeLasEdiciones(despues);
  out.push(
    ...comparar(ea.ediciones, ed.ediciones, "edicion", (e) => e.nombre, [
      ["nombre", (e) => e.nombre],
      ["descripcion", (e) => e.descripcion],
      ["perfilHabitual", (e) => e.perfilHabitual],
      ["criteriosPropios", (e) => e.criteriosPropios],
      ["palabras", (e) => e.palabras],
    ]),
    ...comparar(ea.areas, ed.areas, "area", (a) => a.nombre, [
      ["nombre", (a) => a.nombre],
      ["descripcion", (a) => a.descripcion],
      ["panoramica", (a) => a.panoramica],
    ]),
    ...comparar(ea.dimensiones, ed.dimensiones, "dimension", (d) => d.nombre, [
      ["nombre", (d) => d.nombre],
      ["pregunta", (d) => d.pregunta],
      ["descripcion", (d) => d.descripcion],
      ["costoDeQuedarse", (d) => d.costo],
      ["noAplican", (d) => d.noAplican],
      ["seLeenIgual", (d) => d.seLeenIgual],
    ]),
    ...comparar(ea.niveles, ed.niveles, "nivel", (n) => n.frase ?? "", [
      ["frase", (n) => n.frase],
      ["resultado", (n) => n.resultado],
    ]),
    ...comparar(ea.criterios, ed.criterios, "criterio", (c) => (c.tipo === "propio" ? criterioComoTexto(c) : `${c.texto} [${c.id}]`), [
      ["tipo", (c) => c.tipo],
      ["texto", (c) => c.texto],
      ...CAMPOS_DEL_CRITERIO.slice(1).map(([campo, valor]): Campos<CriterioDeLaEdicion>[number] => [campo, (c) => (propio(c) ? valor(propio(c)!) : null)]),
    ]),
  );

  // Lo que se movió de lugar sin cambiar ningún campo también es un cambio: los mismos criterios de un
  // nivel en otro orden, o (si no hay ningún otro cambio) dimensiones, áreas o secciones movidas.
  out.push(...criteriosReordenados(ma.niveles, md.niveles), ...criteriosReordenados(ea.niveles, ed.niveles));
  if (!out.length && generarMarkdown(antes) !== generarMarkdown(despues)) {
    out.push({ ancla: "documento", tipoDeAncla: "texto", accion: "cambiado", campo: "orden", antes: null, despues: null });
  }
  return out;
}

/**
 * El pedazo que cambió entre dos textos largos, con un poco de contexto a cada lado: para mostrar
 * un cambio de una palabra en un criterio de tres líneas sin repetir el criterio entero.
 */
export function pedazoQueCambia(antes: string, despues: string, contexto = 30): { antes: string; despues: string } {
  let inicio = 0;
  while (inicio < antes.length && inicio < despues.length && antes[inicio] === despues[inicio]) inicio++;
  let fin = 0;
  while (fin < antes.length - inicio && fin < despues.length - inicio && antes[antes.length - 1 - fin] === despues[despues.length - 1 - fin]) fin++;
  const desde = Math.max(0, inicio - contexto);
  const recorte = (s: string) => {
    const hasta = Math.min(s.length, s.length - fin + contexto);
    return `${desde > 0 ? "…" : ""}${s.slice(desde, hasta)}${hasta < s.length ? "…" : ""}`;
  };
  return { antes: recorte(antes), despues: recorte(despues) };
}

/** «3 cambiados · 1 agregado · 2 quitados». */
export function resumenDeCambios(cambios: CambioDeLaEscala[]): string {
  const n = (a: AccionDelCambio) => cambios.filter((c) => c.accion === a).length;
  const partes = [
    [n("cambiado"), "cambiado", "cambiados"],
    [n("agregado"), "agregado", "agregados"],
    [n("quitado"), "quitado", "quitados"],
  ] as const;
  const texto = partes.filter(([k]) => k > 0).map(([k, uno, varios]) => `${k} ${k === 1 ? uno : varios}`);
  return texto.length ? texto.join(" · ") : "sin cambios";
}
