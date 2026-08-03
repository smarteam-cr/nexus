/**
 * lib/hubspot/cliente-de-la-empresa.ts — ¿QUÉ cliente de Nexus es esta empresa de HubSpot?
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Los dos formularios que dan de alta algo desde cero (un proyecto, un business case) reciben el
 * id de la empresa de una BÚSQUEDA POR DOMINIO, y el buscador de HubSpot solo devuelve fichas
 * vivas: siempre el **sobreviviente**. Nexus, en cambio, guarda el id que tenía el día que se
 * vinculó el cliente. Si desde entonces la empresa se fusionó, los dos ids no coinciden, el
 * `findFirst` no encuentra nada, la pantalla dice "empresa nueva" y **se crea un segundo cliente**
 * para una empresa que ya estaba.
 *
 * Y el duplicado no es lo peor. Reusar el cliente sin arreglarle el id sería igual de malo por
 * otro lado: el motor del alta crea el registro de HubSpot colgado de `client.hubspotCompanyId`,
 * o sea de la lápida, y el siguiente sync vuelve a preguntar las asociaciones de una ficha muerta
 * y recibe cero. Sería exactamente el síntoma que la tanda anterior vino a matar. Por eso acá
 * **encontrar y reapuntar son la misma operación**: encontrar sin reapuntar deja el problema.
 *
 * ── EL CORTE ENTRE EL BUSCADOR Y EL ALTA (se ganó dos veces) ─────────────────
 * De este módulo, los buscadores usan SOLO `elegirCandidato` —puro, sin red y sin escribir— y
 * nunca `resolverClienteDeLaEmpresa`. El corte no es estético: cada mitad está donde está porque
 * en el otro lado no funciona.
 *
 * · **Preguntar por la fusión NO puede ir en el buscador.** Si el buscador resolviera el cliente,
 *   el formulario mandaría `clientId` en vez de `companyId` —son excluyentes, ver
 *   `armarCuerpoDelAlta`— y esta rama, la que arregla y reapunta, no correría nunca: el cliente se
 *   reusaría con la lápida adentro y el proyecto nuevo nacería colgado de una ficha muerta.
 *
 * · **El desempate NO puede ir solo acá.** Simétrico y menos obvio: cuando la empresa viva SÍ
 *   tiene clientes, el buscador siempre devuelve uno y el alta entra por `clientId`, así que la
 *   regla que prefiere CLIENTE quedaba inalcanzable justo donde importa. Por eso el buscador
 *   desempata con la misma función pura, y devuelve `null` cuando no puede: ahí el formulario
 *   manda la empresa y el alta explica el empate en vez de que nadie elija.
 *
 * ── LO QUE MIDE LA FORMA DE ESTE ARCHIVO (portal real, 2026-08-03) ───────────
 * · 10 de las 158 empresas que Nexus guarda absorbieron a otra: 21 ids sepultados. No es exótico.
 * · 0 clientes apuntan hoy a una lápida — el arreglo es preventivo, no correctivo.
 * · 1 empresa tiene DOS clientes en Nexus: "Areyas" [PROSPECTO] y "Areyá" [CLIENTE], las dos con
 *   el MISMO id. Sin desempate, `findFirst` elige cualquiera; si elige el prospecto, el proyecto
 *   queda fuera de cobranza, de la cartera y del vigilante, sin un solo error. De ahí la regla de
 *   preferir CLIENTE, que arregla un caso vivo y no una hipótesis.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { idsAbsorbidosPor, type LectorDeHubspot } from "@/lib/hubspot/empresa-fusionada";

/** Lo mínimo para desempatar. Se declara acá para que la regla se pueda probar sin base. */
export interface CandidatoACliente {
  id: string;
  name: string;
  kind: string;
}

export type EleccionDeCandidato =
  | { estado: "ninguno" }
  | { estado: "uno"; cliente: CandidatoACliente }
  | { estado: "ambiguo"; candidatos: CandidatoACliente[] };

/**
 * Con qué criterio se elige cuando una empresa tiene más de un cliente en Nexus.
 *
 * Puro y exportado para que el criterio sea una tabla que se escribe entera en un test, en vez de
 * un `orderBy` escondido en una consulta. Es una decisión de plata: el `kind` decide si el
 * proyecto entra al universo de Cobranza (`CS_CLIENT_WHERE` filtra por CLIENTE).
 *
 * ⚠ Con dos CLIENTE de verdad NO se elige. Son dos cuentas reales sobre la misma empresa y
 * adivinar mandaría la facturación a la equivocada en silencio; que corte es la respuesta honesta.
 */
export function elegirCandidato(candidatos: readonly CandidatoACliente[]): EleccionDeCandidato {
  if (candidatos.length === 0) return { estado: "ninguno" };
  if (candidatos.length === 1) return { estado: "uno", cliente: candidatos[0] };

  const clientes = candidatos.filter((c) => c.kind === "CLIENTE");
  if (clientes.length === 1) return { estado: "uno", cliente: clientes[0] };
  return { estado: "ambiguo", candidatos: [...candidatos] };
}

export type ResolucionDeCliente =
  /** Ya existe y su id está al día. No hay nada que arreglar. */
  | { estado: "encontrado"; clientId: string; nombre: string }
  /**
   * Existe, pero guardado bajo una empresa que se fusionó dentro de la que se está dando de alta.
   * `reapuntarEnTx` es obligatorio antes de usarlo: sin eso el registro nuevo de HubSpot nacería
   * colgado de la lápida.
   */
  | { estado: "encontrado-fusionado"; clientId: string; nombre: string; reapunte: Reapunte }
  /** No hay cliente para esta empresa. El llamador lo crea. */
  | { estado: "ninguno" }
  /** Dos clientes reales sobre la misma empresa. No se elige; se corta y se explica. */
  | { estado: "ambiguo"; mensaje: string };

export interface Reapunte {
  clientId: string;
  /** El id muerto que el cliente tenía guardado. */
  lapida: string;
  /** El id vivo al que hay que mover. */
  vigente: string;
  /** TODOS los ids sepultados en la empresa viva, para barrer también las copias del id. */
  absorbidos: string[];
}

const mensajeAmbiguo = (candidatos: readonly CandidatoACliente[]) =>
  `En Nexus hay ${candidatos.length} clientes sobre esta misma empresa de HubSpot: ` +
  `${candidatos.map((c) => `«${c.name}»`).join(" y ")}. Nexus no puede saber a cuál pertenece ` +
  `este proyecto —y elegir mal lo sacaría de la facturación—, así que hay que dejar uno solo ` +
  `antes de seguir: abrí el que sobra y cambiale la empresa, o borralo.`;

/**
 * El cliente de Nexus que corresponde a esta empresa de HubSpot.
 *
 * Dos pasadas, y la segunda solo cuando la primera no encuentra nada: el 99% de las altas son de
 * una empresa que nunca se fusionó, y esas no pagan ninguna llamada extra.
 */
export async function resolverClienteDeLaEmpresa(
  hs: LectorDeHubspot,
  companyId: string,
): Promise<ResolucionDeCliente> {
  const porIdVivo = await prisma.client.findMany({
    where: { hubspotCompanyId: companyId },
    select: { id: true, name: true, kind: true },
  });
  const directo = elegirCandidato(porIdVivo);
  if (directo.estado === "uno") {
    return { estado: "encontrado", clientId: directo.cliente.id, nombre: directo.cliente.name };
  }
  if (directo.estado === "ambiguo") {
    return { estado: "ambiguo", mensaje: mensajeAmbiguo(directo.candidatos) };
  }

  /* Nadie apunta al id vivo. Recién acá vale la pena preguntar si esta empresa se comió a otras
     y algún cliente quedó guardado bajo una de esas. */
  const absorbidos = await idsAbsorbidosPor(hs, companyId);
  if (absorbidos.length === 0) return { estado: "ninguno" };

  const porLapida = await prisma.client.findMany({
    where: { hubspotCompanyId: { in: absorbidos } },
    select: { id: true, name: true, kind: true, hubspotCompanyId: true },
  });
  const viejo = elegirCandidato(porLapida);
  if (viejo.estado === "ninguno") return { estado: "ninguno" };
  if (viejo.estado === "ambiguo") {
    return { estado: "ambiguo", mensaje: mensajeAmbiguo(viejo.candidatos) };
  }

  const elegido = porLapida.find((c) => c.id === viejo.cliente.id)!;
  return {
    estado: "encontrado-fusionado",
    clientId: elegido.id,
    nombre: elegido.name,
    reapunte: armarReapunte(companyId, elegido.id, elegido.hubspotCompanyId!, absorbidos),
  };
}

/**
 * Arma el movimiento. Puro y aparte por una sola razón: la DIRECCIÓN.
 *
 * Los dos ids son intercambiables de tipo —dos strings de dígitos— así que invertirlos compila,
 * pasa la revisión y escribe la lápida encima del id vivo: exactamente el estado que esta tanda
 * vino a matar, y sin que nada avise. Acá la dirección queda en una función que un test puede
 * afirmar entera, en vez de en dos campos de un objeto literal escondido en un `return`.
 *
 * `idGuardado` es el que el cliente TIENE (el muerto). `idVivo` es a dónde va.
 */
export function armarReapunte(
  idVivo: string,
  clientId: string,
  idGuardado: string,
  absorbidos: readonly string[],
): Reapunte {
  return { clientId, lapida: idGuardado, vigente: idVivo, absorbidos: [...absorbidos] };
}

/**
 * Mueve el cliente a la empresa viva. Recibe la transacción del llamador **a propósito**: así el
 * reapunte y lo que lo motivó viven o mueren juntos, y no queda un cliente movido por un alta que
 * después se rechazó.
 *
 * ── LOS DOS FILTROS DEL BARRIDO DE BUSINESS CASES ────────────────────────────
 * `BusinessCase.hubspotCompanyId` es una copia del id que nadie cascadea, así que hay que moverla
 * también o el caso se regenera sin línea de tiempo, en silencio (la lee por asociaciones, que se
 * mudaron). Pero el barrido va acotado por las dos puntas:
 *   · `clientId` — el script equivalente corre sin ese filtro porque imprime el conteo y hay una
 *     persona mirando; acá no hay nadie, y sin el filtro un alta le tocaría los casos a OTRO
 *     cliente que arrastre el mismo id.
 *   · `in: absorbidos` — no basta con la lápida del cliente: una empresa puede haberse comido
 *     varias fichas (Spectrum absorbió seis) y un caso puede estar estampado con cualquiera de
 *     ellas. Moviendo solo una, el invariante seguiría rojo después del arreglo.
 */
export async function reapuntarEnTx(
  tx: Prisma.TransactionClient,
  r: Reapunte,
): Promise<{ businessCases: number }> {
  await tx.client.update({
    where: { id: r.clientId },
    data: { hubspotCompanyId: r.vigente },
  });
  const bcs = await tx.businessCase.updateMany({
    where: { clientId: r.clientId, hubspotCompanyId: { in: r.absorbidos } },
    data: { hubspotCompanyId: r.vigente },
  });
  return { businessCases: bcs.count };
}

/**
 * Lo que queda escrito en el log del servidor. Un reapunte automático es una escritura que nadie
 * pidió explícitamente, así que tiene que ser rastreable: con estos dos ids se revierte a mano, y
 * además HubSpot conserva el mapeo para siempre en `hs_merged_object_ids`.
 */
export function anotarReapunte(r: Reapunte, nombre: string, bcs: number): string {
  return (
    `[fusion] "${nombre}" (${r.clientId}) reapuntado de la empresa fusionada ${r.lapida} ` +
    `a la vigente ${r.vigente}${bcs > 0 ? ` · ${bcs} business case(s) movidos` : ""}`
  );
}
