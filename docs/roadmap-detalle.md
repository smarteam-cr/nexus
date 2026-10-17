# Roadmap de Nexus — detalle para las sesiones

> **Para las sesiones, no para Elías.** Elías lee `docs/roadmap.md` (corto). Este archivo lleva lo que necesita una
> sesión para trabajar sin chocar: commits, pasos manuales, zonas de archivos y sesiones abiertas. Los planes de
> cada iniciativa (`docs/*-plan.md`) son el detalle de cada una. Lo actualiza la sesión de control junto con el
> roadmap corto, después de cada integración y de cada deploy. Las sesiones de ejecución no lo editan: dejan un
> parte y la sesión de control lo pasa acá.
>
> **Corte:** 2026-10-17. Verificado contra git, `/api/health` de producción y la base (solo lectura).
>
> **Vista:** https://claude.ai/artifact/9MryTNvdPwFoVCXmC1Pbah. Para volver a publicarla después de editar este
> archivo: `node scripts/roadmap-vista.mjs` y publicar `.roadmap/roadmap.html` con `url` = esa dirección.

## Cómo se lee

**Estados de una etapa**, en orden:

| Estado | Qué quiere decir |
|---|---|
| Sin empezar | No hay código. |
| En código | Hay código, pero no está commiteado en `main`. |
| Sin desplegar | Commiteado en `main`, todavía no en producción. |
| Desplegado | En producción. Nadie confirmó que funciona con datos reales. |
| Validado | Elías lo probó en producción y anda. Lleva fecha. |

**Desplegado no es validado.** Todo lo desplegado entra a la cola de validación. Lo que aparece al validar se
anota como una etapa chica de su iniciativa, no se arregla en la conversación donde se valida.

## Dónde estamos hoy (17 oct)

- **Producción** corre `918e2fdb` (16 oct, 16:10). La base tiene todos los SQL que necesita `main` (`npm run check:esquema` en verde).
- **8 commits sin desplegar** en `main`: el plan del sistema de trabajo y sus fases 0, 0.4, 0.5, 1 y 1.2 (`700abcf1`, `8b64e65b`, `c8f60230`, `160318a6`, `0baf7b15`, `13866439`), Odoo y Mercury mandan (`d2d33746`) y las series del gráfico del equilibrio (`ea3cf26b`). No necesitan SQL.
- **Invariantes en rojo en producción:** INV11 (un proyecto activo en un pipeline que `lib/projects/kind.ts` no declara) e INV32 (el último corte de cobranza tiene más de 17 días: `cobranza-quincenal` nunca corrió).
- **Jobs que nunca corrieron:** `cobranza-quincenal` (falta `COBRANZA_CRON_ENABLED`) y `cs-watchdog-daily` (falta `CS_WATCHDOG_ENABLED`). La copia de Partner sí corre.
- **Código sin commitear:** solo «Reuniones con texto ajeno», en el worktree `elegant-rhodes-995841`, sobre una base del 5 oct.

## Lo que sigue, en orden

1. **Desplegar los 8 commits** (lo hace Elías, después de probar en el 3004).
2. **Inmediatamente después del deploy:** `scripts/cerrar-alertas-sueltas.ts` (hoy hay 154 alertas abiertas; el simulacro cerraba 131) y «Ya se subió» en Feedback.
3. **Poner en verde los invariantes:** declarar el pipeline del INV11 y decidir si se prende `COBRANZA_CRON_ENABLED`.
4. **Recorrer la cola de validación** (abajo), de arriba hacia abajo.
5. **Decidir lo que espera una respuesta tuya** (abajo): cada decisión destraba una etapa.
6. **Recién ahí, construir lo nuevo**, por zonas y en paralelo: la fase 2 del sistema de trabajo y las etapas 3 y 4 de SmartLoop (estas dos van antes del 6 nov).

## Cola de validación

Lo desplegado que nadie confirmó con datos reales. Marca cada fila como Validado, con fecha, o agrega lo que encontraste.

| Qué | Cómo probarlo | Con quién |
|---|---|---|
| Tareas de HubSpot en los dos sentidos | Completar una tarea en Nexus y verla cerrada en HubSpot, y al revés | Andrés |
| Notas de la cuenta | Anotar una en La cuenta › Notas y verla en la empresa, el negocio y el proyecto de HubSpot | — |
| «Para ti» del CSE y «Preparar» una reunión | Abrir «Para ti» como CSE la mañana de una reunión con cliente | un CSE |
| La lectura de cada reunión | Abrir «Lo que dejó esta reunión» de 3 reuniones recientes (hay 29 lecturas listas) | — |
| Exploración por sesiones | Unir una sesión a un evento real del calendario y ver que se lee sola | un CSE |
| Handoff congelado | Congelar uno y usar «Buscar lo nuevo» (hoy hay 1 congelado) | — |
| Cartera de la CSL | Recorrer color, clasificación, filtros y la pestaña Equipo | Alex Vanegas |
| Carga del equipo y Rentabilidad | Mirar la semana de cada CSE y el margen de 3 cuentas | Alex V. / Marco |
| SmartLoop en el proyecto de prueba | Abrir el ciclo de FACO y recorrer sus documentos | — |
| Punto de equilibrio y Conciliación | Revisarlos con Alex después de aplicar Odoo y Mercury | Alex Arrieta |
| Preguntas sobre la cuenta | Ya hay 9 respuestas: mirar el CSV en Feedback › Encuestas | — |
| «¿Cuándo lo presentas?» | Responderla como CSE en un diagnóstico (hay 1 respuesta) | un CSE |
| Escala 8.8 | Usarla con 5 a 8 clientes reales antes de la 9.0 (nunca con Wherex) | equipo CS |

## Pasos manuales pendientes

| Paso | Estado verificado | Lo corre |
|---|---|---|
| `cerrar-alertas-sueltas.ts --apply` | 154 alertas abiertas | Claude, después del deploy |
| Prender `SEGUIMIENTO_HECHOS=1` | Decidido el 17 oct: sí. 0 hechos; el sondeo se corrió el 15 oct (Sonnet con caché) | Elías, en el `.env` del VPS al desplegar |
| `COBRANZA_CRON_ENABLED=1` | Decidido el 17 oct: sí. `cobranza-quincenal` nunca corrió; INV32 en rojo | Elías, en el `.env` del VPS al desplegar |
| `CS_WATCHDOG_ENABLED=1` (vigía; gasta API) | Decidido el 17 oct: todavía no, primero validar Éxito del cliente con Alex Vanegas | — |
| Prender las preguntas de tiempo y mandar la encuesta de arranque | Nunca se prendieron: 0 preguntas | Elías (avisar al equipo antes) |
| `congelar-handoffs-aplicados.ts` | 1 handoff congelado | Claude, si Elías decide |
| `migrar-cse-encargado.ts --apply` (escribe en HubSpot) | No verificado | Claude, después de revisar workflows en HubSpot |
| `migrar-guia-de-exploracion.ts --apply` y retirar `lib/guia-exploracion` | Quedan 3 guías viejas | Claude |
| Revisar los reportes de Feedback | 7 sin revisar | Elías |
| Reconectar HubSpot (scope `crm.objects.goals.read` y transcripciones) | No verificado | Elías |

## Lo que espera una decisión tuya

| Decisión | Destraba |
|---|---|
| Prender el vigía de Éxito del cliente (gasta API) | La lectura de la cuenta con datos frescos |
| Prender el corte quincenal de cobranza | INV32 y la foto de la quincena en Reportes |
| Congelar o no los handoffs que ya existen | «Buscar lo nuevo» en los proyectos viejos |
| Si el CSE puede ver el uso de HubSpot Partner (términos de partner) | Mantener o quitar la excepción de Adopción |
| Gmail de Smarteam o un proveedor de correo | El envío del correo de la mañana (4e, pasos 2–4) |
| Autorizar el cobro sin firma humana de lo pagado en Odoo y Mercury | El aplicador diario del «libro único» |
| Las 9 preguntas del modelo de comisiones (con Marco) | Construir el pago con el modelo nuevo |
| Cuenta piloto para la auditoría del portal | El piloto con un portal de cliente |
| La lista preliminar de casos de uso de SmartLoop | Etapa 3 de SmartLoop |
| Calibrar con Alex los cortes del potencial | Que la clasificación de la cartera proponga bien |
| Retomar o archivar el refactor de base de datos | Sacarlo del roadmap o volver a medirlo |
| Qué hacer con «Reuniones con texto ajeno» | Rebasarlo sobre main o descartarlo |

## Iniciativas

### Sistema de trabajo de cada cuenta (Nexus 2.0) · `docs/nexus-sistema-de-trabajo-plan.md` · zona Tareas y «Para ti»

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0.1 | Líderes de sprint; Tareas en el menú de todos | Sin desplegar | 8b64e65b |
| 0.2 | El siguiente paso pasa a ser una tarea; reunión planeada | Sin desplegar | 8b64e65b |
| 0.3 | Visibilidad de tareas por cuenta | Sin desplegar | 8b64e65b |
| 0.4 | Capa de operaciones | Sin desplegar | 0baf7b15 |
| 0.5 | Lista de limpieza de HubSpot | Sin desplegar | 13866439. Probadas en el 3004 el 17 oct: 0.1, 0.5, 1.1 y 1.2 |
| 0.6 | Prender la lectura de hechos | Sin empezar | Paso manual |
| 1.1–1.4 | Lo que importa hoy, menos avisos, tope de tareas de reuniones, lectura de la cuenta | Sin desplegar | c8f60230, 160318a6 |
| 2 | La semana: reglas de servicio, agenda por cuenta, «Planifica tu semana» | Sin empezar | Depende de 1C de Tareas |
| 3 | Después de cada reunión: correo para toda reunión, próxima reunión | Sin empezar | — |
| 4 | El chat de Nexus sobre la capa de operaciones | Sin empezar | Depende de 0.4 |
| 5 | Entregables y herramientas con plantillas | Sin empezar | — |

### «Para ti» por equipo · `docs/mi-dia-plan.md` · zona Tareas y «Para ti»

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0–3 | Negocios abiertos, siguiente paso por equipo, tareas de HubSpot | Desplegado | 1de1ea53 |
| 4a, 4b, 4f | Uso de Nexus, la IA como borrador, reunión a mano | Desplegado | 02d6f7a9, 57a66605, 06171beb |
| 4c, 4d, 4e paso 1 | «Para ti» del CSE, después de cada reunión, correo visible | Desplegado | 90cd8827 |
| 5 | Notas de la cuenta | Desplegado | 389eff66 (el plan decía sin desplegar) |
| 6a | Contactos y tickets de HubSpot | Desplegado | 765c5a75 |
| 4e pasos 2–4 | Enviar el correo de la mañana | Sin empezar | Espera Gmail o proveedor |
| 6b, 7, 8 | Agente, otros equipos, acciones | Absorbidas | Pasan al sistema de trabajo (0.1, 2 y 4) |

### Tareas internas · `docs/tareas-plan.md` · zona Tareas y «Para ti»

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 1A.1, 1A.2, 1B | Piloto, tablero y espacios, chat de tareas | Desplegado | d1455290 |
| 3 | Las reuniones con clientes llegan a Tareas | Desplegado | d1455290 |
| 1C | Lectura automática de reuniones del equipo y plantillas | Sin empezar | Base de la fase 2 del sistema |
| 2 | Adjuntos, selector de registros, horarios libres | Sin empezar | — |

### Memoria de la cuenta · `docs/memoria-de-la-cuenta-plan.md` · zona Reuniones y documentos

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0, A, 1, 2, 3, 3b, 4, 7 | Lectura única, exploración por sesiones, frontera, memoria, handoff congelado, solo las elegidas | Desplegado | d1455290 |
| Migración de reuniones | Elegir las 6 más recientes por documento | Desplegado | Aplicada el 11 oct |
| 5 | Sondeo de hechos | Desplegado | Corrido el 15 oct |
| 6 | Hechos, enrutador y novedades | Desplegado, apagado | Espera `SEGUIMIENTO_HECHOS=1` |
| — | Acuerdos vigentes, canal al cronograma, pantalla de Uso de Nexus | Sin empezar | — |

### Exploración y Preventa · sin plan propio · zona Ventas y Preventa

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| Exploración del proyecto = la de la preventa | Mismo lienzo con marco CS | Desplegado | d1455290 |
| Contexto adicional por documento | Cada documento con su bloque | Desplegado | 674d9159, ef756744 |
| Correo de seguimiento y reuniones de HubSpot | Correo armado por el agente; reuniones de HubSpot entran solas | Desplegado | d1455290 |
| Sin pistas del cliente no hay diagnóstico | Regla de hipótesis | Desplegado | 93ecd38d |

### Éxito del cliente: cartera de la CSL · `docs/exito-del-cliente-cartera-plan.md` · zona Clientes y CS

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0–6 | Color, clasificación, salud, vistas, Equipo, pase de cuenta, resultados | Desplegado | d1455290 |
| Migración «CSE Encargado» | Escribir CSE y CSL en HubSpot | No verificado | Script listo |

### Rentabilidad y carga · `docs/rentabilidad-y-carga-plan.md` · zona Clientes y CS

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| E1–E5, E7 | Acceso, tiempos, carga, calibración, rentabilidad | Desplegado | d1455290 |
| E6 | Foto del margen de cada mes | Sin empezar | Tabla nueva + job |

### SmartLoop · `docs/smartloop-plan.md` · zona Clientes y CS

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0, 1, 1b | Proyecto de prueba, ciclo, riel rehecho | Desplegado | 18fb4806, c47cfb7b, a4789fae |
| 2 | La escala en el tiempo | Sin empezar | Tabla nueva |
| 3 | Cronograma del ciclo | Sin empezar | Antes del 6 nov |
| 4 | Aprendizaje y cierre del ciclo | Sin empezar | Antes del 6 nov |
| 5–8 | Traductor de propuestas, recomendar recurrencia, Gantt de la cuenta, tareas del CSE | Sin empezar | — |

### Casos de uso · sin plan propio · zona Ventas y Preventa

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| v1 | 26 casos atados a la escala, usados en la preventa | Desplegado | 018164e9 |
| Fase 2 | Licencias y precio | Sin empezar | — |

### Finanzas · `docs/finanzas-rediseno-plan.md` · zona Finanzas

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 1–9 | Vistas por persona, revisión, cierre, gasto sin Excel, equilibrio, BCCR, planilla | Desplegado | 0e37586f … 644225a9 |
| Ajustes del 14–16 oct | Reportes de Alex, «Quién nos debe», kölbi | Desplegado | 918e2fdb |
| Series del gráfico | Varias series a la vez | Sin desplegar | ea3cf26b |

### Odoo y Mercury · `docs/odoo-integracion-plan.md`, `docs/mercury-integracion-plan.md` · zona Finanzas

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| Odoo 1–4 | Copia, emparejado, «Lo que no cuadra», configuración | Desplegado | — |
| Mercury 1–3 | Copia, emparejado, «Lo que no cuadra» | Desplegado | 901f1fa7, f3d0fba7 |
| Mercury 4 | Facturación por cliente con Mercury | Parcial | El equilibrio ya lo muestra; falta la facturación por cliente |

### Un solo libro financiero · sin plan escrito · zona Finanzas

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| A | Odoo y Mercury mandan: se pega la factura y se cobra en lote | Sin desplegar | d2d33746; el script ya se aplicó el 17 oct desde dev |
| B | Porcentaje de servicio y licencia por contrato | Sin empezar | Hoy hay un parche solo para kölbi |
| C | El aplicador corre solo cada día | Sin empezar | Espera la decisión del cobro sin firma |

### Modelo de comisiones · sin plan propio · zona Finanzas

| Etapa | Qué hace | Estado | Commit / nota |
|---|---|---|---|
| 0, 1, 1b | Metas de HubSpot, «Cómo funciona», simulación, bono de la CSL | Desplegado | e8862a73, 351319cf |
| 2, 3 | Ventas y reparto; pagos del mes | Sin empezar | Espera las preguntas con Marco |

### Otros módulos

| Iniciativa | Estado | Lo que queda |
|---|---|---|
| Procesos (mapas y editor) | Desplegado | Que el chat proponga cambios al mapa; borrar los nodos de prueba de Wherex |
| Planificación | Desplegado | Puesta en marcha; plantillas de propiedades de Caroline |
| Auditoría del portal | Desplegado (v2) | Piloto con el portal de un cliente |
| Feedback, Recorridos, Página 404 | Desplegado | Validar con sesión |
| Preguntas de tiempo | Desplegado, sin prender | Prender y mandar la encuesta de arranque |
| Preguntas sobre la cuenta, «¿Cuándo lo presentas?» | Desplegado | Validar |
| Escala de Rendimiento | 8.8 publicada | Probarla con clientes; la 9.0 (124 puntos en `docs/escala/pendiente-9-0.md`) |
| Centro de comando | Sin empezar | Diseño listo; Uso de Nexus tiene 3 de 5 pestañas |
| Reuniones con texto ajeno | En código | Worktree viejo; choca con la lectura de reuniones |
| Refactor de base de datos | Estancado | `docs/database-refactoring-plan.md`, números viejos |
| Cronograma, Marketing, Propuestas, Roles | Desplegado | Nada escrito como pendiente |

## Zonas de archivos

Una sola sesión de ejecución por zona a la vez, cada una en su worktree. Dos etapas pueden ir en paralelo solo si
están en zonas distintas y ninguna depende de la otra.

| Zona | Carpetas principales |
|---|---|
| Finanzas | `lib/finanzas`, `lib/cobranza`, `components/finanzas`, `components/cobranza`, `app/(shell)/finanzas`, `app/(shell)/cobranza` |
| Clientes y CS | `lib/cs`, `lib/carga`, `lib/rentabilidad`, `lib/servicios`, `components/cs`, `components/ciclos`, `app/(shell)/customer-success`, `app/(shell)/clients` |
| Ventas y Preventa | `lib/exploraciones`, `lib/ventas`, `lib/casos-de-uso`, `lib/business-cases`, `components/exploraciones`, `app/(shell)/sales` |
| Tareas y «Para ti» | `lib/tareas`, `lib/para-ti`, `lib/siguiente-paso`, `lib/operaciones`, `lib/limpieza`, `lib/mi-dia`, `components/tareas`, `components/para-ti` |
| Reuniones y documentos | `lib/memoria`, `lib/lecturas`, `lib/seguimiento`, `lib/sessions`, `lib/handoff`, `lib/contexto`, `lib/timeline`, `lib/canvas`, `components/landing` |
| Escala | `docs/escala`, `lib/escala`, `app/(shell)/escala` |
| Plataforma | `lib/auth`, `lib/db`, `lib/ui`, `components/ui`, `components/layout` |

**Compartidos: los toca solo la sesión de control, al integrar.** `prisma/schema.prisma`, `scripts/sql/`,
`docs/DECISIONS.md`, `docs/GLOSSARY.md`, `docs/RUNBOOK.md`, `ARCHITECTURE.md`, `lib/jobs/defs.ts`,
`components/layout/nav-config.tsx`, `lib/para-ti/fuentes/index`, y los registros con test
(`lib/ui/skeleton-coverage.ts`, `lib/ui/page-shell-coverage.ts`, el ratchet de tokens). Una sesión de ejecución
que necesita uno lo dice en su parte; la de control lo escribe al mezclar.

## En curso ahora

Ninguna etapa en ejecución al corte. Cuando se arranque una, se anota acá: etapa · zona · sesión · rama.

| Etapa | Zona | Sesión | Rama |
|---|---|---|---|
| — | — | — | — |

## Sesiones abiertas

30 sesiones sin archivar al 17 oct. Las que ya no tienen nada pendiente se pueden archivar; las demás pasan a ser
sesiones de ejecución de su zona o se cierran.

| Sesión | Iniciativa |
|---|---|
| Nexus 2.0 | Sistema de trabajo |
| Diseño panel central Nexus 2.0 | Sistema de trabajo (fase 2) |
| Finanzas \| Nexus · Comisiones \| Nexus \| Finanzas | Finanzas, libro único, comisiones |
| Éxito del cliente \| Nexus · Rentabilidad \| Nexus · Clientes \| SmartLoop \| Nexus | Clientes y CS |
| Preventa \| Nexus · Casos de uso \| Nexus · Propuestas \| Nexus | Ventas y Preventa |
| Tareas \| Nexus · Para ti \| Customer Success · Para ti \| Notificaciones | Tareas y «Para ti» |
| Cronogramas \| Nexus | Reuniones y documentos |
| Escala de Rendimiento \| Nexus | Escala |
| Feedback \| Nexus · Recorridos \| Nexus · Marketing \| Nexus · Roles y perfiles \| Nexus | Módulos sueltos |
| Poner en verde los invariantes de producción | Plataforma |
| Reducir los tipos de HubSpot en el type-check | Plataforma (hecho: 8b13546c) |
| Vincular el registro activo de HubSpot Partner | Worktree viejo `gifted-gates-95b29f` |

Hay además 8 worktrees de sesiones viejas en `.claude/worktrees/` y dos copias aparte (`nexus-audit`, `nexus-rentabilidad`).
`E:\Elias\Proyectos\nexus_DEPRECADO_usar_D` no se usa.
