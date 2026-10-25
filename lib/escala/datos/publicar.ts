/**
 * lib/escala/datos/publicar.ts — lo que se revisa antes de publicar el borrador desde Nexus. PURO.
 *
 * Es lo mismo que mira `scripts/publicar-escala.ts`, sin Python: las pruebas de la escala (con las
 * del cálculo, que desde el 2026-10-08 también corren en TypeScript), qué cambia contra la versión
 * publicada, lo que una edición dice con sus palabras y quedó viejo, y el mapa de herramientas.
 * Devuelve lo que FRENA (`bloqueos`) aparte de lo que solo se avisa.
 *
 * La especificación y el manual NO se publican desde acá: dicen desde qué versión de la escala valen
 * y sacan una versión nueva solo cuando cambian ellos (Elías, 2026-10-08), por el script.
 */
import { compararEscalas } from "@/lib/escala/documento/diferencias";
import type { Escala } from "@/lib/escala/documento/tipos";
import { validarEscala, type ResultadoDePrueba } from "@/lib/escala/documento/validar";
import { problemasDelMapa } from "@/lib/escala/herramientas/validar";
import type { MapaDeHerramientas } from "@/lib/escala/herramientas/tipos";
import { compararVersiones, tieneLoQueFaltaDecidir } from "./reglas";

export interface RevisionDelBorrador {
  version: string;
  /** La versión publicada contra la que se compara (null si no hay ninguna que se pueda leer). */
  contra: string | null;
  pruebas: ResultadoDePrueba[];
  /** Qué cambia contra la publicada, por identificador (criterios, niveles y dimensiones). */
  cambios: { nuevos: string[]; retirados: string[]; cambiados: string[]; conOtrosRequeridos: string[] } | null;
  /** Por edición: lo que dice con sus palabras y cuyo texto general cambió sin que el suyo se tocara. */
  edicionesViejas: { nombre: string; ids: string[] }[];
  /** Lo que no frena: el mapa de herramientas publicado nombra algo que la escala ya no tiene. */
  avisos: string[];
  /** Lo que frena. Vacío = se puede publicar. */
  bloqueos: string[];
}

export function revisarParaPublicar(args: {
  escala: Escala;
  /** El `.md` que se va a publicar (la regla de «por confirmar» se lee de su texto). */
  texto: string;
  anterior: Escala | null;
  especificacion: string | null;
  manual: string | null;
  mapa: MapaDeHerramientas | null;
  /** Las versiones de la escala ya publicadas. */
  publicadas: string[];
  /** Quien publica miró lo que quedó viejo en las ediciones y sigue diciendo lo mismo. */
  edicionesRevisadas: boolean;
}): RevisionDelBorrador {
  const { escala, anterior } = args;
  const bloqueos: string[] = [];

  if (args.publicadas.includes(escala.version)) bloqueos.push(`La ${escala.version} ya está publicada: una versión publicada no cambia.`);
  const ultima = [...args.publicadas].sort(compararVersiones).at(-1) ?? null;
  if (ultima && compararVersiones(escala.version, ultima) <= 0 && !args.publicadas.includes(escala.version)) {
    bloqueos.push(`La ${escala.version} no es posterior a la ${ultima}, que es la última publicada.`);
  }

  if (tieneLoQueFaltaDecidir(args.texto)) {
    bloqueos.push("El borrador todavía trae «Lo que falta decidir»: decide lo que pregunta, escribe lo que falta y quita esa parte antes de publicar.");
  }

  const pruebas = validarEscala(escala, {
    anterior,
    especificacion: args.especificacion,
    manual: args.manual,
    calculo: { texto: args.texto },
  });
  for (const p of pruebas) if (!p.ok) bloqueos.push(`No pasa la prueba «${p.nombre}».`);

  let cambios: RevisionDelBorrador["cambios"] = null;
  const edicionesViejas: RevisionDelBorrador["edicionesViejas"] = [];
  if (anterior) {
    const c = compararEscalas(anterior, escala);
    cambios = {
      nuevos: c.nuevos,
      retirados: c.retirados,
      cambiados: c.cambiados.map((x) => x.id),
      conOtrosRequeridos: c.requeridos.map((x) => x.id),
    };
    for (const ed of c.ediciones) if (ed.viejos.length) edicionesViejas.push({ nombre: ed.nombre, ids: ed.viejos });
    if (edicionesViejas.length && !args.edicionesRevisadas) {
      bloqueos.push("Hay textos de las ediciones que quedaron viejos: míralos y marca que siguen diciendo lo mismo, o corrígelos en el borrador.");
    }
  }

  const avisos = args.mapa ? problemasDelMapa(args.mapa, escala) : [];
  return { version: escala.version, contra: anterior?.version ?? null, pruebas, cambios, edicionesViejas, avisos, bloqueos };
}
