/**
 * lib/procesos/operaciones.ts — LOS CAMBIOS A UN MAPA, UNO POR UNO.
 *
 * Puro (sin Prisma ni servidor). Cada cosa que se hace en el editor de pantalla completa es una
 * operación: agregar un paso, moverlo de carril, conectar dos pasos, renombrar un carril… El editor
 * guarda la lista (deshacer quita la última) y el servidor la vuelve a aplicar sobre el mapa guardado,
 * con la misma función: lo que se ve antes de guardar es lo que queda. El chat de Nexus, cuando llegue,
 * va a proponer una lista de estas mismas operaciones.
 *
 * Las posiciones no se guardan: el acomodo es automático (lib/procesos/layout.ts). El carril dice
 * quién hace el paso y las flechas dicen el orden.
 *
 * Reglas que valen siempre, venga la operación del editor o del chat:
 *  - «Lo dijo el cliente» (hoy) y «Acordado» (después) piden al menos una cita; si se quita la
 *    última, el paso baja a supuesto (hoy) o propuesto (después).
 *  - El dolor es de HOY; qué cambia, dónde vive en HubSpot y a qué reemplaza son de DESPUÉS.
 *  - Un carril con pasos no se quita; quitar un paso se lleva sus flechas y lo que lo nombraba.
 */
import type {
  CambioDelPaso,
  CarrilDelMapa,
  CitaDelPaso,
  MapaDeProceso,
  OrigenDelPaso,
  PasoDelMapa,
  TipoDeCarril,
  TipoDePaso,
  VersionDelMapa,
} from "./mapa";

export type CualDelMapa = "hoy" | "despues";

/** Los campos de un paso que se editan desde el panel. */
export interface CambiosDelPaso {
  texto?: string;
  carril?: string;
  tipo?: TipoDePaso;
  herramienta?: string;
  dolor?: string;
  origen?: OrigenDelPaso;
  cambio?: CambioDelPaso;
  enHubspot?: string;
  reemplaza?: string[];
}

export type OperacionDelMapa =
  | { tipo: "paso.agregar"; version: CualDelMapa; paso: { id: string; carril: string; texto: string; tipo: TipoDePaso }; despuesDe?: string | null }
  | { tipo: "paso.editar"; version: CualDelMapa; pasoId: string; cambios: CambiosDelPaso }
  | { tipo: "paso.quitar"; version: CualDelMapa; pasoId: string }
  | { tipo: "cita.agregar"; version: CualDelMapa; pasoId: string; cita: CitaDelPaso }
  | { tipo: "cita.quitar"; version: CualDelMapa; pasoId: string; sesionId: string; cita: string }
  | { tipo: "flecha.agregar"; version: CualDelMapa; de: string; a: string; etiqueta?: string }
  | { tipo: "flecha.editar"; version: CualDelMapa; de: string; a: string; etiqueta: string }
  | { tipo: "flecha.quitar"; version: CualDelMapa; de: string; a: string }
  | { tipo: "carril.agregar"; version: CualDelMapa; carril: { id: string; nombre: string; tipo: TipoDeCarril } }
  | { tipo: "carril.editar"; version: CualDelMapa; carrilId: string; nombre?: string; tipoDeCarril?: TipoDeCarril }
  | { tipo: "carril.mover"; version: CualDelMapa; carrilId: string; hacia: "arriba" | "abajo" }
  | { tipo: "carril.quitar"; version: CualDelMapa; carrilId: string };

/** Una operación que no se puede aplicar: el mensaje es para la persona, en su idioma. */
export class ErrorDeOperacion extends Error {}

/** Topes del editor (el agente arma hasta 14 pasos; una persona puede llegar a 30). */
export const TOPES = { pasos: 30, carriles: 12, citasPorPaso: 4, texto: 120, herramienta: 80, dolor: 140, enHubspot: 160, nombreDeCarril: 80, etiqueta: 40 } as const;

export const ORIGENES_DE: Record<CualDelMapa, OrigenDelPaso[]> = { hoy: ["dicho", "supuesto"], despues: ["acordado", "propuesto", "supuesto"] };

/** El origen al que baja un paso que se queda sin citas. */
const SIN_CITA: Record<CualDelMapa, OrigenDelPaso> = { hoy: "supuesto", despues: "propuesto" };

/** El origen de un paso nuevo hecho a mano: en hoy lo supone quien lo pone; en después lo propone Smarteam. */
export const ORIGEN_DE_UN_PASO_NUEVO: Record<CualDelMapa, OrigenDelPaso> = { hoy: "supuesto", despues: "propuesto" };

const limpio = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const pideCita = (o: OrigenDelPaso) => o === "dicho" || o === "acordado";

function versionDe(m: MapaDeProceso, cual: CualDelMapa): VersionDelMapa {
  return cual === "hoy" ? m.hoy : m.despues;
}

function conVersion(m: MapaDeProceso, cual: CualDelMapa, v: VersionDelMapa): MapaDeProceso {
  return cual === "hoy" ? { ...m, hoy: v } : { ...m, despues: { ...m.despues, ...v } };
}

function buscarPaso(v: VersionDelMapa, id: string): { paso: PasoDelMapa; i: number } {
  const i = v.pasos.findIndex((p) => p.id === id);
  if (i === -1) throw new ErrorDeOperacion("Ese paso ya no está en el mapa.");
  return { paso: v.pasos[i], i };
}

function conPaso(v: VersionDelMapa, i: number, paso: PasoDelMapa): VersionDelMapa {
  return { ...v, pasos: v.pasos.map((p, k) => (k === i ? paso : p)) };
}

function exigirCarril(v: VersionDelMapa, id: string) {
  if (!v.carriles.some((c) => c.id === id)) throw new ErrorDeOperacion("Ese carril no existe en el mapa.");
}

function exigirId(id: string) {
  if (!/^[\w-]{1,40}$/.test(id)) throw new ErrorDeOperacion("Identificador no válido.");
}

/** Aplica UNA operación. No muta: devuelve un mapa nuevo o lanza `ErrorDeOperacion`. */
export function aplicarOperacion(m: MapaDeProceso, op: OperacionDelMapa): MapaDeProceso {
  const v = versionDe(m, op.version);
  switch (op.tipo) {
    case "paso.agregar": {
      exigirId(op.paso.id);
      if (v.pasos.length >= TOPES.pasos) throw new ErrorDeOperacion(`Un mapa llega hasta ${TOPES.pasos} pasos.`);
      if (v.pasos.some((p) => p.id === op.paso.id)) throw new ErrorDeOperacion("Ya hay un paso con ese identificador.");
      exigirCarril(v, op.paso.carril);
      const texto = limpio(op.paso.texto, TOPES.texto);
      if (!texto) throw new ErrorDeOperacion("El paso necesita decir qué pasa.");
      const paso: PasoDelMapa = {
        id: op.paso.id,
        carril: op.paso.carril,
        texto,
        tipo: op.paso.tipo,
        herramienta: "",
        origen: ORIGEN_DE_UN_PASO_NUEVO[op.version],
        citas: [],
        dolor: "",
        cambio: op.version === "despues" ? "nuevo" : "",
        reemplaza: [],
        enHubspot: "",
      };
      let flechas = v.flechas;
      if (op.despuesDe) {
        buscarPaso(v, op.despuesDe);
        flechas = [...flechas, { de: op.despuesDe, a: paso.id, etiqueta: "" }];
      }
      return conVersion(m, op.version, { ...v, pasos: [...v.pasos, paso], flechas });
    }

    case "paso.editar": {
      const { paso, i } = buscarPaso(v, op.pasoId);
      const c = op.cambios;
      const nuevo: PasoDelMapa = { ...paso };
      if (c.texto !== undefined) {
        const t = limpio(c.texto, TOPES.texto);
        if (!t) throw new ErrorDeOperacion("El paso necesita decir qué pasa.");
        nuevo.texto = t;
      }
      if (c.carril !== undefined) {
        exigirCarril(v, c.carril);
        nuevo.carril = c.carril;
      }
      if (c.tipo !== undefined) nuevo.tipo = c.tipo;
      if (c.herramienta !== undefined) nuevo.herramienta = limpio(c.herramienta, TOPES.herramienta);
      if (c.dolor !== undefined) {
        if (op.version !== "hoy") throw new ErrorDeOperacion("El dolor es del mapa de hoy.");
        nuevo.dolor = limpio(c.dolor, TOPES.dolor);
      }
      if (c.cambio !== undefined || c.enHubspot !== undefined || c.reemplaza !== undefined) {
        if (op.version !== "despues") throw new ErrorDeOperacion("Qué cambia, dónde vive en HubSpot y qué reemplaza son del mapa de después.");
        if (c.cambio !== undefined) nuevo.cambio = c.cambio;
        if (c.enHubspot !== undefined) nuevo.enHubspot = limpio(c.enHubspot, TOPES.enHubspot);
        if (c.reemplaza !== undefined) {
          const deHoy = new Set(m.hoy.pasos.map((p) => p.id));
          nuevo.reemplaza = [...new Set(c.reemplaza)].filter((id) => deHoy.has(id));
        }
      }
      if (c.origen !== undefined) {
        if (!ORIGENES_DE[op.version].includes(c.origen)) throw new ErrorDeOperacion("Ese origen no vale para esta versión del mapa.");
        if (pideCita(c.origen) && nuevo.citas.length === 0) {
          throw new ErrorDeOperacion(
            op.version === "hoy"
              ? "Para «Lo dijo el cliente» hace falta una cita de una reunión. Súmala primero."
              : "Para «Acordado» hace falta una cita de una reunión. Súmala primero.",
          );
        }
        nuevo.origen = c.origen;
      }
      return conVersion(m, op.version, conPaso(v, i, nuevo));
    }

    case "paso.quitar": {
      buscarPaso(v, op.pasoId);
      const sinPaso: VersionDelMapa = {
        ...v,
        pasos: v.pasos.filter((p) => p.id !== op.pasoId),
        flechas: v.flechas.filter((f) => f.de !== op.pasoId && f.a !== op.pasoId),
      };
      let mapa = conVersion(m, op.version, sinPaso);
      // Lo que nombraba al paso: los cambios del proceso y, si era de hoy, lo que reemplaza y lo que se va.
      mapa = {
        ...mapa,
        cambios: mapa.cambios.map((c) => (op.version === "hoy" ? { ...c, hoy: c.hoy.filter((id) => id !== op.pasoId) } : { ...c, despues: c.despues.filter((id) => id !== op.pasoId) })),
      };
      if (op.version === "hoy") {
        mapa = {
          ...mapa,
          despues: {
            ...mapa.despues,
            pasos: mapa.despues.pasos.map((p) => (p.reemplaza.includes(op.pasoId) ? { ...p, reemplaza: p.reemplaza.filter((id) => id !== op.pasoId) } : p)),
            seVa: mapa.despues.seVa.filter((s) => s.id !== op.pasoId),
          },
        };
      }
      return mapa;
    }

    case "cita.agregar": {
      const { paso, i } = buscarPaso(v, op.pasoId);
      const cita = limpio(op.cita.cita, 400);
      if (!op.cita.sesionId || cita.length < 12) throw new ErrorDeOperacion("La cita tiene que ser una frase de una reunión.");
      if (paso.citas.some((c) => c.sesionId === op.cita.sesionId && c.cita === cita)) return m;
      if (paso.citas.length >= TOPES.citasPorPaso) throw new ErrorDeOperacion(`Un paso lleva hasta ${TOPES.citasPorPaso} citas.`);
      return conVersion(m, op.version, conPaso(v, i, { ...paso, citas: [...paso.citas, { ...op.cita, cita }] }));
    }

    case "cita.quitar": {
      const { paso, i } = buscarPaso(v, op.pasoId);
      const citas = paso.citas.filter((c) => !(c.sesionId === op.sesionId && c.cita === op.cita));
      if (citas.length === paso.citas.length) return m;
      const origen = pideCita(paso.origen) && citas.length === 0 ? SIN_CITA[op.version] : paso.origen;
      return conVersion(m, op.version, conPaso(v, i, { ...paso, citas, origen }));
    }

    case "flecha.agregar": {
      buscarPaso(v, op.de);
      buscarPaso(v, op.a);
      if (op.de === op.a) throw new ErrorDeOperacion("Una flecha une dos pasos distintos.");
      if (v.flechas.some((f) => f.de === op.de && f.a === op.a)) return m;
      return conVersion(m, op.version, { ...v, flechas: [...v.flechas, { de: op.de, a: op.a, etiqueta: limpio(op.etiqueta ?? "", TOPES.etiqueta) }] });
    }

    case "flecha.editar": {
      const i = v.flechas.findIndex((f) => f.de === op.de && f.a === op.a);
      if (i === -1) throw new ErrorDeOperacion("Esa flecha ya no está en el mapa.");
      return conVersion(m, op.version, { ...v, flechas: v.flechas.map((f, k) => (k === i ? { ...f, etiqueta: limpio(op.etiqueta, TOPES.etiqueta) } : f)) });
    }

    case "flecha.quitar": {
      const flechas = v.flechas.filter((f) => !(f.de === op.de && f.a === op.a));
      if (flechas.length === v.flechas.length) throw new ErrorDeOperacion("Esa flecha ya no está en el mapa.");
      return conVersion(m, op.version, { ...v, flechas });
    }

    case "carril.agregar": {
      exigirId(op.carril.id);
      if (v.carriles.length >= TOPES.carriles) throw new ErrorDeOperacion(`Un mapa llega hasta ${TOPES.carriles} carriles.`);
      if (v.carriles.some((c) => c.id === op.carril.id)) throw new ErrorDeOperacion("Ya hay un carril con ese identificador.");
      const nombre = limpio(op.carril.nombre, TOPES.nombreDeCarril);
      if (!nombre) throw new ErrorDeOperacion("El carril necesita un nombre.");
      const carril: CarrilDelMapa = { id: op.carril.id, nombre, tipo: op.carril.tipo };
      return conVersion(m, op.version, { ...v, carriles: [...v.carriles, carril] });
    }

    case "carril.editar": {
      const i = v.carriles.findIndex((c) => c.id === op.carrilId);
      if (i === -1) throw new ErrorDeOperacion("Ese carril no existe en el mapa.");
      const carril = { ...v.carriles[i] };
      if (op.nombre !== undefined) {
        const nombre = limpio(op.nombre, TOPES.nombreDeCarril);
        if (!nombre) throw new ErrorDeOperacion("El carril necesita un nombre.");
        carril.nombre = nombre;
      }
      if (op.tipoDeCarril !== undefined) carril.tipo = op.tipoDeCarril;
      return conVersion(m, op.version, { ...v, carriles: v.carriles.map((c, k) => (k === i ? carril : c)) });
    }

    case "carril.mover": {
      const i = v.carriles.findIndex((c) => c.id === op.carrilId);
      if (i === -1) throw new ErrorDeOperacion("Ese carril no existe en el mapa.");
      const j = op.hacia === "arriba" ? i - 1 : i + 1;
      if (j < 0 || j >= v.carriles.length) return m;
      const carriles = [...v.carriles];
      [carriles[i], carriles[j]] = [carriles[j], carriles[i]];
      return conVersion(m, op.version, { ...v, carriles });
    }

    case "carril.quitar": {
      if (!v.carriles.some((c) => c.id === op.carrilId)) throw new ErrorDeOperacion("Ese carril no existe en el mapa.");
      if (v.pasos.some((p) => p.carril === op.carrilId)) throw new ErrorDeOperacion("Mueve o quita sus pasos antes de quitar el carril.");
      return conVersion(m, op.version, { ...v, carriles: v.carriles.filter((c) => c.id !== op.carrilId) });
    }
  }
}

/** Aplica la lista en orden. Si una no se puede, lanza con el número de la operación. */
export function aplicarOperaciones(m: MapaDeProceso, ops: readonly OperacionDelMapa[]): MapaDeProceso {
  let mapa = m;
  ops.forEach((op, i) => {
    try {
      mapa = aplicarOperacion(mapa, op);
    } catch (e) {
      if (e instanceof ErrorDeOperacion && ops.length > 1) throw new ErrorDeOperacion(`Cambio ${i + 1}: ${e.message}`);
      throw e;
    }
  });
  return mapa;
}

const claveDeCita = (c: Pick<CitaDelPaso, "sesionId" | "cita">) => `${c.sesionId}|${c.cita}`;

/** Las citas que están en `despues` y no estaban en `antes`: son las que el servidor tiene que verificar. */
export function citasNuevas(antes: MapaDeProceso, despues: MapaDeProceso): { version: CualDelMapa; pasoId: string; cita: CitaDelPaso }[] {
  const out: { version: CualDelMapa; pasoId: string; cita: CitaDelPaso }[] = [];
  for (const cual of ["hoy", "despues"] as const) {
    const previas = new Map(versionDe(antes, cual).pasos.map((p) => [p.id, new Set(p.citas.map(claveDeCita))]));
    for (const p of versionDe(despues, cual).pasos) {
      const ya = previas.get(p.id);
      for (const c of p.citas) if (!ya?.has(claveDeCita(c))) out.push({ version: cual, pasoId: p.id, cita: c });
    }
  }
  return out;
}

/**
 * Reemplaza cada cita nueva por la verificada (con el minuto y quién la dijo) o la saca si no
 * apareció tal cual en su reunión; un paso que se queda sin citas baja de origen.
 */
export function completarCitas(
  m: MapaDeProceso,
  verificadas: ReadonlyMap<string, CitaDelPaso | null>,
): { mapa: MapaDeProceso; descartadas: number } {
  let descartadas = 0;
  let mapa = m;
  for (const cual of ["hoy", "despues"] as const) {
    const v = versionDe(mapa, cual);
    const pasos = v.pasos.map((p) => {
      const citas: CitaDelPaso[] = [];
      for (const c of p.citas) {
        const k = claveDeCita(c);
        if (!verificadas.has(k)) {
          citas.push(c);
          continue;
        }
        const ok = verificadas.get(k);
        if (ok) citas.push(ok);
        else descartadas++;
      }
      if (citas.length === p.citas.length && citas.every((c, i) => c === p.citas[i])) return p;
      return { ...p, citas, origen: pideCita(p.origen) && citas.length === 0 ? SIN_CITA[cual] : p.origen };
    });
    mapa = conVersion(mapa, cual, { ...v, pasos });
  }
  return { mapa, descartadas };
}

export { claveDeCita };

/** Un identificador corto para un paso o un carril nuevo (lo arma el editor; el servidor lo valida). */
export function nuevoId(prefijo: "p" | "c"): string {
  return `${prefijo}-${Math.random().toString(36).slice(2, 9)}`;
}
