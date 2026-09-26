/**
 * lib/cuestionario/operaciones.ts — la ÚNICA forma de cambiar la estructura de un cuestionario.
 *
 * El editor del CSE y (en la tanda del chat) el asistente mandan OPERACIONES, no el cuestionario
 * entero. Mismo motivo que en `lib/canvas/operaciones-de-documento.ts`: una operación toca lo que
 * nombra, así que editar la pregunta 3 nunca puede borrar por accidente la respuesta de la 5.
 *
 * Reglas que viven ACÁ y no en la pantalla (así valen igual para el chat):
 *   · Las 7 preguntas de «Etapa N» no están en `preguntas`: son implícitas (plantilla.ts). No hay
 *     operación que las alcance, por construcción.
 *   · Una pestaña ENVIADA no se toca: el cliente la cerró. Primero se reabre.
 *   · Una pestaña con respuestas no se quita: se perdería lo que el cliente escribió.
 *
 * Módulo PURO: recibe el estado, devuelve el estado nuevo o el error en español.
 */
import type { Momento, PestanaData, Pregunta, TipoPestana } from "./tipos";
import { pestanasDePlantilla } from "./plantilla";

export type OperacionCuestionario =
  | {
      op: "agregar_pregunta";
      pestana: string;
      texto: string;
      categoria?: string;
      ejemplo?: string;
      momento?: Momento;
      /** Id de la pregunta después de la cual va. Sin esto, al final. */
      despuesDe?: string;
    }
  | {
      op: "editar_pregunta";
      pestana: string;
      pregunta: string;
      texto?: string;
      categoria?: string;
      ejemplo?: string | null;
      momento?: Momento;
    }
  | { op: "quitar_pregunta"; pestana: string; pregunta: string }
  | { op: "mover_pregunta"; pestana: string; pregunta: string; direccion: "arriba" | "abajo" }
  | {
      op: "agregar_pestana";
      titulo?: string;
      descripcion?: string;
      tipo?: TipoPestana;
      /** Key de una pestaña de la plantilla que no está (ej. «marketing» en un proyecto sin ese hub). */
      desdePlantilla?: string;
    }
  | { op: "editar_pestana"; pestana: string; titulo?: string; descripcion?: string | null }
  | { op: "quitar_pestana"; pestana: string }
  | { op: "mover_pestana"; pestana: string; direccion: "arriba" | "abajo" };

/** Lo que el aplicador necesita saber de cada pestaña además de su estructura. */
export interface EstadoDePestana extends PestanaData {
  enviada: boolean;
  tieneRespuestas: boolean;
}

export type ResultadoDeOperaciones =
  | { ok: true; pestanas: EstadoDePestana[] }
  | { ok: false; error: string; indice: number };

const MAX_PESTANAS = 20;
const MAX_PREGUNTAS = 60;

function idNuevo(prefijo: string, usados: Set<string>, azar: () => string): string {
  for (;;) {
    const id = `${prefijo}-${azar()}`;
    if (!usados.has(id)) return id;
  }
}

function azarPorDefecto(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Tolera cualquier cosa: las operaciones llegan de un body JSON (o del chat) sin validar campo a campo. */
function limpio(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Aplica las operaciones EN ORDEN, todas o ninguna: si una falla, devuelve el error con su índice y
 * el estado no cambia. `azar` se inyecta para que los tests sean deterministas.
 */
export function aplicarOperaciones(
  inicial: readonly EstadoDePestana[],
  ops: readonly OperacionCuestionario[],
  azar: () => string = azarPorDefecto,
): ResultadoDeOperaciones {
  const pestanas: EstadoDePestana[] = inicial.map((p) => ({ ...p, preguntas: p.preguntas.map((q) => ({ ...q })) }));

  const buscar = (key: string) => pestanas.find((p) => p.key === key);

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const falla = (error: string): ResultadoDeOperaciones => ({ ok: false, error, indice: i });

    if (op.op === "agregar_pestana") {
      if (pestanas.length >= MAX_PESTANAS) return falla(`El cuestionario ya tiene ${MAX_PESTANAS} pestañas.`);
      if (op.desdePlantilla) {
        const base = pestanasDePlantilla().find((p) => p.key === op.desdePlantilla);
        if (!base) return falla(`No existe la pestaña «${op.desdePlantilla}» en la plantilla.`);
        if (buscar(base.key)) return falla(`La pestaña «${base.titulo}» ya está en el cuestionario.`);
        pestanas.push({
          key: base.key,
          titulo: base.titulo,
          descripcion: base.descripcion,
          tipo: base.tipo,
          preguntas: base.preguntas,
          enviada: false,
          tieneRespuestas: false,
        });
        continue;
      }
      const titulo = limpio(op.titulo, 80);
      if (!titulo) return falla("La pestaña nueva necesita un título.");
      if (pestanas.some((p) => p.titulo.toLowerCase() === titulo.toLowerCase())) {
        return falla(`Ya hay una pestaña «${titulo}».`);
      }
      pestanas.push({
        key: idNuevo("p", new Set(pestanas.map((p) => p.key)), azar),
        titulo,
        descripcion: limpio(op.descripcion, 400) || null,
        tipo: op.tipo === "etapas" ? "etapas" : "normal",
        preguntas: [],
        enviada: false,
        tieneRespuestas: false,
      });
      continue;
    }

    const { pestana: clave } = op;
    const p = buscar(clave);
    if (!p) return falla(`No existe la pestaña «${clave}».`);

    if (op.op === "mover_pestana") {
      const desde = pestanas.indexOf(p);
      const hasta = op.direccion === "arriba" ? desde - 1 : desde + 1;
      if (hasta < 0 || hasta >= pestanas.length) continue; // ya está en el borde: no es un error
      pestanas.splice(desde, 1);
      pestanas.splice(hasta, 0, p);
      continue;
    }

    if (p.enviada) {
      return falla(`«${p.titulo}» ya la envió el cliente. Reábrela primero para cambiarla.`);
    }

    switch (op.op) {
      case "quitar_pestana": {
        if (p.tieneRespuestas) {
          return falla(`«${p.titulo}» ya tiene respuestas del cliente: quitarla las borraría.`);
        }
        pestanas.splice(pestanas.indexOf(p), 1);
        break;
      }
      case "editar_pestana": {
        if (op.titulo !== undefined) {
          const titulo = limpio(op.titulo, 80);
          if (!titulo) return falla("El título de la pestaña no puede quedar vacío.");
          p.titulo = titulo;
        }
        if (op.descripcion !== undefined) p.descripcion = limpio(op.descripcion, 400) || null;
        break;
      }
      case "agregar_pregunta": {
        if (p.preguntas.length >= MAX_PREGUNTAS) return falla(`«${p.titulo}» ya tiene ${MAX_PREGUNTAS} preguntas.`);
        const texto = limpio(op.texto, 400);
        if (!texto) return falla("La pregunta nueva no tiene texto.");
        const nueva: Pregunta = {
          id: idNuevo("q", new Set(pestanas.flatMap((x) => x.preguntas.map((q) => q.id))), azar),
          categoria: limpio(op.categoria, 60),
          texto,
          ...(limpio(op.ejemplo, 400) ? { ejemplo: limpio(op.ejemplo, 400) } : {}),
          momento: op.momento === "sesion" ? "sesion" : "previo",
        };
        const pos = op.despuesDe ? p.preguntas.findIndex((q) => q.id === op.despuesDe) : -1;
        if (op.despuesDe && pos < 0) return falla(`No existe la pregunta «${op.despuesDe}» en «${p.titulo}».`);
        if (pos < 0) p.preguntas.push(nueva);
        else p.preguntas.splice(pos + 1, 0, nueva);
        break;
      }
      case "editar_pregunta":
      case "quitar_pregunta":
      case "mover_pregunta": {
        const idx = p.preguntas.findIndex((q) => q.id === op.pregunta);
        if (idx < 0) return falla(`No existe la pregunta «${op.pregunta}» en «${p.titulo}».`);
        if (op.op === "quitar_pregunta") {
          p.preguntas.splice(idx, 1);
        } else if (op.op === "mover_pregunta") {
          const hasta = op.direccion === "arriba" ? idx - 1 : idx + 1;
          if (hasta >= 0 && hasta < p.preguntas.length) {
            const [q] = p.preguntas.splice(idx, 1);
            p.preguntas.splice(hasta, 0, q);
          }
        } else {
          const q = p.preguntas[idx];
          if (op.texto !== undefined) {
            const texto = limpio(op.texto, 400);
            if (!texto) return falla("La pregunta no puede quedar sin texto.");
            q.texto = texto;
          }
          if (op.categoria !== undefined) q.categoria = limpio(op.categoria, 60);
          if (op.ejemplo !== undefined) {
            const ej = limpio(op.ejemplo, 400);
            if (ej) q.ejemplo = ej;
            else delete q.ejemplo;
          }
          if (op.momento !== undefined) q.momento = op.momento === "sesion" ? "sesion" : "previo";
        }
        break;
      }
    }
  }

  return { ok: true, pestanas };
}

const OPS: ReadonlySet<string> = new Set([
  "agregar_pregunta",
  "editar_pregunta",
  "quitar_pregunta",
  "mover_pregunta",
  "agregar_pestana",
  "editar_pestana",
  "quitar_pestana",
  "mover_pestana",
]);

/** Lectura tolerante del body: descarta lo que no tiene forma de operación. */
export function leerOperaciones(raw: unknown): OperacionCuestionario[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const out: OperacionCuestionario[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object" || !OPS.has((o as { op?: string }).op ?? "")) return null;
    out.push(o as OperacionCuestionario);
  }
  return out;
}
