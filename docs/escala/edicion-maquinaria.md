# Edición Maquinaria y equipo pesado — escala 9.1.0 y 9.1.1

Una edición nueva, con sus tres áreas enteras, en la Parte 5 de `escala_rendimiento_smarteam.md`. La pidió Elías
el 28 oct porque hay clientes de la industria (Aditec JCB, CAMOSA). La escala pasa a la 9.1.0 (una edición
nueva es una versión menor). No cambia ningún criterio de la matriz ni el cálculo.

Para el distribuidor de maquinaria —de construcción, agrícola, de minería o industrial— y de camiones: un
asesor trabaja cada venta (consulta → visita a la obra o a la finca → demostración → cotización →
financiamiento → cierre → entrega técnica) y la posventa atiende en el taller y en el lugar de trabajo.
*Perfil habitual:* con equipo · recompra. *Propios desde el 701.* Quedan fuera la venta de repuestos al
público, el fabricante que no le vende al cliente final y la empresa que solo alquila.

Se escribió sobre la forma de Automotriz, la edición más parecida, con lo que cambia en la maquinaria: la
demostración en lugar de la prueba de manejo, las horas de uso en lugar del kilometraje, la máquina parada
como lo urgente, la entrega técnica con la capacitación al operador, los repuestos que hay que importar, las
licitaciones públicas, las temporadas del cliente (siembra, cosecha, obra pública), los boletines de servicio
de la marca y la telemetría. Las 120 celdas dicen al menos un criterio con sus palabras: 127 reescritos y 32
propios. Ninguna queda en `GENERALES_A_PROPOSITO`.

La 9.1.1 (el mismo día) corrige lo que encontró la revisión: ocho criterios reescritos sumaban condiciones a la
matriz (la máquina de interés en cada negocio, las horas de uso en la ficha, la proyección por modelo, los datos fijos
de la cotización y de la entrega técnica…). Ahora van como ejemplo y piden lo mismo que la general. Automotriz tiene
el mismo patrón en 1.3.F1 y 3.3.F2; no se tocó.

## Lo propio de la edición

| Dimensión | Qué pide |
|:--|:--|
| 1.1 Procesos | Cada demostración registrada con su siguiente paso (F701); el proceso escrito para recibir la usada: horas de uso, estado e historial (F702). |
| 1.2 Tecnología | Apartar una máquina la marca en el inventario (F701); la solicitud de financiamiento viaja sola a bancos y arrendadoras (E701). |
| 1.3 Datos | El estado de cada máquina coincide con lo facturado (F701); cuánto tarda en venderse cada modelo y cada usada (E701). |
| 1.4 Equipo | El acuerdo medido con financiamiento, avalúo, importación y entrega técnica (E701). |
| 1.5 Líneas de máquinas y cotización | Una sola lista vigente (D701, F701); los cambios llegan el mismo día (E701); en las ventas de más valor y de flota, la cotización compara el costo de operación (E702). |
| 1.6 Priorización | La capacidad de pago antes de apartar la máquina o pedirla a la marca (E701). |
| 1.7 Seguimiento de demostraciones y cotizaciones | Seguimiento de cada demostración y cotización (F701); el comprador sabe cómo va su máquina hasta la entrega (E701). |
| 1.8 Ventas ganadas y perdidas | La razón de cada venta que se cae, también la licitación (F701); a qué marca se fue el cliente (E701). |
| 2.1 Procesos | El calendario sigue el año del cliente: ferias, siembra y cosecha, obra pública (F701). |
| 2.5 Marca | Cada modelo con su página, ficha técnica y cómo pedir una demostración (F701). |
| 2.7 Canales | Solo se anuncia lo disponible (F701); cuánto cuesta cada demostración y cada venta por canal (E701). |
| 3.1 Procesos | La orden de trabajo con las horas de uso (F701); guías para la máquina parada, el repuesto importado y la garantía rechazada (E701). |
| 3.2 Tecnología | Citas y visitas en campo con su estado avisado solo (F701); ver si hay repuesto antes de prometer una fecha (F702); agendar y aprobar en línea (E701). |
| 3.3 Datos | Las máquinas que vuelven por la misma falla (E701). |
| 3.4 Equipo | El acuerdo medido con repuestos, la marca y los talleres externos (E701). |
| 3.5 Consistencia de la posventa | Una lista vigente de mano de obra, traslado y repuestos (F701). |
| 3.7 Seguimiento de la máquina | El recordatorio del mantenimiento por horas de uso (F701); el aviso de cada boletín de servicio (E701); las alertas de la telemetría abren el aviso solas (E702). |
| 3.8 Escalabilidad de la posventa | Las fallas que se repiten se comparten con la marca (E701). |

## Para mirar con calma

- **3.7.E702 (telemetría).** Vale solo si las máquinas la traen y el cliente autorizó compartirla. Si una
  distribuidora no tiene acceso a los datos de la marca (JDLink, LiveLink), el criterio queda sin cumplir.
- **1.5.E702 (costo de operación).** Es lo que distingue la venta consultiva de maquinaria; se pide en las
  ventas de más valor y de flota, no en todas.
- **El nombre del área 3.** Se llama «Servicio», como en Automotriz; en la conversación con el cliente se le
  dice «posventa».
- **CAMOSA.** Hoy su ficha dice «Automotriz». Si se le cambia la industria a «Maquinaria y equipo pesado», su
  próxima medición con esta edición es una línea base nueva.
