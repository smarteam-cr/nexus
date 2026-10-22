/**
 * scripts/hubspot-propiedades-de-comisiones.ts — las dos propiedades de trato que necesita el modelo de comisiones
 * (2026-10-21, DECISIONS «El modelo de comisiones cerrado con Marco»):
 *   · `motion_comercial` («Motion comercial», ya existía con Nuevo negocio · Expansión · Recuperación): se le suma la
 *     opción «Renovación». No se toca ninguna opción que ya está.
 *   · `venta_compartida_con` («Venta compartida con», nueva): un usuario de HubSpot. La pone quien crea el negocio
 *     antes de la firma; Nexus toma el valor que tenía al entrar a ganado.
 *
 * Escribe en HubSpot (el esquema de tratos), no en la base. Dry-run por default; aplicar:
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/hubspot-propiedades-de-comisiones.ts --apply
 * Re-ejecutable: lo que ya está no se vuelve a crear.
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { PROPIEDAD_COMPARTIDA, PROPIEDAD_TIPO_DE_NEGOCIO, VALOR_RENOVACION } from "@/lib/ventas/tipo-de-negocio";

// No escribe la base (nada que respaldar): escribe el esquema de tratos de HubSpot. El guard igual exige ALLOW_PROD_WRITE.
const APPLY = resolverApply({ tablas: [] });

interface Opcion {
  label: string;
  value: string;
  displayOrder?: number;
  hidden?: boolean;
  description?: string;
}

async function main() {
  const hs = await getSystemHubspotClient();

  // ── 1. «Renovación» en motion_comercial ──
  const r = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/deals/${PROPIEDAD_TIPO_DE_NEGOCIO}` });
  if (!r.ok) throw new Error(`No se pudo leer ${PROPIEDAD_TIPO_DE_NEGOCIO}: HTTP ${r.status}`);
  const prop = (await r.json()) as { options?: Opcion[]; description?: string };
  const opciones = prop.options ?? [];
  console.log(`${PROPIEDAD_TIPO_DE_NEGOCIO}: ${opciones.map((o) => `${o.label} (${o.value})`).join(" · ")}`);
  if (opciones.some((o) => o.value === VALOR_RENOVACION)) {
    console.log("  ✓ ya tiene «Renovación»");
  } else {
    const nuevas: Opcion[] = [
      ...opciones.map((o, i) => ({ label: o.label, value: o.value, displayOrder: o.displayOrder ?? i, hidden: o.hidden ?? false, description: o.description })),
      { label: "Renovación", value: VALOR_RENOVACION, displayOrder: opciones.length, hidden: false },
    ];
    console.log("  → suma la opción «Renovación» (renovacion)");
    if (APPLY) {
      const w = await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/properties/deals/${PROPIEDAD_TIPO_DE_NEGOCIO}`,
        body: { options: nuevas, description: "Distingue si el negocio es nuevo negocio, expansión, recuperación o renovación. Lo leen las comisiones de Nexus." },
      });
      if (!w.ok) throw new Error(`No se pudo sumar la opción: HTTP ${w.status} ${(await w.text()).slice(0, 300)}`);
      console.log("  ✓ sumada");
    }
  }

  // ── 2. «Venta compartida con» ──
  const c = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/deals/${PROPIEDAD_COMPARTIDA}` });
  if (c.ok) {
    console.log(`${PROPIEDAD_COMPARTIDA}: ✓ ya existe`);
  } else if (c.status !== 404) {
    throw new Error(`No se pudo leer ${PROPIEDAD_COMPARTIDA}: HTTP ${c.status}`);
  } else {
    console.log(`${PROPIEDAD_COMPARTIDA}: → se crea («Venta compartida con», un usuario de HubSpot)`);
    if (APPLY) {
      const w = await hs.apiRequest({
        method: "POST",
        path: "/crm/v3/properties/deals",
        body: {
          name: PROPIEDAD_COMPARTIDA,
          label: "Venta compartida con",
          description:
            "Quién de Customer Success (o de Ventas) comparte esta venta. Se marca al crear el negocio, antes de la firma: después de ganado ya no cuenta. Cada uno se lleva la mitad de la comisión y la venta cuenta completa en las dos metas.",
          groupName: "deal_information",
          type: "enumeration",
          fieldType: "select",
          referencedObjectType: "OWNER",
          externalOptions: true,
        },
      });
      if (!w.ok) throw new Error(`No se pudo crear la propiedad: HTTP ${w.status} ${(await w.text()).slice(0, 300)}`);
      console.log("  ✓ creada");
    }
  }

  if (!APPLY) console.log("\n(dry-run: no se escribió nada en HubSpot. Para aplicar: ALLOW_PROD_WRITE=1 … --apply)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
