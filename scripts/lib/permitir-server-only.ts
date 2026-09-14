/**
 * scripts/lib/permitir-server-only.ts
 *
 * Deja que un script de consola importe módulos del servidor que llevan `import "server-only"`
 * (libro-alex-aplicar-server.ts, odoo/servicio.ts, sociedades-servicio.ts…).
 *
 * `server-only` no es un paquete instalado: lo resuelve el bundler de Next para que un componente del
 * navegador no arrastre código del servidor. Fuera de Next, `npx tsx` no lo encuentra y el script muere
 * antes de empezar. Acá se contesta ese import con un módulo vacío, que es exactamente lo que hace Next
 * del lado del servidor.
 *
 * ⚠ Tiene que ser el PRIMER import del script (después de `dotenv/config`): los imports se cargan en
 * orden, y uno que llegue antes al módulo del servidor ya falló.
 * ⛔ Solo para scripts de `scripts/`. En la app no hace falta y no se importa.
 */
import Module from "node:module";

const cargar: unknown = Reflect.get(Module, "_load");
if (typeof cargar === "function") {
  Reflect.set(Module, "_load", function (this: unknown, pedido: unknown, ...resto: unknown[]) {
    if (pedido === "server-only") return {};
    return Reflect.apply(cargar, this, [pedido, ...resto]);
  });
}
