/**
 * lib/external/selector-de-proyectos.ts — «Ver otros proyectos», la página que elige proyecto y
 * cómo se nombra el proyecto en la pestaña.
 *
 * Solo se lista lo que ESTE navegador ya abrió con su contraseña (decisión de Elías, 2026-09-10):
 * nunca se le muestra a nadie un proyecto que no le compartieron, y no se abre ninguna forma nueva
 * de entrar. Si el cliente abrió un solo proyecto no hay nada que listar, y el botón no aparece.
 *
 * ⚠ El CSE proyecta estas páginas en reuniones, y su navegador tiene abiertos proyectos de otros
 * clientes. Por eso:
 *   - el «Ver otros proyectos» de una página se limita al MISMO cliente;
 *   - la página que elige proyecto (dirección sin proyecto) avisa cuando lo abierto es de MÁS DE
 *     UN cliente, y el componente pliega la lista detrás de un clic: ningún nombre de otro cliente
 *     queda en la pantalla de una reunión sin que alguien lo pida.
 *
 * PURO: recibe los accesos ya resueltos por lib/external/access.ts y devuelve rótulos y direcciones.
 */
import { publishSurface, type PublishSurfaceKey } from "@/lib/projects/publish-surfaces";
import { nombreVisibleDelProyecto } from "./nombre-visible";
import { esIdDeAcceso, rutaDeSuperficie } from "./rutas";

/** Lo mínimo de un acceso resuelto que hace falta para listarlo. */
export interface ProyectoAbierto {
  accessId: string;
  project: {
    name: string;
    clientId: string;
    kickoffPublishedAt: Date | null;
    timelinePublishedAt: Date | null;
    desarrolloPublishedAt: Date | null;
    entregaPublishedAt: Date | null;
    client: { name: string };
  };
}

export interface OpcionDeProyecto {
  nombre: string;
  cliente: string;
  href: string;
}

const ETIQUETA: Record<PublishSurfaceKey, string> = {
  kickoff: "Kickoff",
  cronograma: "Cronograma",
  desarrollo: "Requerimiento técnico",
  entrega: "Entrega",
};

const publicada = (a: ProyectoAbierto, superficie: PublishSurfaceKey): boolean =>
  !!a.project[publishSurface(superficie).flag];

/** Cómo se nombra el proyecto que se está mirando (encabezado de la página). */
export function rotuloDelProyecto(a: ProyectoAbierto): { nombre: string; cliente: string } {
  return {
    nombre: nombreVisibleDelProyecto(a.project.name, a.project.client.name),
    cliente: a.project.client.name,
  };
}

const opcion = (a: ProyectoAbierto, superficie: PublishSurfaceKey): OpcionDeProyecto => ({
  ...rotuloDelProyecto(a),
  href: rutaDeSuperficie(a.accessId, superficie),
});

/**
 * El acceso que nombra la dirección, si este navegador lo tiene abierto. Un id con forma inválida
 * o que el navegador no tiene → null, y la página responde lo mismo exista o no ese id.
 */
export function elegirAcceso<T extends { accessId: string }>(accesos: readonly T[], acceso: string): T | null {
  if (!esIdDeAcceso(acceso)) return null;
  return accesos.find((a) => a.accessId === acceso) ?? null;
}

/** Los OTROS proyectos del mismo cliente que este navegador ya abrió y tienen esta superficie publicada. */
export function otrosProyectosDelMismoCliente(
  abiertos: readonly ProyectoAbierto[],
  actual: ProyectoAbierto,
  superficie: PublishSurfaceKey,
): OpcionDeProyecto[] {
  return abiertos
    .filter(
      (a) =>
        a.accessId !== actual.accessId &&
        a.project.clientId === actual.project.clientId &&
        publicada(a, superficie),
    )
    .map((a) => opcion(a, superficie));
}

export interface OpcionesSinProyecto {
  opciones: OpcionDeProyecto[];
  /** Hay proyectos de más de un cliente: el componente NO muestra los nombres sin un clic. */
  variosClientes: boolean;
}

/**
 * Para una dirección SIN proyecto (la vieja, o un favorito de antes): todo lo que este navegador
 * abrió con esta superficie publicada, y si eso mezcla clientes. Se cuenta sobre lo PUBLICADO: un
 * proyecto sin esta superficie no se lista, así que tampoco cuenta como otro cliente.
 */
export function opcionesParaDireccionSinProyecto(
  abiertos: readonly ProyectoAbierto[],
  superficie: PublishSurfaceKey,
): OpcionesSinProyecto {
  const publicados = abiertos.filter((a) => publicada(a, superficie));
  return {
    opciones: publicados.map((a) => opcion(a, superficie)),
    variosClientes: new Set(publicados.map((a) => a.project.clientId)).size > 1,
  };
}

/** ¿Este navegador tiene abierto algún proyecto con esta superficie publicada? (para no dejar un callejón) */
export function hayProyectosAbiertos(abiertos: readonly ProyectoAbierto[], superficie: PublishSurfaceKey): boolean {
  return abiertos.some((a) => publicada(a, superficie));
}

/**
 * El título de la pestaña (y del favorito, y del historial): nombra el proyecto solo si ESTE
 * navegador lo tiene abierto y la superficie está publicada. Si no, el genérico: el título no puede
 * contarle a nadie de qué proyecto es una dirección que no puede abrir.
 */
export function tituloDeLaPestana(actual: ProyectoAbierto | null, superficie: PublishSurfaceKey): string {
  if (!actual || !publicada(actual, superficie)) return `${ETIQUETA[superficie]} · Smarteam`;
  return `${ETIQUETA[superficie]} · ${rotuloDelProyecto(actual).nombre} · Smarteam`;
}
