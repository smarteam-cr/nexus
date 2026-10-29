/**
 * lib/smarteam/posicionamiento.ts — el position statement de la empresa que usa Nexus: la frase y sus frentes (K3 y
 * pregunta 12 del roadmap, 2026-10-28). PURO y client-safe.
 *
 * Elías lo escribió el 28 oct: «Smarteam en una frase» y tres frentes (Estructura · HubSpot, Activación · Insider One,
 * Acompañamiento), cada uno con «qué logra» y «cuándo cabe». Se edita en Marketing › Audiencia y la preventa lo
 * personaliza para cada prospecto validando contra él (lib/exploraciones/posicionamiento.ts): no puede prometer lo que
 * la base no dice ni proponer un frente cuyas condiciones el prospecto no cumple.
 *
 * La frase vive en `PerfilDeLaEmpresa.positionStatement` (la leían ya la preventa y el analizador de la venta); los
 * frentes, en `PerfilDeLaEmpresa.frentes` (Json). Un frente sin «qué logra» o sin «cuándo cabe» está pendiente: se ve
 * así en Audiencia y la preventa no lo propone por calce.
 *
 * Sin zod a propósito (lo importa la pantalla de Audiencia): lo que acepta la ruta vive en ./posicionamiento-esquema.ts.
 */
export interface LogroDelFrente {
  /** Lo que logra, corto («Un solo lugar por cliente»). */
  titulo: string;
  /** El detalle («toda su historia, visible para el equipo»). */
  detalle: string | null;
}

export interface FrenteDelPosicionamiento {
  /** Identidad del frente, sale del nombre («estructura»). */
  clave: string;
  /** «Estructura», «Activación», «Acompañamiento». */
  nombre: string;
  /** La herramienta con la que se trabaja («HubSpot», «Insider One»); null si no hay una. */
  herramienta: string | null;
  /** La promesa en una línea («Ordenar procesos, datos y equipos en un solo lugar»). */
  promesa: string;
  /** El título del detalle («HubSpot: ordenar la relación con cada cliente»). */
  titulo: string | null;
  queLogra: LogroDelFrente[];
  /** Las condiciones en las que cabe, una por línea («La venta toma semanas o meses»). */
  cuandoCabe: string[];
  /** Un ejemplo o una advertencia («Sin volumen, la IA no tiene de qué aprender»). */
  nota: string | null;
}

export interface Posicionamiento {
  /** «Smarteam en una frase»: qué hacemos por las empresas. */
  frase: string | null;
  frentes: FrenteDelPosicionamiento[];
}

/** El frente no tiene todavía su detalle: sin él, la preventa no lo puede proponer por calce. */
export function frentePendiente(f: Pick<FrenteDelPosicionamiento, "queLogra" | "cuandoCabe">): boolean {
  return f.queLogra.length === 0 || f.cuandoCabe.length === 0;
}

/** La clave de un frente desde su nombre: minúsculas, sin tildes ni signos («Activación» → «activacion»). */
export function claveDelFrente(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "frente"
  );
}

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

/** Lectura tolerante del Json guardado: lo que no tiene forma se salta. */
export function leerFrentes(v: unknown): FrenteDelPosicionamiento[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const nombre = str(o.nombre);
    const promesa = str(o.promesa);
    if (!nombre || !promesa) return [];
    const queLogra = (Array.isArray(o.queLogra) ? o.queLogra : []).flatMap((l) => {
      const ll = (l ?? {}) as Record<string, unknown>;
      const titulo = str(ll.titulo);
      return titulo ? [{ titulo, detalle: str(ll.detalle) }] : [];
    });
    const cuandoCabe = (Array.isArray(o.cuandoCabe) ? o.cuandoCabe : []).map(str).filter((c): c is string => !!c);
    return [
      {
        clave: str(o.clave) ?? claveDelFrente(nombre),
        nombre,
        herramienta: str(o.herramienta),
        promesa,
        titulo: str(o.titulo),
        queLogra,
        cuandoCabe,
        nota: str(o.nota),
      },
    ];
  });
}

/** El nombre del frente con su herramienta, como lo escribió Elías: «Estructura · HubSpot». */
export function nombreCompleto(f: Pick<FrenteDelPosicionamiento, "nombre" | "herramienta">): string {
  return f.herramienta ? `${f.nombre} · ${f.herramienta}` : f.nombre;
}

/** El position statement para un agente: la frase y, por frente, la promesa, lo que logra y cuándo cabe. */
export function textoDelPosicionamiento(p: Posicionamiento): string | null {
  const partes: string[] = [];
  if (p.frase) partes.push(`Smarteam en una frase: ${p.frase}`);
  for (const f of p.frentes) {
    const lineas = [`Frente ${nombreCompleto(f)}: ${f.promesa}`];
    if (f.queLogra.length) lineas.push(`  Qué logra: ${f.queLogra.map((l) => (l.detalle ? `${l.titulo} (${l.detalle})` : l.titulo)).join("; ")}`);
    if (f.cuandoCabe.length) lineas.push(`  Cuándo cabe: ${f.cuandoCabe.join("; ")}`);
    if (f.nota) lineas.push(`  Nota: ${f.nota}`);
    if (frentePendiente(f)) lineas.push("  (Pendiente: todavía sin su detalle.)");
    partes.push(lineas.join("\n"));
  }
  return partes.length ? partes.join("\n") : null;
}
