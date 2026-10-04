/**
 * /finanzas/conciliacion — lo que no cuadra con Odoo y Mercury, en una sola lista (rediseño de Finanzas, 2026-10-03).
 *
 * Mismo gate que Cobranza (`cobranza.read`); el enforcement real vive en las rutas de Odoo y Mercury que la pantalla usa.
 * Los números con que abren las pestañas se leen acá, en el servidor; después los mueve la propia pantalla.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { vistaFinanzasDe } from "@/lib/finanzas/vista";
import { nombreDeQuienSupervisa } from "@/lib/finanzas/vista-server";
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { ultimaCorrida } from "@/lib/cobranza/odoo/sync";
import { ultimaCorridaMercury } from "@/lib/cobranza/mercury/sync";
import { horaDeCostaRica } from "@/lib/cobranza/odoo/espejo";
import { filasPorQuien, juntarDiferencias } from "@/lib/finanzas/conciliacion";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ConciliacionClient from "@/components/finanzas/ConciliacionClient";

export const dynamic = "force-dynamic";

export default async function ConciliacionPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const vista = vistaFinanzasDe(ctx.teamMember);
  const [puedeEditar, odoo, mercury, empOdoo, empMercury, copiaOdoo, copiaMercury, supervisor] = await Promise.all([
    can(ctx.teamMember, "cobranza", "write"),
    cargarDiferencias(),
    cargarDiferenciasMercury(),
    contarEmparejado(),
    cargarEmparejadoMercury().then((e) => e.conteos),
    ultimaCorrida(),
    ultimaCorridaMercury(),
    nombreDeQuienSupervisa(),
  ]);
  const porQuien = filasPorQuien(juntarDiferencias(odoo.inconsistencias, mercury.inconsistencias));
  return (
    <div className={SHELL_DEFAULT}>
      <ConciliacionClient
        vista={vista}
        supervisor={supervisor}
        puedeEditar={puedeEditar}
        copias={{
          odoo: copiaOdoo?.ultimaOkEn ? horaDeCostaRica(copiaOdoo.ultimaOkEn) : null,
          mercury: copiaMercury?.ultimaOkEn ? horaDeCostaRica(copiaMercury.ultimaOkEn) : null,
        }}
        conteos={{
          noCuadra: vista === "REGISTRA" ? porQuien.mias : porQuien.mias + porQuien.decisiones,
          porEmparejarOdoo: empOdoo.porEmparejar,
          porEmparejarMercury: empMercury.sinEmparejar,
        }}
      />
    </div>
  );
}
