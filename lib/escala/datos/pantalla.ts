/**
 * lib/escala/datos/pantalla.ts — lo que la pantalla del borrador recibe del servidor. PURO.
 *
 * Aparte de `servidor.ts` (que es `server-only`) para que el componente del navegador importe los
 * tipos sin arrastrar la base. `paraMostrar` deja cada cambio de la bitácora listo para leerse: su
 * ancla dicha en palabras y, de un texto largo, solo el pedazo que cambió.
 */
import { pedazoQueCambia, type CambioDeLaEscala } from "./diferencias";
import { ETIQUETA_DEL_ANCLA, ETIQUETA_DEL_CAMPO, type TipoDeAncla } from "./reglas";
import type { EscalaDatos } from "./tipos";

export interface CambioParaMostrar {
  ancla: string;
  /** «Criterio 1.7.F1» · «Edición Ecommerce y retail · criterio 1.7.F1» · «Texto · Parte 2 — … / …» */
  donde: string;
  accion: CambioDeLaEscala["accion"];
  /** «texto», «frase del nivel»… null si se agregó o se quitó entero. */
  campo: string | null;
  antes: string | null;
  despues: string | null;
}

/** Los cambios de una misma subida (o uno suelto del editor), con quién, cuándo y por qué. */
export interface TandaDeLaBitacora {
  /** ISO. */
  cuando: string;
  autorEmail: string;
  origen: string;
  nota: string | null;
  cambios: CambioParaMostrar[];
}

export interface ResumenDelBorrador {
  version: string;
  basadaEn: string | null;
  revision: number;
  creadaEn: string;
  actualizadaEn: string;
  actualizadaPorEmail: string | null;
  totalDeCambios: number;
}

export type EstadoDelBorrador =
  | { estado: "sin-tablas" }
  | {
      estado: "ok";
      borrador: ResumenDelBorrador | null;
      /** La última versión publicada como datos (de donde sale un borrador nuevo). */
      publicada: string | null;
      /** La versión que se propone para un borrador nuevo. */
      sugerida: string;
      bitacora: TandaDeLaBitacora[];
    };

/** Las ediciones de unos datos: su clave → su nombre, para decir las anclas en palabras. */
export function nombresDeLasEdiciones(datos: EscalaDatos): Map<string, string> {
  return new Map(datos.partes.flatMap((p) => (p.tipo === "ediciones" ? p.ediciones.map((e) => [e.clave, e.nombre] as const) : [])));
}

/** `edicion:ecommerce-retail/1.7.F1` → «Edición Ecommerce y retail · criterio 1.7.F1». */
export function dondeEsta(ancla: string, tipo: TipoDeAncla, ediciones: Map<string, string>): string {
  const ed = /^edicion:([^/]+)(?:\/(.+))?$/.exec(ancla);
  if (ed) {
    const nombre = ediciones.get(ed[1]) ?? ed[1];
    return ed[2] ? `Edición ${nombre} · ${ETIQUETA_DEL_ANCLA[tipo].toLowerCase()} ${ed[2]}` : `Edición ${nombre}`;
  }
  if (ancla.startsWith("texto:")) return `Texto · ${ancla.slice("texto:".length)}`;
  if (ancla.startsWith("encabezado:")) return `Encabezado · ${ancla.slice("encabezado:".length)}`;
  if (ancla === "documento") return "El documento";
  return `${ETIQUETA_DEL_ANCLA[tipo]} ${ancla}`;
}

/** Un criterio entero, como va en el `.md` («- Texto `[1.7.F1 · evaluado]`»), dicho para leerse: «Texto [1.7.F1 · evaluado]». */
function comoSeLee(texto: string | null): string | null {
  return texto === null ? null : texto.replace(/^- /, "").replace(/`\[([^\]]*)\]`$/, "[$1]");
}

export function paraMostrar(c: CambioDeLaEscala, ediciones: Map<string, string>): CambioParaMostrar {
  const p =
    c.accion === "cambiado" && c.antes !== null && c.despues !== null
      ? pedazoQueCambia(c.antes, c.despues, 60)
      : { antes: comoSeLee(c.antes), despues: comoSeLee(c.despues) };
  return {
    ancla: c.ancla,
    donde: dondeEsta(c.ancla, c.tipoDeAncla, ediciones),
    accion: c.accion,
    campo: c.campo ? (ETIQUETA_DEL_CAMPO[c.campo] ?? c.campo) : null,
    antes: p.antes,
    despues: p.despues,
  };
}
