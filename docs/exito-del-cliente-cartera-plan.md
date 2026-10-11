# Éxito del cliente para administrar la cartera — plan (2026-10-07)

> Pedido de Elías: que Éxito del cliente le sirva a Alexander Vanegas (CSL) para administrar la cartera de
> Smarteam. Siete puntos: clasificación de cada cuenta, filtros y vistas guardadas, vista por CSE, pase de
> cuenta, salud más fiel, «bloqueado por el cliente» y los resultados y retos de la empresa.

> **Estado (2026-10-09):** las seis entregas están en el código, sin commit. Detalle de lo que quedó en
> DECISIONS §La cartera de la CSL. Falta en producción: los dos SQL, el deploy y, después, la migración de HubSpot.

## Decisiones de Elías (2026-10-07)

1. **HubSpot: migrar.** Nexus pasa a leer «CSE Encargado» en los proyectos; se copia ahí el CSE que hoy está
   en «CSL Encargado», y recién después «CSL Encargado» = la CSL en proyectos, empresa y contactos.
2. **Corregir el color: solo CSL y super admin**, desde Éxito del cliente. El CSE ve la corrección, no la hace.
3. **Una corrección vale 30 días**, o menos si aparece una señal nueva más grave. Al vencer, avisa a quien la puso.
4. **Las vistas guardadas son compartidas** entre la CSL y los super admin; dicen quién las creó y solo quien
   las creó las borra.

## Lo que ya hay (medido el 2026-10-07, solo lectura)

- **Reasignar el CSE de una cuenta existe** (`app/api/clients/[id]/cse-encargado/route.ts`, permiso
  `proyectos.reasignarEncargado`: CSL y super admin): escribe «CSL Encargado» en los proyectos de
  implementación y avisa en «Para ti». No escribe empresa ni contactos, y el aviso no trae resumen.
- **HubSpot**:
  - Proyectos: «CSL Encargado» guarda al CSE en 103 de 111 y es lo que lee el espejo para decidir quién ve
    cada cuenta (`sync-projects.ts`). «CSE Encargado» existe y está vacío en los 111.
  - Empresas: «CSL Encargado» en 33, «CSE Encargado» en 0. Contactos: 372 con los dos.
  - Los dos campos son de tipo propietario (owner) en los tres objetos.
  - Retos, resultados que persigue y dolor principal ya existen en la empresa (`nexus_retos_estrategicos`,
    `nexus_resultados_que_persigue`, `nexus_dolor_principal`) y Nexus los escribe al confirmar la ficha
    (`lib/clients/ficha.ts`). No los lee de vuelta.
- **kölbi**: sus 4 alertas abiertas no son quejas (licencias sin usar, contacto frío, dependencia, bloqueo).
  Dos proyectos dicen «Atraso por cliente» en el motivo de bloqueo con el estado en blanco o «on track», así
  que Nexus los lee al día.
- **Motivos de bloqueo en uso**: Atraso por cliente (15), Atraso por Smarteam (13), Cliente no responde (4),
  Proveedor (3), Cliente pidió pausa (1).
- **Correos**: la preventa ya los lee con el permiso opcional `sales-email-read` (`HUBSPOT_SCOPES_OPCIONALES_EXTRA`).

## Entregas (cada una se sube sola)

### 1 · Clasificación de cada cuenta

- **Datos**: tabla `ClasificacionDeCuenta` (una fila por cliente; SQL aditivo con RLS y RESTRICTIVE): el valor
  confirmado de relación, potencial y momento, quién y cuándo, y lo descartado (valor + la razón que lo
  propuso). Texto y no enum: sumar un valor no pide `ALTER TYPE`.
- **Valores** (los de Elías + los que sumo, en *cursiva*):
  - Tipo de relación: proyecto en curso · servicio recurrente · *solo licencias* (la gestionamos en HubSpot sin
    servicio de Smarteam) · sin servicio activo · excliente. Con proyecto y servicio recurrente a la vez, manda
    «servicio recurrente» (el proyecto lo dice el momento).
  - Potencial: alto · medio · bajo · *sin estimar* (no es lo mismo que bajo).
  - CSE responsable: el de HubSpot (no se propone: se cambia con el pase de cuenta).
  - Momento: *arranque* (antes del kickoff) · implementación · adopción · recurrente · renovación cercana ·
    *expansión* (oportunidad o trato abierto) · *salida* (cancelación registrada o no renueva).
- **Nexus propone con reglas, sin IA** (`lib/cs/clasificacion.ts`, puro, con pruebas): proyectos activos y su
  etapa, servicios de Cobranza, Partner (relación gestionada, renovación, cancelación), tratos abiertos y TAM.
  La propuesta se calcula al leer: si la cuenta cambia, cambia la propuesta. Si difiere de lo confirmado, se ve
  en azul con «Usar» y «Descartar»; lo descartado no vuelve hasta que cambie la razón. ⚠ Los cortes del
  potencial (por TAM y oportunidades) son un supuesto a calibrar con Alex.
- **Pantalla** (hecho el 2026-10-07): pestaña «Cartera» (reemplaza a «Toda la cartera») con relación, momento y
  potencial editables y la franja «Usar las de N cuentas»; sección «Clasificación» en el panel de la cuenta. «A
  quién llamar» no suma columnas: ya mide 1040 px. Confirma o cambia la CSL o un super admin. Sumé además el momento
  «sin actividad». Detalle en DECISIONS §La clasificación de cada cuenta.

### 2 · Salud más fiel

- **Quejas y retrasos de reuniones y correos pesan.** El vigía levanta dos clases de alerta, «Queja del
  cliente» (valor nuevo de `CsAlertCategory`, por el camino de `ALTER TYPE` del guard) y «Retraso» (la de
  siempre), con la frase literal verificada contra la reunión o el correo, como en la preventa. Solo esas dos
  pintan, y con fuente: amarillo; rojo si es alta o llega con una renovación a 90 días. Cerrar la alerta deja
  de pintar. Revisa la regla del 2026-10-07 («las alertas del agente no pintan»): siguen sin pintar las demás.
- **Correos**: los del cliente con la empresa en HubSpot, con `sales-email-read`. Sin el permiso, solo
  reuniones, y la pantalla lo dice.
- **El motivo de bloqueo cuenta aunque el estado no diga bloqueado** («Atraso por cliente / por Smarteam»):
  amarillo con su porqué. ⚠ Si el motivo quedó viejo en HubSpot, se ve; se limpia allá o Alex corrige el color.
- **Corrección manual** (CSL y super admin): color + razón corta; vale 30 días o hasta una señal nueva más
  grave (una razón roja que no estaba al corregir); al vencer, aviso a quien la puso. Se ve en la lista, en la
  cuenta y en la ficha del cliente: «Corregido por Alex: … · Nexus diría: rojo». Historial en
  `CorreccionDeSalud` (append-only).
- **En espera del cliente**: estado propio, con la nota de qué se espera, gris pizarra con ⏸. Lo propone un
  proyecto bloqueado por «Atraso por cliente», «Cliente no responde» o «Cliente pidió pausa»; lo marca o lo
  quita la CSL. No cuenta como riesgo; si además hay una razón roja (queja, cancelación, renovación en riesgo),
  gana el rojo y dice «y en espera del cliente». «Atraso por Smarteam» sigue rojo. Librería Internacional
  pasaría de rojo a «En espera».

### 3 · Filtros y vistas guardadas

- Filtros por relación, potencial, CSE, momento y color (varios valores a la vez), en la dirección: una vista es
  un enlace.
- Tabla `VistaDeCartera` (nombre, filtros, quién la creó). Cuatro vistas de arranque sin guardar: «Alto
  potencial sin servicio activo», «En riesgo con renovación cercana», «En espera del cliente», «Sin CSE».

### 4 · Vista por CSE (pestaña Equipo)

- Por CSE: cuentas, recurrentes contra la meta de 6 a 7 (barra con la banda), en riesgo, en espera, sin
  contacto, alto potencial sin servicio, y sus horas (enlace a «Carga del equipo»). Cada número filtra la lista.
- La meta es configurable (supuesto de la carga).

### 5 · Pase de cuenta y la migración en HubSpot

1. **Código** (deploy): el espejo lee «CSE Encargado» y, si está vacío, «CSL Encargado» (todos los pipelines).
   Quien crea o reasigna escribe «CSE Encargado»; en los proyectos de implementación, «CSL Encargado» = la CSL.
2. **Script** `migrar-cse-encargado.ts`, en seco por defecto, lo aplica Elías: copia «CSL Encargado» →
   «CSE Encargado» en los 103 proyectos; después «CSL Encargado» = la CSL solo en los de implementación (en
   desarrollo y sitios web es el encargado técnico y no se toca); empresa y contactos asociados con los dos.
3. **Verificar** que nadie pierde cuentas: quién ve cada cliente antes y después, igual.
- ⚠ **Antes del paso 1**: revisar en HubSpot si algún workflow, reporte o vista usa «CSL Encargado» de los
  proyectos (lo hace alguien con acceso de administrador).
- **El pase** (CSL y super admin, desde la fila y la cuenta): escribe «CSE Encargado» en empresa, contactos y
  proyectos de implementación, y «CSL Encargado» = la CSL. Al nuevo CSE le llega en «Para ti» el resumen: color
  y porqué, relación, momento, renovación, alertas abiertas, último contacto, en espera y proyectos activos.
  Al anterior, una línea de que la cuenta pasó.
- La CSL sale del rol en Nexus (`CSL`, hoy Alexander Vanegas), no de un correo escrito en el código.

### 6 · Resultados, retos y dolores de la empresa

- Se leen de vuelta de HubSpot: si alguien cambió `nexus_resultados_que_persigue`, `nexus_retos_estrategicos`
  o `nexus_dolor_principal` después de lo último que escribió Nexus, se propone en Información del cliente (no
  se pisa).
- Lo que confirman la preventa y la exploración del proyecto va a esos mismos campos.
- En la cuenta de Éxito del cliente: pestaña Resultados con lo de la empresa (con su fuente y fecha) arriba de
  los resultados de cada proyecto, y una línea en Estado de la cuenta.

## SQL (antes de cada deploy)

1. Entregas 1–2: `ClasificacionDeCuenta` y `CorreccionDeSalud` (+ las columnas de «en espera»).
2. Entrega 2: `ALTER TYPE "CsAlertCategory" ADD VALUE 'QUEJA'` (con `assertProdWriteAllowed` a mano).
3. Entrega 3: `VistaDeCartera`.
4. Entrega 5: sin SQL; el script escribe en HubSpot.

## Orden sugerido

1 → 2 → 3 → 4 → 5 → 6. La 2 resuelve lo de kölbi y Librería; la 5 es la única con riesgo de visibilidad y va
con su script en seco y la verificación.
