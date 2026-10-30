/**
 * lib/planificacion/brief-en-lote.ts — lo puro del lote de Briefs (scripts/traer-briefs-de-implementacion.ts, 2026-10-29):
 * proponer el proyecto de una hoja por su nombre y leer el archivo que revisa una persona.
 *
 * ⛔ Proponer no es decidir. Nada escribe desde acá: la hoja que calza va a un CSV que una persona revisa, porque el Brief de
 * otro cliente en una Planificación es el mismo daño que mezclar sesiones. Por eso es conservador: el nombre del cliente
 * tiene que estar ENTERO en el título de la hoja, y si calzan dos clientes o varios proyectos no propone ninguno.
 */
const norm = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

export interface ProyectoDelLote {
  id: string;
  nombre: string;
  cliente: string;
}

export type HojaEnElLote =
  | { tipo: "uno"; id: string; nombre: string; cliente: string }
  | { tipo: "varios"; candidatos: string[] }
  | { tipo: "ninguno" };

/**
 * El proyecto de una hoja por su título. Si calzan dos clientes y uno está adentro del otro («Grupo Alfa» y «Alfa»), gana
 * el más largo; si son dos distintos («Alfa y Beta Corp»), no propone ninguno. Si el cliente tiene varios proyectos
 * activos, uno cuyo nombre también esté en el título lo decide; si no, son varios.
 */
export function proyectoParaLaHoja(titulo: string, proyectos: readonly ProyectoDelLote[]): HojaEnElLote {
  const t = norm(titulo);
  const clientes = new Map<string, ProyectoDelLote[]>();
  for (const p of proyectos) {
    const c = norm(p.cliente);
    if (c.trim().length < 3 || !t.includes(c)) continue;
    clientes.set(c, [...(clientes.get(c) ?? []), p]);
  }
  if (!clientes.size) return { tipo: "ninguno" };
  const claves = [...clientes.keys()];
  const mejores = [...clientes.entries()].filter(([c]) => !claves.some((otro) => otro !== c && otro.includes(c)));
  if (mejores.length > 1) return { tipo: "varios", candidatos: mejores.map(([, ps]) => ps[0].cliente) };
  const delCliente = mejores[0][1];
  const conNombre = delCliente.filter((p) => t.includes(norm(p.nombre)));
  const elegidos = delCliente.length === 1 ? delCliente : conNombre;
  if (elegidos.length === 1) return { tipo: "uno", id: elegidos[0].id, nombre: elegidos[0].nombre, cliente: elegidos[0].cliente };
  return { tipo: "varios", candidatos: delCliente.map((p) => p.nombre) };
}

/** ¿El título de la hoja nombra al cliente? Si no, la ruta pide confirmarlo: puede ser el enlace de otra cuenta. */
export function hojaNombraAlCliente(titulo: string, cliente: string): boolean {
  const c = norm(cliente);
  return c.trim().length > 0 && norm(titulo).includes(c);
}

/** Una línea del archivo: `projectId,enlace[,correo]`. Vacía o con `#` no es fila. */
export function filaDelArchivoDeBriefs(linea: string, correoPorDefecto: string | null): Array<{ projectId: string; url: string; correo: string | null }> {
  const l = linea.trim();
  if (!l || l.startsWith("#")) return [];
  const [projectId = "", url = "", correo = ""] = l.split(",").map((x) => x.trim());
  if (!projectId || !url) return [];
  return [{ projectId, url, correo: correo || correoPorDefecto }];
}
