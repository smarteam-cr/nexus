/**
 * lib/memoria — la memoria de la cuenta y del proyecto: UN solo cargador para todos los agentes (DECISIONS «La memoria
 * de la cuenta y del proyecto: un solo cargador»). SERVIDOR.
 *
 * Quien importa de acá tiene que estar declarado en lib/memoria/consumidores.ts (lo vigila consumidores.test.ts).
 */
import "server-only";

export { loEsencialDeLaCuenta, memoriaDeLaCuenta, memoriaDelDocumento, memoriaDelProyecto, queSabeLaIA } from "./cargar";
export { ROTULO_DE_LA_MEMORIA, TOPES_DE_LA_MEMORIA } from "./armar";
export { CONSUMIDORES_DE_LA_MEMORIA, alcanceDeLaPieza, consumidorDeLaMemoria, queCargar, type LectorDeMemoria } from "./consumidores";
export type { AlcanceDeMemoria, LoQueSabeLaIADeLaMemoria, MemoriaArmada, ParteDeLaMemoria, SeccionDeLoEsencial } from "./tipos";
