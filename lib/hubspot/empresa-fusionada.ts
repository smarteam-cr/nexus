/**
 * lib/hubspot/empresa-fusionada.ts — DETECTAR que la empresa que Nexus guarda ya no existe
 * porque se fusionó con otra.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Cuando dos empresas se fusionan en HubSpot, la perdedora no desaparece del todo: su id sigue
 * respondiendo. `GET /companies/{idViejo}` devuelve **200** con los datos del sobreviviente.
 * Nombre, dominio, fecha de creación: todo correcto. Nada falla.
 *
 * Lo único que se mudó son las ASOCIACIONES. Y como Nexus descubre los proyectos de un cliente
 * preguntando "¿qué proyectos cuelgan de esta empresa?", pregunta sobre una lápida y recibe
 * cero. El síntoma es "creé un proyecto en HubSpot y no aparece", y el mensaje decía
 * literalmente que la empresa no tenía proyectos — cierto, y por eso mismo inútil: manda a
 * buscar el problema exactamente donde no está.
 *
 * Encontrado en vivo el 2026-08-03 (Spectrum). Uno solo entre 158 clientes — pero silencioso:
 * nadie lo iba a notar hasta que faltara algo, y ahí la causa ya no se parece al efecto.
 *
 * ── CÓMO SE DETECTA ──────────────────────────────────────────────────────────
 * HubSpot no devuelve un 404 ni un campo "fusionada". Lo que sí hace es **firmar la respuesta
 * con el id del sobreviviente**: se pide `52577965185` y el cuerpo trae `id: "57140844832"`.
 * Esa discrepancia es la señal, y es la única que hay.
 *
 * ⚠ NO se usa `HTTP 404` como señal: un id borrado de verdad, uno de otro portal y uno mal
 * tipeado dan todos 404, y ninguno de esos tres es una fusión. Confundirlos haría que el aviso
 * mande a "seguir la fusión" en casos donde no hay nada que seguir.
 */

/**
 * Lo ÚNICO que este módulo necesita de HubSpot. Se declara acá en vez de importar el `Client`
 * del SDK para que los tests puedan pasar un doble sin levantar medio cliente — la lógica que
 * importa (qué cuenta como fusión, cómo se lotea) es de este archivo, no del SDK.
 */
export interface LectorDeHubspot {
  apiRequest(opts: {
    method: string;
    path: string;
    body?: unknown;
  }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
}

/** Qué le pasó a la empresa que Nexus tiene guardada. */
export type VeredictoDeFusion =
  | { estado: "vigente" }
  | { estado: "fusionada"; idSobreviviente: string }
  /** No se pudo saber (red, permisos, id de otro portal, id inexistente). NO es una fusión. */
  | { estado: "ilegible"; motivo: string };

/**
 * Mensaje para la persona. Dice QUÉ pasó y QUÉ hacer — no repite ids sueltos, que es lo que
 * hacía el mensaje viejo y lo que lo volvía inaccionable.
 */
export function explicarFusion(idGuardado: string, idSobreviviente: string): string {
  return (
    `Esta empresa se fusionó con otra en HubSpot: Nexus todavía apunta a la ficha vieja ` +
    `(${idGuardado}) y los proyectos ya viven en la nueva (${idSobreviviente}). Por eso no ` +
    `aparece ninguno. Se corrige con: npx tsx scripts/reapuntar-empresa-fusionada.ts --apply`
  );
}

/**
 * ¿La empresa que Nexus guarda sigue siendo ella misma?
 *
 * Una sola llamada, la más barata posible (`properties=name`): esto corre por cada cliente en
 * el invariante, así que pedir el registro completo multiplicaría el costo por nada.
 */
export async function detectarFusion(
  hs: LectorDeHubspot,
  idGuardado: string,
): Promise<VeredictoDeFusion> {
  try {
    const r = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${idGuardado}?properties=name`,
    });
    if (!r.ok) return { estado: "ilegible", motivo: `HTTP ${r.status}` };

    const d = (await r.json()) as { id?: string };
    if (!d.id) return { estado: "ilegible", motivo: "la respuesta no trae id" };

    /* La comparación es de STRINGS y a propósito: los ids de HubSpot son numéricos pero se
       manejan como texto en todo el sistema (caben más de 2^53). Compararlos como números
       perdería precisión justo en los ids largos, que son los nuevos. */
    return d.id === idGuardado
      ? { estado: "vigente" }
      : { estado: "fusionada", idSobreviviente: d.id };
  } catch (e) {
    return { estado: "ilegible", motivo: e instanceof Error ? e.message : "error desconocido" };
  }
}

// ── El sentido INVERSO: quiénes se fusionaron DENTRO de esta empresa ────────

/**
 * La propiedad de HubSpot que guarda el historial de fusión de una company: los ids de las
 * fichas que se absorbieron, separados por `;`. La trae **cualquiera** de las dos puntas —se le
 * pregunte al sobreviviente o a una lápida, la respuesta es la misma lista— porque el registro
 * que responde es siempre el sobreviviente.
 */
const PROP_FUSIONADAS = "hs_merged_object_ids";

/**
 * Parte la lista cruda. Puro y aparte porque el formato es un dato MEDIDO, no una suposición, y
 * un dato medido merece una tabla que se pueda escribir entera en un test.
 *
 * Medido contra el portal real el 2026-08-03 (Spectrum, id 57140844832):
 *   "52577965185;55883608421;55881343889;57173874205;55868903093;57173936535"
 * Seis ids, sin espacios, y **sin incluirse a sí misma**. Aun así se filtra el id propio: que hoy
 * no venga no es una promesa de HubSpot, y devolverlo haría que el buscador se encuentre a sí
 * mismo y crea que hay dos clientes para una empresa.
 */
export function parsearIdsFusionados(raw: string | null | undefined, idPropio: string): string[] {
  if (!raw) return [];
  const vistos = new Set<string>();
  for (const parte of String(raw).split(";")) {
    const id = parte.trim();
    if (id && id !== idPropio) vistos.add(id);
  }
  return [...vistos];
}

/**
 * ¿Qué empresas se fusionaron dentro de ésta?
 *
 * Es la pregunta inversa a `detectarFusion`, y es la que hace falta cuando lo que se tiene es el
 * id VIVO —el que sale de buscar por dominio— y hay que averiguar si algún cliente de Nexus
 * quedó apuntando a una de sus lápidas. Ir al revés (revisar los 158 ids guardados uno por uno)
 * daría la misma respuesta pagando cien veces más.
 *
 * Devuelve `[]` cuando no hay fusiones **y también cuando no se pudo saber**: acá "no sé" y "no
 * hay" se tratan igual a propósito. El peor caso de equivocarse es caer en el comportamiento de
 * antes —crear un cliente nuevo—, mientras que cortar el alta por un 429 de HubSpot rompería un
 * camino que hoy funciona.
 */
export async function idsAbsorbidosPor(
  hs: LectorDeHubspot,
  idSobreviviente: string,
): Promise<string[]> {
  try {
    const r = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${idSobreviviente}?properties=${PROP_FUSIONADAS}`,
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { properties?: Record<string, string | null> };
    return parsearIdsFusionados(d.properties?.[PROP_FUSIONADAS], idSobreviviente);
  } catch {
    return [];
  }
}

// ── Revisar MUCHAS de una ───────────────────────────────────────────────────

/** Cuántos ids acepta `batch/read` de una. Límite de HubSpot. */
const POR_LOTE = 100;

/**
 * El mismo veredicto para una lista entera, sin pagar una llamada por cliente.
 *
 * ── POR QUÉ EN DOS PASOS ─────────────────────────────────────────────────────
 * `batch/read` responde con los registros VIVOS: si se piden 100 ids y uno estaba fusionado,
 * vuelven 100 resultados pero uno con el id del sobreviviente en lugar del pedido. O sea que
 * el lote dice PERFECTAMENTE **quiénes** son sospechosos —los pedidos que no volvieron con su
 * propio id— pero NO alcanza para emparejar cada uno con su sobreviviente: si hubiera dos
 * fusiones en el mismo lote, habría dos ids nuevos y ninguna forma de saber cuál es de cuál.
 *
 * Por eso el segundo paso: una llamada individual SOLO por sospechoso, que sí trae el par.
 * Los sospechosos son rarísimos (uno en 158 el día que se escribió esto), así que el costo
 * real es 2 llamadas para todo el portal en vez de 158. Verificado contra producción.
 *
 * ── Y POR QUÉ NO SE DA POR FUSIONADO AL QUE NO VOLVIÓ ────────────────────────
 * Un id puede no volver por tres razones que no son una fusión: lo borraron, es de otro portal,
 * o está mal tipeado. El segundo paso las separa —404 es "ilegible", no "fusionada"— y esa
 * distinción es la que evita mandar a alguien a "seguir la fusión" cuando no hay ninguna.
 */
export async function detectarFusionesEnLote(
  hs: LectorDeHubspot,
  ids: readonly string[],
): Promise<Map<string, VeredictoDeFusion>> {
  const out = new Map<string, VeredictoDeFusion>();
  const unicos = [...new Set(ids)];

  for (let i = 0; i < unicos.length; i += POR_LOTE) {
    const lote = unicos.slice(i, i + POR_LOTE);
    let devueltos: Set<string>;
    try {
      const r = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/objects/companies/batch/read",
        body: { properties: ["name"], inputs: lote.map((id) => ({ id })) },
      });
      if (!r.ok) {
        /* El lote entero queda sin verificar. Se marca ilegible y se sigue: un 429 o un corte
           de red no puede hacer que el portal parezca fusionado. */
        for (const id of lote) out.set(id, { estado: "ilegible", motivo: `batch HTTP ${r.status}` });
        continue;
      }
      const d = (await r.json()) as { results?: { id?: string }[] };
      devueltos = new Set((d.results ?? []).map((x) => x.id).filter((x): x is string => !!x));
    } catch (e) {
      for (const id of lote) {
        out.set(id, { estado: "ilegible", motivo: e instanceof Error ? e.message : "error" });
      }
      continue;
    }

    for (const id of lote) {
      // Volvió con su propio id → sigue siendo ella misma. Es el 99,9% de los casos.
      if (devueltos.has(id)) out.set(id, { estado: "vigente" });
    }
    const sospechosos = lote.filter((id) => !devueltos.has(id));
    for (const id of sospechosos) out.set(id, await detectarFusion(hs, id));
  }

  return out;
}
