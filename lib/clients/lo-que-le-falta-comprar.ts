/**
 * lib/clients/lo-que-le-falta-comprar.ts — lo que le falta comprar a cada empresa: la venta cruzada (R12, 2026-10-25).
 * PURO y client-safe.
 *
 * Con la posición de la empresa en la escala y los casos de uso que ya tiene (los vendidos, los sugeridos y los
 * descartados), dice qué casos del catálogo la moverían y todavía no tiene, y cuál va primero (el «siguiente caso»,
 * que se escribe en HubSpot como `nexus_siguiente_caso` para que Ventas arme su lista de venta cruzada). La regla de qué
 * caso mueve a un área es la del camino de crecimiento (lib/casos-de-uso/camino.ts): el área más baja primero, y dentro
 * de ella lo que destraba la dimensión que la frena. Sin posición en la escala, lo que aterriza el área de cada hub que
 * el TAM le asigna y no paga (U27). Sin IA. Lo ve el equipo en la ficha (Ventas en la cuenta; el CSE al cerrar un ciclo
 * o una implementación). Decisión: DECISIONS › «La empresa, parte 2».
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { caminoDeCrecimiento, type AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import { CATALOGO_DE_CASOS, type AreaDeLaEscala, type CasoDelCatalogo } from "@/lib/casos-de-uso/catalogo";
import type { Hub } from "@/lib/cs/licencias";

/** Un caso de uso que la empresa ya tiene (`CasoDeUso`): solo el título y el estado. */
export interface CasoDeLaEmpresa {
  titulo: string;
  estado: string;
}

/** Ya los tiene: en el plan, en un ciclo o cumplido. Descartado: alguien dijo que no. Los dos no se vuelven a sugerir. */
const ESTADOS_QUE_YA_TIENE: ReadonlySet<string> = new Set(["en_plan", "en_ciclo", "cumplido"]);
const ESTADOS_DESCARTADOS: ReadonlySet<string> = new Set(["descartado"]);

/** El área de la escala de cada hub (Content Hub no tiene un área propia). */
const AREA_DEL_HUB: Partial<Record<Hub, AreaDeLaEscala>> = { sales: "1", marketing: "2", service: "3" };
const NOMBRE_DEL_AREA: Record<AreaDeLaEscala, string> = { "1": "Ventas", "2": "Marketing", "3": "Servicio" };

export interface SugerenciaDeVenta {
  casoId: string;
  titulo: string;
  promesa: string;
  areaId: string;
  areaNombre: string;
  /** Por qué, en una frase. */
  razon: string;
  /** Mueve la dimensión que hoy frena al área. */
  destraba: boolean;
  /** Ya estaba sugerido en la cuenta (un `CasoDeUso` en «sugerido»): falta venderlo. */
  yaSugerido: boolean;
}

export interface LoQueLeFaltaComprar {
  /** Salió de la posición en la escala (si no, de los hubs que le faltan). */
  conEscala: boolean;
  casos: SugerenciaDeVenta[];
  /** El primero: el que va a HubSpot. null = no hay nada que sugerir. */
  siguiente: SugerenciaDeVenta | null;
  /** Cuántos casos ya tiene (no se sugieren). */
  yaTiene: number;
  /** Una frase con de dónde sale la lista. */
  porQue: string;
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const NIVEL: Record<Letra, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };
const nombreDeNivel = (l: Letra) => NIVEL[l] ?? l;

export function loQueLeFaltaComprar(o: {
  /** Las áreas ubicadas en la escala (la foto más reciente), o null si la empresa no está posicionada. */
  escala: readonly AreaParaElCamino[] | null;
  casos: readonly CasoDeLaEmpresa[];
  /** Los hubs que el TAM v1 le asigna y no paga (lib/clients/lo-que-ya-paga.ts › loQueLeFalta). */
  hubsQueLeFaltan: readonly { hub: Hub }[];
  max?: number;
}): LoQueLeFaltaComprar {
  const max = o.max ?? 5;
  const tiene = new Set(o.casos.filter((c) => ESTADOS_QUE_YA_TIENE.has(c.estado)).map((c) => normal(c.titulo)));
  const descartados = new Set(o.casos.filter((c) => ESTADOS_DESCARTADOS.has(c.estado)).map((c) => normal(c.titulo)));
  const sugeridos = new Set(o.casos.filter((c) => c.estado === "sugerido").map((c) => normal(c.titulo)));
  const excluir = new Set(CATALOGO_DE_CASOS.filter((c) => tiene.has(normal(c.titulo)) || descartados.has(normal(c.titulo))).map((c) => c.id));
  const yaTiene = tiene.size;

  const deUnCaso = (caso: CasoDelCatalogo, areaId: string, areaNombre: string, razon: string, destraba: boolean): SugerenciaDeVenta => ({
    casoId: caso.id,
    titulo: caso.titulo,
    promesa: caso.promesa,
    areaId,
    areaNombre,
    razon,
    destraba,
    yaSugerido: sugeridos.has(normal(caso.titulo)),
  });

  const ubicadas = (o.escala ?? []).filter((a) => a.nivel);
  if (ubicadas.length) {
    const camino = caminoDeCrecimiento(ubicadas, nombreDeNivel, { excluir, casosPorArea: 3 });
    const vistos = new Set<string>();
    const casos: SugerenciaDeVenta[] = [];
    // Una vuelta por área para repartir: el área más baja pone su primer caso antes que la segunda su segundo.
    for (let i = 0; i < 3 && casos.length < max; i++) {
      for (const paso of camino) {
        const c = paso.casos[i];
        if (!c || vistos.has(c.caso.id) || casos.length >= max) continue;
        vistos.add(c.caso.id);
        casos.push(deUnCaso(c.caso, paso.areaId, paso.areaNombre, c.razon, c.destraba));
      }
    }
    return {
      conEscala: true,
      casos,
      siguiente: casos[0] ?? null,
      yaTiene,
      porQue: casos.length
        ? "Sale de su posición en la escala: lo que movería el área más baja primero, y dentro de ella lo que la frena."
        : "Con su posición en la escala, no hay un caso del catálogo que la mueva y que no tenga.",
    };
  }

  // Sin escala: el caso que aterriza el área de cada hub que le falta.
  const casos: SugerenciaDeVenta[] = [];
  for (const { hub } of o.hubsQueLeFaltan) {
    const area = AREA_DEL_HUB[hub];
    if (!area) continue;
    const caso = CATALOGO_DE_CASOS.find((c) => c.tipo === "aterrizar" && c.areas.includes(area) && !excluir.has(c.id));
    if (!caso || casos.some((x) => x.casoId === caso.id) || casos.length >= max) continue;
    casos.push(deUnCaso(caso, area, NOMBRE_DEL_AREA[area], `Le sirve ${NOMBRE_DEL_AREA[area] === "Ventas" ? "Sales" : NOMBRE_DEL_AREA[area] === "Marketing" ? "Marketing" : "Service"} Hub y no lo tiene: es la entrada a ${NOMBRE_DEL_AREA[area]}.`, false));
  }
  return {
    conEscala: false,
    casos,
    siguiente: casos[0] ?? null,
    yaTiene,
    porQue: casos.length
      ? "La empresa no está posicionada en la escala: sale de los hubs que le corresponden por su tamaño y su modelo de negocio y no tiene."
      : "Sin posición en la escala ni hubs que le falten, no hay qué sugerir todavía.",
  };
}
