/**
 * lib/cs/partner-cambio-de-registro.ts
 *
 * Cuándo un cliente pasa de un registro de HubSpot Partner Clients a otro. Puro: sin Prisma ni
 * red, para poder probarlo (lo aplica `syncPartnerClients`, lib/cs/partner-sync.ts).
 *
 * El sync conserva el vínculo existente («FUENTE #0») y `ClientPartnerSnapshot.clientId` es
 * @unique. Cuando la empresa pasa a otro registro en HubSpot, el viejo queda INACTIVO con el
 * cliente y el nuevo, ACTIVO, queda suelto para siempre: cada corrida lo reportaba como «client X
 * ya vinculado al partner record Y». Medido el 2026-10-07 en producción: KAIZEN KAPITAL
 * (432818549540 inactivo → 593040862051 activo) y KJ Publicidad (438943077260 → 440586231970).
 * Éxito del cliente los mostraba «Inactiva en HubSpot», sin MRR, renovaciones ni hubs.
 *
 * El cliente pasa al registro activo SOLO con evidencia positiva:
 *   - el registro activo está suelto y coincide con ese cliente por la MISMA regla con que el sync
 *     vincula (`matchPorEvidencia`: company asociada primero, dominio después);
 *   - las asociaciones de la corrida son confiables (una corrida «partial» no re-matchea nada);
 *   - el registro actual del cliente vino en la corrida y HubSpot lo da por inactivo
 *     (`hs_is_active` = false). Sin ese dato no se mueve;
 *   - hay UN solo registro activo que coincide.
 * Lo que no cumple no se toca, y lo dudoso se reporta (`sinElegir`): dos registros activos para el
 * mismo cliente, o un inactivo con dos o más activos que coinciden. Nexus no elige entre dos
 * portales vivos: lo decide una persona en HubSpot.
 *
 * Nunca deja al cliente sin registro: el sync suelta el viejo y vincula el nuevo en la misma
 * transacción, y si algo cambió entre la lectura y la escritura no hace nada.
 */

/** Lo que el plan necesita de cada registro que trajo la corrida. */
export interface RegistroDePartner {
  id: string;
  /** `hs_is_active`: true, false, o null si HubSpot no lo dice. */
  activo: boolean | null;
  associatedCompanyIds: readonly string[];
  /** Dominio ya normalizado (minúsculas), o null. */
  domain: string | null;
}

export type ViaDelMatch = "company" | "domain";

export interface MatchDelRegistro {
  clientId: string;
  via: ViaDelMatch;
}

/** Un cliente que pasa de un registro inactivo al activo que coincide con él. */
export interface CambioDeRegistro {
  clientId: string;
  /** El registro inactivo que hoy tiene al cliente. */
  desde: string;
  /** El registro activo, suelto, que coincide con el cliente. */
  hacia: string;
  via: ViaDelMatch;
}

export type MotivoSinElegir =
  /** El registro actual también está activo: hay dos portales vivos para el mismo cliente. */
  | "dos-activos"
  /** El actual está inactivo, pero coinciden dos o más registros activos. */
  | "varios-activos"
  /** HubSpot no dice si el registro actual está activo. */
  | "actual-sin-dato";

/** Un cliente con un registro activo suelto que coincide con él, y que no se mueve. */
export interface CambioSinElegir {
  clientId: string;
  motivo: MotivoSinElegir;
  /** El registro que tiene hoy al cliente (se queda con él). */
  actual: string;
  /** Los registros activos sueltos que coinciden con el cliente. */
  candidatos: string[];
}

export interface PlanDeCambios {
  cambios: CambioDeRegistro[];
  sinElegir: CambioSinElegir[];
}

/** `hs_is_active` del crudo del registro: true, false o null (sin dato). Misma lectura que
 *  `leerPartner().activa` (lib/cs/lectura-partner.ts), pero sin confundir «no dice» con «no». */
export function activoEnHubspot(properties: Record<string, unknown>): boolean | null {
  const v = properties["hs_is_active"];
  if (v === null || v === undefined) return null;
  const t = String(v).trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  return null;
}

/**
 * El cliente con el que coincide un registro, por evidencia: la primera company asociada que es
 * de un cliente y, si ninguna, el dominio. Es LA regla del sync (el bucle de `syncPartnerClients`
 * la usa igual): si el plan y el bucle usaran reglas distintas, el plan movería clientes que el
 * bucle no reconoce.
 */
export function matchPorEvidencia(
  registro: Pick<RegistroDePartner, "associatedCompanyIds" | "domain">,
  porCompany: ReadonlyMap<string, string>,
  porDominio: ReadonlyMap<string, string>,
): MatchDelRegistro | null {
  for (const companyId of registro.associatedCompanyIds) {
    const hit = porCompany.get(companyId);
    if (hit) return { clientId: hit, via: "company" };
  }
  if (registro.domain) {
    const hit = porDominio.get(registro.domain);
    if (hit) return { clientId: hit, via: "domain" };
  }
  return null;
}

/**
 * Qué clientes pasan a otro registro en esta corrida, y cuáles se quedan donde están con un aviso.
 *
 * `vinculos` es el estado de la base al empezar la corrida (registro → cliente). Un registro que
 * ya tiene cliente no se le quita a ese cliente (FUENTE #0): solo los registros sueltos pueden
 * ser candidatos.
 */
export function planearCambiosDeRegistro(entrada: {
  registros: readonly RegistroDePartner[];
  vinculos: ReadonlyMap<string, string>;
  porCompany: ReadonlyMap<string, string>;
  porDominio: ReadonlyMap<string, string>;
  /** false = corrida «partial»: las asociaciones no son confiables y no se re-matchea nada. */
  asociacionesConfiables: boolean;
  /**
   * company de HubSpot → la ficha que la tiene, de CUALQUIER tipo (prospectos y aliados incluidos: `porCompany` no los
   * ve). Un candidato con una company de OTRA ficha no se lleva al cliente aunque coincida por dominio: sería el portal
   * de otra empresa que comparte dominio (un grupo, un dominio de agencia), y la ficha mostraría su MRR y su uso. Quitarle
   * a un cliente el registro que ya tiene pide más evidencia que vincular a uno que no tiene ninguno.
   */
  duenoDeLaEmpresa?: ReadonlyMap<string, string>;
}): PlanDeCambios {
  const plan: PlanDeCambios = { cambios: [], sinElegir: [] };
  if (!entrada.asociacionesConfiables) return plan;

  const registroPorId = new Map(entrada.registros.map((r) => [r.id, r]));
  const registroDelCliente = new Map<string, string>();
  for (const [partnerId, clientId] of entrada.vinculos) registroDelCliente.set(clientId, partnerId);

  // Los registros ACTIVOS y sueltos, agrupados por el cliente con el que coinciden.
  const candidatos = new Map<string, Array<{ id: string; via: ViaDelMatch }>>();
  for (const r of entrada.registros) {
    if (r.activo !== true || entrada.vinculos.has(r.id)) continue;
    const m = matchPorEvidencia(r, entrada.porCompany, entrada.porDominio);
    if (!m) continue;
    const deOtraFicha = r.associatedCompanyIds.some((id) => {
      const dueno = entrada.duenoDeLaEmpresa?.get(id);
      return dueno !== undefined && dueno !== m.clientId;
    });
    if (deOtraFicha) continue;
    const lista = candidatos.get(m.clientId) ?? [];
    lista.push({ id: r.id, via: m.via });
    candidatos.set(m.clientId, lista);
  }

  for (const clientId of [...candidatos.keys()].sort()) {
    const lista = [...(candidatos.get(clientId) ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const actualId = registroDelCliente.get(clientId);
    // Cliente sin registro: lo vincula el bucle del sync, como siempre.
    if (!actualId) continue;
    const actual = registroPorId.get(actualId);
    // El registro actual no vino en la corrida (lo borraron en HubSpot): lo suelta la
    // reconciliación del sync y el activo se vincula en la corrida siguiente.
    if (!actual) continue;
    const ids = lista.map((c) => c.id);
    if (actual.activo === true) {
      plan.sinElegir.push({ clientId, motivo: "dos-activos", actual: actualId, candidatos: ids });
    } else if (actual.activo === null) {
      plan.sinElegir.push({ clientId, motivo: "actual-sin-dato", actual: actualId, candidatos: ids });
    } else if (lista.length > 1) {
      plan.sinElegir.push({ clientId, motivo: "varios-activos", actual: actualId, candidatos: ids });
    } else {
      plan.cambios.push({ clientId, desde: actualId, hacia: lista[0].id, via: lista[0].via });
    }
  }
  return plan;
}

/** La línea que deja el sync en sus errores para un cliente que no se movió: lo mira una persona. */
export function mensajeSinElegir(s: CambioSinElegir, nombreDelCliente: string | null): string {
  const quien = nombreDelCliente ? `${nombreDelCliente} (${s.clientId})` : `el cliente ${s.clientId}`;
  const otros = s.candidatos.join(", ");
  switch (s.motivo) {
    case "dos-activos":
      return `${quien} tiene dos registros activos en Partner Clients (${s.actual} y ${otros}): no se elige, sigue con ${s.actual}.`;
    case "varios-activos":
      return `${quien} está en el registro inactivo ${s.actual} y coinciden ${s.candidatos.length} registros activos (${otros}): no se elige, sigue con ${s.actual}.`;
    case "actual-sin-dato":
      return `${quien} está en el registro ${s.actual}, que no dice si está activo, y coincide el registro activo ${otros}: no se cambia.`;
  }
}
