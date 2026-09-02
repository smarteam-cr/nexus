/**
 * /settings/odoo — el estado de la conexión con el ERP. Solo lectura, SOLO SUPER_ADMIN.
 *
 * Mismo gate que `/settings/gasto-ia`: el redirect corta ANTES de la query.
 *
 * ── QUÉ CONVIERTE EN DECISIÓN ───────────────────────────────────────────────
 * El sync escribe una fila por corrida en `SyncOdooCorrida` desde el 2026-09-02. Sin una
 * pantalla, ese dato existe y nadie lo mira — que es exactamente el problema que la tabla
 * vino a resolver: hoy, cuando un job se rompe, el error solo va al log del contenedor y
 * nadie puede decir «viene fallando hace tres días».
 *
 * ⚠ Es SOLO LECTURA a propósito. Las dos banderas viven en el `.env` del servidor, no en la
 * base: un interruptor en pantalla daría a entender que se apaga desde acá, y después de un
 * redeploy volvería al valor del entorno sin que nadie entienda por qué.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { ODOO_DEFAULTS } from "@/lib/cobranza/odoo/transporte-xmlrpc";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—";

export default async function SettingsOdooPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const [corridas, facturas, vinculos, cuentas] = await Promise.all([
    prisma.syncOdooCorrida.findMany({ orderBy: { iniciadaEn: "desc" }, take: 20 }),
    prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
    prisma.odooPartnerVinculo.count({ where: { cuentaId: { not: null } } }),
    prisma.cuentaFinanciera.count(),
  ]);

  const hayPassword = !!process.env.ODOO_PASSWORD;
  const syncEncendido = hayPassword && process.env.ODOO_SYNC_ENABLED !== "0";
  const promocionEncendida = process.env.ODOO_PROMOCION_VERDE === "1";
  const ultima = corridas[0] ?? null;
  const fallidas = corridas.filter((c) => c.terminadaEn === null || !c.ok);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Odoo"
        description="De dónde salen las facturas que Nexus muestra al lado de cada cobro, y si el espejo está al día."
      />

      {!hayPassword && (
        <Alert variant="danger" title="Falta la contraseña del ERP">
          Sin <code>ODOO_PASSWORD</code> en el entorno del servidor el sync no corre, y ni siquiera lo intenta: un
          intento en vano cuenta para el bloqueo por IP de Odoo.
        </Alert>
      )}

      {!promocionEncendida && (
        <Alert variant="info" title="La promoción a verde está apagada">
          Nexus muestra lo que Odoo dice de cada factura, pero no propone pasar ningún cobro a verde. Está así porque
          188 facturas figuran en <code>in_payment</code>, un estado que Odoo 17 Community nunca asigna — hay que
          confirmar de dónde sale antes de encenderlo con <code>ODOO_PROMOCION_VERDE=1</code>. Encenderlo a ciegas
          pondría esos 188 cobros en verde de golpe, y el verde acá es plata que entró.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-fg-muted">Facturas espejadas</p>
          <p className="mt-1 text-3xl font-bold text-fg tabular-nums">{facturas}</p>
          <p className="mt-1 text-sm text-fg-muted">Solo lectura. Nexus nunca escribe en Odoo.</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-fg-muted">Cuentas emparejadas</p>
          <p className="mt-1 text-3xl font-bold text-fg tabular-nums">
            {vinculos}
            <span className="text-lg font-normal text-fg-muted"> / {cuentas}</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {/* Es el cuello de botella real: sin emparejar, las facturas existen pero no se
                pueden poner al lado de ningún cobro. */}
            Las facturas sin emparejar no aparecen en ningún cronograma.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-fg-muted">Última corrida</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {ultima ? (
              <span className={ultima.ok ? "text-emerald-600" : "text-red-600"}>{ultima.ok ? "OK" : "FALLÓ"}</span>
            ) : (
              <span className="text-fg-muted">nunca</span>
            )}
          </p>
          <p className="mt-1 text-sm text-fg-muted">{ultima ? fecha(ultima.iniciadaEn) : "El sync no corrió todavía."}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-fg">Conexión</h2>
        <dl className="mt-2 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Fila k="Servidor" v={process.env.ODOO_HOST?.trim() || ODOO_DEFAULTS.host} />
          <Fila k="Base" v={process.env.ODOO_DB?.trim() || ODOO_DEFAULTS.db} />
          <Fila k="Usuario" v={process.env.ODOO_LOGIN?.trim() || ODOO_DEFAULTS.login} />
          <Fila k="Protocolo" v="XML-RPC / JSON-RPC" />
          <Fila k="Sync diario" v={syncEncendido ? "encendido" : "apagado"} />
          <Fila k="Promoción a verde" v={promocionEncendida ? "encendida" : "apagada"} />
        </dl>
        <p className="mt-3 text-xs text-fg-muted">
          {/* Se dice explícitamente para que nadie busque un interruptor que no existe. */}
          Las dos banderas se cambian en el <code>.env</code> del servidor, no desde acá. El módulo REST del ERP quedó
          descartado: autentica pero devuelve 403 en los nueve modelos porque el usuario no puede leer{" "}
          <code>ir.model</code>.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-fg">Últimas corridas</h2>
        {corridas.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Todavía no corrió ninguna.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="py-1 pr-3 font-medium">Cuándo</th>
                  <th className="py-1 pr-3 font-medium">Quién</th>
                  <th className="py-1 pr-3 text-right font-medium">Vistas</th>
                  <th className="py-1 pr-3 text-right font-medium">Nuevas</th>
                  <th className="py-1 pr-3 text-right font-medium">Cambios</th>
                  <th className="py-1 pr-3 text-right font-medium">Desap.</th>
                  <th className="py-1 pr-3 text-right font-medium">Duración</th>
                  <th className="py-1 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="py-1 pr-3 text-fg-secondary">{fecha(c.iniciadaEn)}</td>
                    <td className="py-1 pr-3 text-fg-muted">{c.disparadaPor}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{c.facturasVistas}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{c.creadas}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{c.actualizadas}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{c.desaparecidas}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-fg-muted">
                      {c.duracionMs === null ? "—" : `${(c.duracionMs / 1000).toFixed(1)} s`}
                    </td>
                    <td className="py-1">
                      {/* ⚠ Una corrida sin terminar no es «ok=false»: es una que se murió a
                          mitad, y decirlo así es la diferencia entre un fallo visible y uno
                          que parece estar corriendo todavía. Lo mismo vigila INV24. */}
                      {c.terminadaEn === null ? (
                        <span className="text-amber-600">sin terminar</span>
                      ) : c.ok ? (
                        <span className="text-emerald-600">ok</span>
                      ) : (
                        <span className="text-red-600">{c.parcial ? "parcial" : "falló"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ⚠ El texto del fallo va en su propio bloque y NO como tooltip de la celda roja: el
          punto entero de guardar cada corrida es poder decir «viene fallando hace tres días»,
          y eso no se lee pasando el mouse por encima de siete filas. */}
      {fallidas.length > 0 && (
        <Alert variant="danger" title={`${fallidas.length} corrida(s) sin completar`}>
          <ul className="space-y-1">
            {fallidas.map((c) => (
              <li key={c.id}>
                <span className="text-fg-secondary">{fecha(c.iniciadaEn)}</span> ·{" "}
                {c.error ?? (c.terminadaEn === null ? "quedó abierta: el proceso se murió a mitad" : "sin detalle")}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1 last:border-0">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="text-fg-secondary">{v}</dd>
    </div>
  );
}
