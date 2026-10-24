/**
 * lib/hubspot/sdk.d.ts — el tipo del cliente de HubSpot que ve Nexus: solo lo que usa.
 *
 * ── POR QUÉ NO SE IMPORTA `Client` DE "@hubspot/api-client" ──────────────────────────
 * El 2026-10-16 el type-check pedía 4,1 GB y el build del VPS murió por memoria en «Running
 * TypeScript». 2.405 de los 8.799 archivos del programa eran del SDK: `lib/src/client.d.ts`
 * importa las once «discoveries» (crm, cms, marketing, automation…) y cada una su código generado,
 * así que nombrar `Client` desde la raíz, aunque sea con `import type`, carga el SDK entero.
 * Mismo problema que googleapis el 2026-09-26 (lib/google/googleapis-sin-raiz.test.ts).
 *
 * ── CÓMO ─────────────────────────────────────────────────────────────────────────────
 * - El VALOR sale de sdk.js, que reexporta el `Client` de la raíz: en tiempo de ejecución es la
 *   misma clase de siempre (el bundler la sigue tratando como externa, ver next.config.ts).
 * - El TIPO es este archivo. TypeScript resuelve `./sdk` a sdk.d.ts antes que a sdk.js, así que
 *   nunca abre client.d.ts. Cada API declarada es la clase REAL del SDK, importada por su ruta
 *   profunda: los tipos de sus respuestas son los de HubSpot, no una copia.
 * - Casi todo Nexus habla con HubSpot por `apiRequest`. Si necesitas otra API tipada del SDK,
 *   agrégala abajo con su ruta profunda (`lib/src/discovery/<grupo>/<api>/<Api>Discovery`), nunca
 *   `CrmDiscovery` ni otra discovery de grupo: arrastran todas las de adentro.
 *
 * Lo vigila lib/hubspot/api-client-sin-raiz.test.ts: que nadie importe la raíz, que el SDK que ve
 * tsc siga siendo chico y que este tipo calce con el `Client` real.
 */
import type { Response } from "node-fetch";
import type IConfiguration from "@hubspot/api-client/lib/src/configuration/IConfiguration";
import type { IHttpOptions } from "@hubspot/api-client/lib/src/services/http/IHttpOptions";
import type CompaniesDiscovery from "@hubspot/api-client/lib/src/discovery/crm/companies/CompaniesDiscovery";
import type PipelinesDiscovery from "@hubspot/api-client/lib/src/discovery/crm/pipelines/PipelinesDiscovery";
import type PropertiesDiscovery from "@hubspot/api-client/lib/src/discovery/crm/properties/PropertiesDiscovery";
import type SchemasDiscovery from "@hubspot/api-client/lib/src/discovery/crm/schemas/SchemasDiscovery";
import type UsersDiscovery from "@hubspot/api-client/lib/src/discovery/settings/users/UsersDiscovery";

/** Las APIs de `client.crm` que Nexus usa. */
export interface CrmDeNexus {
  readonly companies: CompaniesDiscovery;
  readonly pipelines: PipelinesDiscovery;
  readonly properties: PropertiesDiscovery;
  readonly schemas: SchemasDiscovery;
}

/** Las APIs de `client.settings` que Nexus usa. */
export interface SettingsDeNexus {
  readonly users: UsersDiscovery;
}

export declare class Client {
  constructor(config?: IConfiguration);
  get crm(): CrmDeNexus;
  get settings(): SettingsDeNexus;
  apiRequest(opts?: IHttpOptions): Promise<Response>;
  /** Cambia el token de las APIs tipadas (lo usa el transporte de client.ts al renovarlo). */
  setAccessToken(token: string): void;
}
