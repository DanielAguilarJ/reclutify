# Requirements — Endurecimiento de autorización del flujo público

## Introducción

Reclutify expone tres recorridos que funcionan **sin cuenta de usuario**: la entrevista por ticket individual (`/interview/t/[token]`), la entrevista por enlace público de vacante (`/interview/public/[publicToken]`) y la sesión de informes de capacitación (`/informes/[courseId]`). Para que esos recorridos funcionen, el proyecto abrió políticas RLS al rol `anon` y dejó rutas de API sin autenticación. Varias de esas aperturas son más amplias de lo que el flujo necesita, y algunas ya son código muerto: la escritura real pasa por rutas de servidor con `service_role`.

El resultado es un conjunto de agujeros verificados en el repositorio y en la base real: cualquiera con la clave anon pública puede listar todos los tickets de entrevista con sus tokens, suplantar candidatos, invalidar entrevistas ajenas, sobrescribir la evaluación de cualquier candidato de cualquier organización, y crear tickets y enviar correos a través de un endpoint cuyo rechazo por clave está comentado.

El objetivo de este spec **no es rediseñar los flujos públicos**, sino reducir el privilegio de `anon` al mínimo que el producto necesita, mover las escrituras que quedan en el navegador a rutas de servidor con validación de pertenencia, y reconstruir en migraciones las políticas que hoy solo existen en la base real.

**El Requisito 10 (preservación del flujo público) es una condición de aceptación de todos los requisitos anteriores.** Ningún endurecimiento se considera cumplido si un candidato sin cuenta deja de poder completar su entrevista o un cliente sin cuenta deja de poder completar su sesión de informes. Ese es el producto: si se rompe, no hay entrevistas.

**Restricción transversal que arrastra todo el spec: este spec no aplica cambios a la base de datos.** Produce requisitos, diseño, tareas y archivos de migración bajo `supabase/migrations/`. La aplicación se decide con el usuario, con respaldo previo y en un entorno de pruebas primero (Requisito 14).

## Glosario

- **anon**: rol de Postgres que Supabase asigna a las peticiones hechas con `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Esa clave viaja al navegador, por lo que todo privilegio de `anon` es un privilegio público.
- **service_role**: rol de Postgres que Supabase asigna a las peticiones hechas con `SUPABASE_SERVICE_ROLE_KEY`. Ignora RLS por diseño y solo debe usarse en el servidor.
- **Prueba de acceso**: credencial que demuestra que quien escribe participa en la entrevista o sesión que está modificando. En este spec son tres: el `token` del ticket, el `public_token` de la vacante y la credencial de sesión de informes emitida por el servidor.
- **Ruta de servidor**: manejador bajo `src/app/api/**/route.ts` ejecutado en el servidor de Next.js, con acceso a `SUPABASE_SERVICE_ROLE_KEY`.
- **Sonda anon**: prueba automatizada que se conecta con la clave anon e intenta una operación que debe estar prohibida. Falla si la operación tiene éxito.
- **Deriva repo↔base**: diferencia entre las políticas que existen en la base real y las declaradas en `supabase/migrations/`.
- **Flujo de ticket**: recorrido del candidato que recibe un enlace individual con token, en `/interview/t/[token]`.
- **Flujo de enlace público**: recorrido del candidato que llega por el enlace general de la vacante y se registra con nombre y correo, en `/interview/public/[publicToken]`.
- **Flujo de informes**: recorrido del cliente sin cuenta que toma una sesión informativa de un curso, en `/informes/[courseId]`.
- **INVITE_API_ENFORCE**: variable de entorno que gobierna la transición de `api/invite-candidates` entre registrar llamadas no autenticadas y rechazarlas.

## Hallazgos verificados (base del diagnóstico)

Todos los puntos siguientes están confirmados en el código del repositorio. Los que dependen del estado de la base real se marcan como tales.

1. **`interview_tickets`: enumeración de tokens y suplantación.** `00003_sync_data_persistence.sql:113-119` crea `public_ticket_by_token` (`FOR SELECT TO anon USING (true)`) y `anon_tickets_update` (`FOR UPDATE TO anon USING (true)`). El SELECT abierto permite a cualquiera listar todos los tickets con su `token`, `candidate_name` y `role_id`, y abrir `/interview/t/[token]` como si fuera ese candidato. El UPDATE abierto permite marcar `used = true` en tickets ajenos y dejar a terceros sin poder entrar. El linter de Supabase no reporta este caso. Uso legítimo actual: `ticketStore.syncMarkUsed` (`src/store/ticketStore.ts:185-199`) escribe desde el navegador con la clave anon, invocado desde `src/app/interview/t/[token]/page.tsx:203`; la lectura por token la hace la misma página vía `fetchTicketByToken`.

2. **`roles` y `organizations`: lectura anon abierta (hallazgo nuevo, no estaba en el diagnóstico inicial).** `00003_sync_data_persistence.sql:187-188` crea `anon_roles_select` (`FOR SELECT TO anon USING (true)`), y `20260601_public_interview_links.sql:23-27` añade `public_role_by_token` (`USING (public_token IS NOT NULL AND public_token != '')`). Como las políticas se combinan con OR, `anon` puede leer **todas** las vacantes de todas las organizaciones, incluida la columna `public_token`. Eso convierte la enumeración de `roles` en enumeración de enlaces públicos de entrevista: mismo efecto que el punto 1 por otra vía. En paralelo, `20260510_company_pages.sql:12` crea `public_company_select` en `organizations` (`TO anon, authenticated USING (true)`), y según `src/lib/database.types.ts:829-844` esa tabla contiene `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan_tier`, `billing_interval` y `max_interviews_per_month`. La página de ticket (`src/app/interview/t/[token]/page.tsx:113-115` y `:154-163`) lee `roles` y `organizations` directo con la clave anon, así que cerrar estas lecturas obliga a mover esos datos a la ruta de servidor del ticket.

3. **`/api/candidate-results`: escritura de servidor sin validación.** `POST` hace `upsert` con el `id` que envía el cliente y `PATCH` aplica un objeto `updates` arbitrario a cualquier `id` (`src/app/api/candidate-results/route.ts`). Ninguno de los dos exige prueba de acceso. Cualquiera puede sobrescribir la evaluación, la transcripción o el estado de cualquier candidato de cualquier organización, e incluso escribir columnas que el flujo del candidato no debería tocar. El único control correcto que ya existe es la resolución de `org_id` en el servidor a partir de `roleId`.

4. **`candidate_results`: políticas anon de escritura que ya son código muerto.** `20260602_fix_candidate_results_rls.sql:63-72` mantiene `anon_results_insert` (`WITH CHECK (true)`) y `anon_results_update` (`USING (true) WITH CHECK (true)`), documentadas en su propio comentario como "red de seguridad de respaldo". Las escrituras reales pasan por `/api/candidate-results` (invocado desde `adminStore.upsertCandidateResult` / `patchCandidateResult`, usados por `InterviewRoom.tsx` e `InterviewComplete.tsx`) y por `/api/public-interview` POST para el registro por enlace público. Esa misma migración ya eliminó las políticas más estrechas de `20260601` (`source = 'public_link'`), por lo que hoy no hay nada que dependa de las abiertas.

5. **`info_sessions`: segundo flujo público con escritura anon directa y deriva repo↔base.** No es heredado: es el flujo de `/informes/[courseId]`. `infoSessionStore` escribe con la clave anon desde el navegador en `createSession` (`src/store/infoSessionStore.ts:212-240`), `syncTranscript` (`:277-296`) y `updateSessionStatus` (`:299-317`), y se suscribe a cambios en tiempo real filtrando por `id` (`:320-345`) solo para detectar `status = 'completed'`. Los datos los leen `coachStore` y `src/app/actions/courses.ts:124`. Las políticas que permiten esas escrituras (`anon_insert_sessions`, `anon_update_own_session`) **no existen en `supabase/migrations/`**: solo están en la base real. El spec tiene que reconstruirlas en migración antes de poder endurecerlas.

6. **`api/invite-candidates`: público de hecho.** El rechazo está comentado y la condición solo se evalúa si la cabecera está presente, así que omitir `x-api-key` salta la comprobación por completo (`src/app/api/invite-candidates/route.ts:18-23`). El endpoint crea tickets de entrevista, envía correos e inserta invitaciones. Dos obstáculos concretos para cerrarlo: `applyToJob` (`src/app/actions/jobs.ts:151`, postulación pública a vacantes) llama al endpoint por HTTP **sin** `x-api-key`; y `MAKE_WEBHOOK_SECRET` no aparece en `.env.example`, por lo que no está confirmado que exista en producción. Detalle adicional: el insert en `interview_tickets` de esa ruta usa el cliente de sesión y `org_tickets_insert` exige `authenticated` con organización coincidente, así que para llamadas sin sesión ese insert ya falla hoy en silencio y solo sobrevive el espejo en `candidate_invites`, que usa `createAdminClient()`.

7. **`interview_telemetry`: política anon innecesaria.** `20260507_interview_telemetry.sql:33-34` crea `Enable insert for all users` (`WITH CHECK (true)`), y su propio comentario admite que la escritura es de servidor y la política anon está "just in case". La escritura ocurre en `src/app/api/chat/route.ts:45-51` y `:820-825`, con un cliente construido como `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. El volumen es de una fila por turno de entrevista (`logTelemetry`, líneas ~709 y ~742) con texto de prompt y respuesta: no es telemetría masiva de interfaz.

8. **`coach_notifications`: política sobrante.** `service_insert_notifications` con `WITH CHECK (true)`. La única inserción está en `src/app/api/info-notify/route.ts:37-39` con `service_role`, que ignora RLS. Las lecturas y el `update({ read: true })` van con sesión autenticada desde `coachStore`.

9. **`organizations`: ruido del linter.** `Users can insert organization` con `WITH CHECK (true)` para `authenticated` (`00002_fix_rls_and_insert_policies.sql:80-81`). Es el onboarding: cualquier usuario con sesión crea su organización. Riesgo bajo.

## Requisitos

Los requisitos 1 a 9 están ordenados por riesgo real explotable, no por severidad del linter. Los requisitos 10 a 14 son transversales y aplican a todos los anteriores.

### Requisito 1 — Fin de la enumeración de tickets y de la suplantación de candidato

**Historia de usuario:** Como responsable de una organización, quiero que nadie pueda listar los tickets de entrevista ni marcarlos como usados, para que ningún tercero suplante a un candidato ni le impida entrar a su entrevista.

#### Criterios de aceptación

1. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ dejar la tabla `interview_tickets` sin ninguna política que otorgue `SELECT` o `UPDATE` al rol `anon`, eliminando `public_ticket_by_token` y `anon_tickets_update`.
2. SI el rol `anon` ejecuta un `SELECT` sobre `interview_tickets`, con o sin filtro por token, ENTONCES la base de datos DEBERÁ devolver cero filas.
3. SI el rol `anon` ejecuta un `UPDATE` sobre `interview_tickets` ENTONCES la base de datos DEBERÁ modificar cero filas.
4. CUANDO un candidato abra `/interview/t/{token}` con un token existente, no expirado y no usado ENTONCES una ruta de servidor DEBERÁ devolver únicamente los campos que la entrevista necesita de ese ticket: `id`, `candidate_name`, `role_id`, `language`, `expires_at` y `used`.
5. CUANDO la ruta de servidor del ticket resuelva un token válido ENTONCES DEBERÁ incluir en la misma respuesta los datos del rol y de la organización que la página usa hoy (`title`, `description`, `topics`, `interview_duration`, `interview_mode`, `name` y `logo_url` de la organización), para que la página no necesite leer `roles` ni `organizations` con la clave anon.
6. SI el token recibido no existe, está expirado o el ticket ya está marcado como usado ENTONCES la ruta de servidor DEBERÁ responder con un código de estado y un motivo distintos para cada uno de esos tres casos, y DEBERÁ omitir cualquier dato de otros tickets.
7. CUANDO la entrevista arranque ENTONCES el marcado de `used = true` DEBERÁ ejecutarse en una ruta de servidor que reciba el token completo y actualice exclusivamente la fila cuyo `token` coincida.
8. SI una petición de marcado de usado envía un identificador de ticket en lugar del token, un token inexistente o un token vacío ENTONCES la ruta de servidor DEBERÁ responder `404` y DEBERÁ modificar cero filas.
9. CUANDO la ruta de marcado reciba varias peticiones con el mismo token válido ENTONCES el resultado DEBERÁ ser idempotente: la fila queda con `used = true` y la respuesta indica éxito en todas las llamadas.
10. CUANDO un usuario autenticado gestione tickets desde el panel de administración ENTONCES el sistema DEBERÁ seguir permitiendo listar, crear y actualizar los tickets de su propia organización mediante las políticas `org_tickets_select`, `org_tickets_insert` y `org_tickets_update` existentes.
11. CUANDO un usuario autenticado consulte `interview_tickets` ENTONCES el sistema DEBERÁ devolver solo las filas cuyo `org_id` coincida con el de su perfil.

### Requisito 2 — Fin de la enumeración de vacantes y de enlaces públicos

**Historia de usuario:** Como responsable de una organización, quiero que nadie pueda listar mis vacantes no publicadas ni obtener el `public_token` de mis enlaces de entrevista, para que el cierre de los tickets no quede anulado por otra vía.

#### Criterios de aceptación

1. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ eliminar la política `anon_roles_select` de la tabla `roles`.
2. SI el rol `anon` consulta la columna `public_token` de `roles` ENTONCES la base de datos DEBERÁ rechazar la consulta por falta de privilegio sobre esa columna.
3. SI el rol `anon` ejecuta un `SELECT` sobre `roles` ENTONCES la base de datos DEBERÁ devolver únicamente las filas con `is_published = true`.
4. CUANDO un visitante sin cuenta abra el portal público de vacantes ENTONCES el sistema DEBERÁ seguir mostrando las vacantes con `is_published = true` con los mismos campos que muestra hoy.
5. CUANDO un candidato abra `/interview/public/{publicToken}` ENTONCES la resolución del `public_token` a datos de la vacante DEBERÁ realizarse en `/api/public-interview` con `service_role`, sin ninguna lectura anon directa a `roles`.
6. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ dejar la lectura anon de `organizations` sin acceso a las columnas `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `billing_interval`, `plan`, `plan_tier` y `max_interviews_per_month`.
7. SI el rol `anon` consulta cualquiera de las columnas de facturación o suscripción de `organizations` ENTONCES la base de datos DEBERÁ rechazar la consulta.
8. CUANDO un visitante sin cuenta abra una página pública de empresa o una tarjeta de vacante ENTONCES el sistema DEBERÁ seguir mostrando `name`, `slug` y `logo_url` de la organización.
9. CUANDO el diseño verifique que un componente del flujo público depende de una lectura anon que este requisito cierra ENTONCES DEBERÁ registrar ese componente y la ruta de servidor que lo sustituye, antes de que la tarea de migración se considere completa.

### Requisito 3 — Validación de pertenencia en las rutas de escritura pública

**Historia de usuario:** Como responsable de una organización, quiero que las rutas que escriben resultados de entrevista exijan prueba de acceso y comprueben que la fila escrita pertenece a esa entrevista, para que nadie sobrescriba la evaluación de otro candidato.

#### Criterios de aceptación

1. CUANDO `/api/candidate-results` reciba un `POST` ENTONCES el sistema DEBERÁ exigir una prueba de acceso: el `token` de un ticket vigente o el `public_token` de la vacante indicada.
2. SI un `POST` a `/api/candidate-results` llega sin prueba de acceso ENTONCES el sistema DEBERÁ responder `401` y DEBERÁ dejar la tabla `candidate_results` sin cambios.
3. SI un `POST` a `/api/candidate-results` presenta una prueba de acceso que no corresponde al `roleId` del cuerpo ENTONCES el sistema DEBERÁ responder `403` y DEBERÁ dejar la tabla sin cambios.
4. CUANDO `/api/candidate-results` reciba un `POST` con prueba de acceso válida ENTONCES el sistema DEBERÁ aceptar la escritura solo si el `id` recibido no existe todavía o si la fila existente pertenece a la misma entrevista que acredita la prueba de acceso.
5. SI un `POST` a `/api/candidate-results` intenta escribir sobre un `id` existente que pertenece a otra entrevista, a otro rol o a otra organización ENTONCES el sistema DEBERÁ responder `403` y DEBERÁ dejar la fila original intacta.
6. CUANDO `/api/candidate-results` reciba un `PATCH` ENTONCES el sistema DEBERÁ exigir la misma prueba de acceso y DEBERÁ comprobar que el `id` indicado pertenece a la entrevista acreditada antes de aplicar cambios.
7. CUANDO `/api/candidate-results` reciba un `PATCH` ENTONCES el sistema DEBERÁ aplicar únicamente las claves de una lista explícita de columnas modificables por el flujo del candidato, y DEBERÁ descartar cualquier otra clave presente en `updates`.
8. SI un `PATCH` a `/api/candidate-results` incluye `id`, `org_id`, `role_id` o `source` dentro de `updates` ENTONCES el sistema DEBERÁ rechazar la petición con `400` y DEBERÁ dejar la fila sin cambios.
9. CUANDO cualquiera de las dos operaciones resuelva `org_id` ENTONCES el sistema DEBERÁ derivarlo en el servidor a partir del `roleId`, ignorando cualquier `orgId` enviado por el cliente.
10. CUANDO `/api/public-interview` reciba un `POST` ENTONCES el sistema DEBERÁ seguir generando el identificador del resultado en el servidor y DEBERÁ rechazar cualquier `id`, `orgId` o `source` enviado por el cliente.
11. CUANDO `/api/public-interview` reciba un `POST` con un `public_token` que no corresponda a ninguna vacante ENTONCES el sistema DEBERÁ responder `404` y DEBERÁ dejar `candidate_results` sin cambios.
12. CUANDO una ruta de escritura pública rechace una petición ENTONCES el mensaje devuelto al cliente DEBERÁ omitir nombres de candidato, correos, identificadores de otras organizaciones y detalles internos del error.

### Requisito 4 — Retirada de la escritura anon sobre `candidate_results`

**Historia de usuario:** Como responsable de una organización, quiero que la clave anon no pueda insertar ni modificar resultados de entrevista, para que el control del Requisito 3 no se pueda esquivar escribiendo directo a la base.

#### Criterios de aceptación

1. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ eliminar las políticas `anon_results_insert` y `anon_results_update` de `candidate_results`.
2. SI el rol `anon` ejecuta un `INSERT` sobre `candidate_results` ENTONCES la base de datos DEBERÁ rechazar la operación por violación de política.
3. SI el rol `anon` ejecuta un `UPDATE` sobre `candidate_results` ENTONCES la base de datos DEBERÁ modificar cero filas.
4. SI el rol `anon` ejecuta un `SELECT` sobre `candidate_results` ENTONCES la base de datos DEBERÁ devolver cero filas.
5. CUANDO un usuario autenticado consulte o modifique `candidate_results` ENTONCES el sistema DEBERÁ seguir permitiendo solo las filas cuyo `org_id` coincida con el de su perfil, mediante `org_results_select`, `org_results_insert` y `org_results_update`.
6. CUANDO la migración de endurecimiento se escriba ENTONCES DEBERÁ ser idempotente y DEBERÁ dejar constancia en un comentario de que la escritura del flujo público pasa exclusivamente por rutas de servidor con `service_role`.
7. CUANDO un candidato complete una entrevista después del endurecimiento ENTONCES el resultado DEBERÁ quedar persistido con su evaluación, transcripción, duración y estado final, verificado por el Requisito 10.

### Requisito 5 — Escritura de sesiones de informes desde el servidor

**Historia de usuario:** Como cliente sin cuenta que toma una sesión de informes, quiero que mi sesión se guarde correctamente sin que la clave anon pueda crear ni modificar sesiones de otras personas.

#### Criterios de aceptación

1. CUANDO se escriba la migración de reconstrucción ENTONCES el sistema DEBERÁ declarar en `supabase/migrations/` el estado actual de las políticas `anon_insert_sessions` y `anon_update_own_session` de `info_sessions`, que hoy solo existen en la base real, antes de modificarlas.
2. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ dejar `info_sessions` sin ninguna política que otorgue `INSERT` o `UPDATE` al rol `anon`.
3. SI el rol `anon` ejecuta un `INSERT` o un `UPDATE` sobre `info_sessions` ENTONCES la base de datos DEBERÁ rechazar la operación o modificar cero filas.
4. CUANDO un cliente inicie una sesión en `/informes/{courseId}` ENTONCES una ruta de servidor DEBERÁ crear la fila en `info_sessions`, resolver `org_id` en el servidor a partir del `courseId` y devolver una credencial de sesión con al menos 128 bits de entropía.
5. CUANDO la ruta de creación devuelva la credencial de sesión ENTONCES el sistema DEBERÁ almacenar en la base únicamente su forma no reversible, y NO DEBERÁ aceptar el identificador de la sesión como sustituto de la credencial.
6. CUANDO el cliente sincronice la transcripción o las objeciones detectadas ENTONCES una ruta de servidor DEBERÁ exigir la credencial de sesión y DEBERÁ escribir exclusivamente en la fila asociada a esa credencial.
7. CUANDO el cliente actualice el estado de la sesión, el modo de cierre, el correo o el teléfono ENTONCES una ruta de servidor DEBERÁ exigir la credencial de sesión y DEBERÁ escribir exclusivamente en la fila asociada a esa credencial.
8. SI una petición de escritura de sesión de informes llega sin credencial, con una credencial inválida o con una credencial que no corresponde al identificador de sesión indicado ENTONCES el sistema DEBERÁ responder `401` o `403` y DEBERÁ dejar la fila sin cambios.
9. CUANDO la ruta de escritura reciba un objeto de actualización ENTONCES DEBERÁ aplicar solo las columnas que el flujo del cliente modifica (`transcript`, `objections_detected`, `status`, `closing_mode`, `client_email`, `client_phone`), y DEBERÁ descartar el resto.
10. CUANDO el asesor marque la sesión como atendida ENTONCES el cliente DEBERÁ enterarse dentro de los 10 segundos siguientes sin que el rol `anon` obtenga lectura sobre filas de `info_sessions` distintas de la suya.
11. SI el rol `anon` ejecuta un `SELECT` sobre `info_sessions` sin credencial ENTONCES la base de datos DEBERÁ devolver cero filas.
12. CUANDO un asesor autenticado use el panel de informes ENTONCES el sistema DEBERÁ seguir devolviendo las sesiones y notificaciones de su organización a través de `coachStore` y `src/app/actions/courses.ts`.

### Requisito 6 — Autenticación con transición en `api/invite-candidates`

**Historia de usuario:** Como operador del sistema, quiero cerrar el endpoint de invitaciones sin cortar las integraciones que ya lo usan, para que nadie cree tickets ni envíe correos en nombre de la plataforma y al mismo tiempo las postulaciones sigan funcionando.

#### Criterios de aceptación

1. CUANDO `applyToJob` necesite invitar a un candidato ENTONCES el sistema DEBERÁ invocar una función compartida del servidor en lugar de hacer una petición HTTP a `/api/invite-candidates`.
2. CUANDO la lógica de invitación se extraiga a una función compartida ENTONCES la ruta `/api/invite-candidates` y `applyToJob` DEBERÁN producir el mismo resultado observable para una misma entrada: ticket creado, invitación registrada y correo enviado.
3. CUANDO la función compartida cree un ticket de entrevista ENTONCES DEBERÁ usar un cliente con `service_role`, de modo que la creación no dependa de que exista una sesión autenticada.
4. MIENTRAS `INVITE_API_ENFORCE` tenga el valor `log`, el sistema DEBERÁ procesar la petición y DEBERÁ registrar un evento por cada llamada cuya cabecera `x-api-key` falte o no coincida con `MAKE_WEBHOOK_SECRET`.
5. CUANDO el sistema registre una llamada sin cabecera válida ENTONCES el registro DEBERÁ incluir marca de tiempo, presencia o ausencia de la cabecera, `user-agent`, `referer`, dirección IP de origen, número de destinatarios y el identificador de la vacante, y NO DEBERÁ incluir el valor de la cabecera ni el secreto configurado.
6. MIENTRAS `INVITE_API_ENFORCE` tenga el valor `enforce`, el sistema DEBERÁ responder `401` a toda petición cuya cabecera `x-api-key` falte o no coincida con `MAKE_WEBHOOK_SECRET`, sin crear tickets, sin registrar invitaciones y sin enviar correos.
7. SI `INVITE_API_ENFORCE` no está definida ENTONCES el sistema DEBERÁ comportarse como en el valor `log`.
8. SI `INVITE_API_ENFORCE` tiene el valor `enforce` y `MAKE_WEBHOOK_SECRET` no está definida ENTONCES el sistema DEBERÁ responder `500` con un mensaje que indique la falta de configuración, y NO DEBERÁ aceptar peticiones como si estuvieran autenticadas.
9. CUANDO se documente la transición ENTONCES el spec DEBERÁ fijar la condición que habilita `enforce`: cero eventos de llamada sin cabecera válida durante 7 días consecutivos de operación normal.
10. CUANDO se prepare el despliegue ENTONCES `MAKE_WEBHOOK_SECRET` e `INVITE_API_ENFORCE` DEBERÁN estar declaradas en `.env.example` con una descripción de su efecto.
11. CUANDO `INVITE_API_ENFORCE` cambie de valor ENTONCES el cambio DEBERÁ surtir efecto sin modificar código de la ruta.

### Requisito 7 — Retirada de políticas anon innecesarias en telemetría y notificaciones

**Historia de usuario:** Como operador del sistema, quiero eliminar las políticas abiertas que ninguna ruta usa, para que la superficie pública se limite a lo que el producto necesita.

#### Criterios de aceptación

1. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ eliminar la política `Enable insert for all users` de `interview_telemetry`.
2. SI el rol `anon` ejecuta un `INSERT` sobre `interview_telemetry` ENTONCES la base de datos DEBERÁ rechazar la operación por violación de política.
3. CUANDO `src/app/api/chat/route.ts` registre telemetría ENTONCES DEBERÁ construir el cliente exigiendo `SUPABASE_SERVICE_ROLE_KEY`, sin recurrir a `NEXT_PUBLIC_SUPABASE_ANON_KEY` como alternativa.
4. SI `SUPABASE_SERVICE_ROLE_KEY` no está definida ENTONCES el registro de telemetría DEBERÁ omitirse dejando una advertencia en el log del servidor, y la respuesta de la entrevista DEBERÁ continuar con normalidad.
5. CUANDO se aplique la migración de endurecimiento ENTONCES el sistema DEBERÁ eliminar la política `service_insert_notifications` de `coach_notifications`.
6. CUANDO `/api/info-notify` inserte una notificación ENTONCES la operación DEBERÁ seguir funcionando con `service_role`, que no está sujeto a RLS.
7. CUANDO un asesor autenticado lea sus notificaciones o las marque como leídas ENTONCES el sistema DEBERÁ seguir permitiéndolo con las políticas de `authenticated` existentes.
8. CUANDO un administrador abra `/admin/telemetry` ENTONCES el sistema DEBERÁ seguir mostrando las filas de `interview_telemetry` con la política de `authenticated` existente.

### Requisito 8 — Resolución explícita de la política de creación de organizaciones

**Historia de usuario:** Como operador del sistema, quiero una decisión registrada sobre la política `Users can insert organization`, para que el linter deje de reportar un hallazgo que ya evaluamos.

#### Criterios de aceptación

1. CUANDO el diseño evalúe la política `Users can insert organization` ENTONCES DEBERÁ registrar si se acota o se acepta, con el motivo y el impacto sobre el onboarding.
2. DONDE la decisión sea acotar la política, el sistema DEBERÁ exigir que quien inserta la organización quede asociado a ella y DEBERÁ conservar la capacidad de completar el onboarding de un usuario nuevo sin organización previa.
3. DONDE la decisión sea aceptar la política, el spec DEBERÁ documentar la excepción con su justificación y el riesgo residual concreto: creación de organizaciones vacías por cualquier usuario con sesión.
4. CUANDO un usuario nuevo complete el onboarding después del endurecimiento ENTONCES el sistema DEBERÁ crear su organización y su perfil sin errores de política.

### Requisito 9 — Reconstrucción de la deriva entre repositorio y base

**Historia de usuario:** Como equipo de desarrollo, quiero que las políticas del repositorio describan las de la base real, para que un despliegue limpio produzca el mismo estado de autorización que producción.

#### Criterios de aceptación

1. CUANDO se inventaríen las políticas ENTONCES el spec DEBERÁ listar, para cada tabla del flujo público (`interview_tickets`, `candidate_results`, `roles`, `organizations`, `info_sessions`, `coach_notifications`, `interview_telemetry`, `candidates`, `candidate_invites`), las políticas presentes en la base real y las declaradas en `supabase/migrations/`.
2. CUANDO el inventario detecte una política presente en la base y ausente en las migraciones ENTONCES el sistema DEBERÁ declararla en una migración de reconstrucción antes de modificarla o eliminarla.
3. CUANDO el inventario detecte una política declarada en las migraciones y ausente en la base ENTONCES el spec DEBERÁ registrar la diferencia y su efecto sobre el flujo público.
4. CUANDO se escriba cualquier migración de este spec ENTONCES DEBERÁ ser idempotente: aplicarla dos veces DEBERÁ dejar el mismo estado final, usando `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.
5. CUANDO se escriba cualquier migración de este spec ENTONCES DEBERÁ incluir en el mismo archivo las sentencias inversas comentadas que restauran el estado anterior de cada política eliminada.
6. CUANDO las migraciones de este spec se nombren ENTONCES DEBERÁN seguir la convención de orden temporal ya usada en `supabase/migrations/`.
7. CUANDO el inventario termine ENTONCES el spec DEBERÁ indicar por cada política eliminada qué ruta de servidor o política de `authenticated` cubre el caso de uso que la política atendía.

### Requisito 10 — Preservación del flujo público de extremo a extremo

**Historia de usuario:** Como candidato o cliente sin cuenta, quiero completar mi entrevista o mi sesión de informes exactamente igual que antes del endurecimiento, para que el cierre de permisos no me deje fuera.

#### Criterios de aceptación

1. CUANDO un candidato abra un enlace de ticket válido, complete la entrevista y llegue a la pantalla final ENTONCES el sistema DEBERÁ persistir su resultado con evaluación, transcripción, duración y estado `completed`, sin ninguna sesión autenticada.
2. CUANDO un candidato use el enlace público de una vacante, se registre con nombre y correo, complete la entrevista y llegue a la pantalla final ENTONCES el sistema DEBERÁ persistir su resultado con `source = 'public_link'`, sin ninguna sesión autenticada.
3. CUANDO un cliente abra `/informes/{courseId}`, complete la sesión y esta se cierre ENTONCES el sistema DEBERÁ persistir la sesión con su transcripción, objeciones detectadas, modo de cierre y estado final, sin ninguna sesión autenticada.
4. CUANDO un cliente solicite la atención de un asesor durante una sesión de informes ENTONCES el sistema DEBERÁ registrar la notificación y DEBERÁ reflejar en la interfaz del cliente que el asesor atendió, según el Requisito 5 criterio 10.
5. CUANDO un candidato converse con el entrevistador de IA ENTONCES `/api/chat` DEBERÁ seguir respondiendo con normalidad después de los cambios del Requisito 7.
6. CUANDO un visitante sin cuenta postule a una vacante publicada ENTONCES el sistema DEBERÁ seguir creando el candidato, la invitación y el ticket, y enviando el correo, según el Requisito 6 criterios 1 a 3.
7. SI cualquiera de los recorridos anteriores falla después de aplicar los cambios en un entorno de pruebas ENTONCES el spec DEBERÁ tratar el endurecimiento correspondiente como no cumplido, y la aplicación a producción DEBERÁ detenerse.
8. CUANDO se verifique la preservación ENTONCES el spec DEBERÁ incluir un guion manual de navegador con los pasos y el resultado esperado de los tres recorridos: `/interview/t/[token]`, `/interview/public/[publicToken]` y `/informes/[courseId]`.
9. CUANDO el guion manual se ejecute ENTONCES DEBERÁ registrar por cada paso el resultado observado y las peticiones de red que devolvieron un código de error.

### Requisito 11 — Observabilidad de intentos de escritura ajena

**Historia de usuario:** Como operador del sistema, quiero detectar los intentos de escribir sobre entrevistas o sesiones ajenas una vez cerradas las políticas, para saber si alguien está sondeando el sistema.

#### Criterios de aceptación

1. CUANDO una ruta de servidor rechace una escritura por falta de prueba de acceso ENTONCES el sistema DEBERÁ registrar un evento con marca de tiempo, ruta, motivo del rechazo, identificador solicitado, dirección IP de origen y `user-agent`.
2. CUANDO una ruta de servidor rechace una escritura porque el identificador pertenece a otra entrevista u otra sesión ENTONCES el sistema DEBERÁ registrar el evento con un motivo distinguible del rechazo por credencial ausente.
3. CUANDO el sistema registre un evento de rechazo ENTONCES el registro NO DEBERÁ incluir el valor de tokens, credenciales de sesión ni el contenido de transcripciones.
4. CUANDO el sistema registre un evento de rechazo ENTONCES el registro DEBERÁ usar un prefijo estable y común a todas las rutas endurecidas, de forma que los eventos se puedan filtrar en los logs de la plataforma de despliegue con una sola búsqueda.
5. CUANDO una escritura sea rechazada ENTONCES la respuesta al cliente DEBERÁ limitarse al código de estado y a un motivo genérico, sin el detalle que se registra en el servidor.
6. CUANDO el spec documente la observabilidad ENTONCES DEBERÁ indicar dónde se consultan estos eventos y qué frecuencia de rechazos amerita revisión.

### Requisito 12 — Cobertura de pruebas automatizadas

**Historia de usuario:** Como equipo de desarrollo, quiero pruebas que fallen si alguien reabre una política o quita una validación, para que este endurecimiento no se deshaga en silencio.

#### Criterios de aceptación

1. CUANDO se ejecute la suite con `vitest` ENTONCES DEBERÁN existir pruebas de `/api/candidate-results` que fallen si un `POST` sin prueba de acceso obtiene una respuesta distinta de `401`.
2. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de `/api/candidate-results` que fallen si un `POST` o un `PATCH` con prueba de acceso válida logra escribir sobre un `id` que pertenece a otra entrevista.
3. CUANDO se ejecute la suite ENTONCES DEBERÁ existir una prueba que falle si un `PATCH` aplica claves fuera de la lista de columnas modificables.
4. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de la ruta de servidor del ticket para los casos token válido, inexistente, expirado y ya usado.
5. CUANDO se ejecute la suite ENTONCES DEBERÁ existir una prueba que falle si la ruta de marcado de usado modifica una fila cuyo token no coincide con el recibido.
6. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de las rutas de sesión de informes para los casos credencial válida, ausente, inválida y perteneciente a otra sesión.
7. CUANDO se ejecute la suite ENTONCES DEBERÁN existir pruebas de `/api/invite-candidates` que cubran los tres estados de `INVITE_API_ENFORCE`: `log` con cabecera ausente, `enforce` con cabecera ausente y `enforce` con cabecera válida.
8. CUANDO se ejecute la batería de sondas anon contra un entorno de pruebas ENTONCES DEBERÁ fallar si el rol `anon` consigue leer `interview_tickets`, leer `candidate_results`, leer la columna `public_token` de `roles`, leer columnas de facturación de `organizations`, insertar o actualizar `candidate_results`, insertar o actualizar `info_sessions`, o insertar `interview_telemetry`.
9. CUANDO la batería de sondas anon se ejecute ENTONCES DEBERÁ verificar también que el rol `anon` conserva la lectura de vacantes con `is_published = true` y de `name`, `slug` y `logo_url` de las organizaciones con vacantes publicadas.
10. CUANDO las sondas anon se ejecuten ENTONCES DEBERÁN usar únicamente la clave anon pública y DEBERÁN apuntar a un entorno distinto de producción, determinado por variables de entorno.
11. CUANDO se ejecute la suite completa del proyecto ENTONCES DEBERÁ pasar sin regresiones en las pruebas existentes de `src/__tests__/`.

### Requisito 13 — Rastreabilidad del endurecimiento

**Historia de usuario:** Como revisor del cambio, quiero ver qué se cerró, qué lo sustituye y qué queda abierto a propósito, para poder aprobar el cambio sin reconstruir la investigación.

#### Criterios de aceptación

1. CUANDO el spec entregue el diseño ENTONCES DEBERÁ incluir una tabla que relacione cada política eliminada o acotada con la tabla afectada, la migración que la elimina, el sustituto que cubre su caso de uso y el requisito que la justifica.
2. CUANDO el spec entregue el diseño ENTONCES DEBERÁ listar los privilegios que el rol `anon` conserva después del endurecimiento, con el flujo público que justifica cada uno.
3. CUANDO el spec identifique un riesgo residual aceptado ENTONCES DEBERÁ registrarlo con su motivo, en lugar de omitirlo.
4. CUANDO una ruta de servidor nueva se añada ENTONCES el spec DEBERÁ documentar su contrato: método, entrada, prueba de acceso exigida, salida y códigos de error.

### Requisito 14 — Aplicación controlada de los cambios de base de datos

**Historia de usuario:** Como operador del sistema, quiero decidir yo cuándo y cómo se aplican estos cambios a la base, para que un error de política no deje a los candidatos sin poder completar entrevistas.

#### Criterios de aceptación

1. MIENTRAS este spec esté en ejecución, el sistema DEBERÁ limitarse a producir requisitos, diseño, tareas, código de aplicación y archivos de migración, sin ejecutar ninguna sentencia contra ninguna base de datos.
2. CUANDO una tarea genere una migración ENTONCES DEBERÁ dejarla como archivo en `supabase/migrations/` sin aplicarla.
3. CUANDO el spec describa la aplicación ENTONCES DEBERÁ establecer este orden: respaldo del estado actual de políticas y privilegios, aplicación en entorno de pruebas, ejecución del guion manual del Requisito 10, ejecución de las sondas del Requisito 12 y, solo entonces, decisión explícita del usuario sobre producción.
4. CUANDO el spec describa la aplicación ENTONCES DEBERÁ incluir el procedimiento de reversión de cada migración y el criterio para ejecutarlo: cualquier fallo de los recorridos del Requisito 10.
5. CUANDO el código de aplicación se despliegue ENTONCES DEBERÁ funcionar tanto con las políticas antiguas como con las nuevas, de modo que el despliegue del código y la aplicación de las migraciones puedan ocurrir en momentos distintos.
6. SI el despliegue del código y la aplicación de las migraciones ocurren en momentos distintos ENTONCES el spec DEBERÁ indicar cuál va primero y por qué.

## Fuera de alcance

- Autenticación de candidatos: los flujos públicos siguen siendo anónimos por diseño.
- Limitación de tasa y protección contra abuso por volumen en las rutas públicas: no se añade, se registra como riesgo residual.
- Rotación o caducidad de los `public_token` de vacantes existentes.
- Cifrado o retención de las transcripciones ya almacenadas en `candidate_results` e `info_sessions`.
- Redacción del contenido de prompts y respuestas guardado en `interview_telemetry`.
- Revisión de las políticas del módulo social (`posts`, `follows`, `groups`, `hashtags`, `endorsements`) y de las de Stripe, ya tratadas en `202607290002_stripe_revoke_anon_execute.sql`.
- Revisión de las políticas del Centro de Capacitación, cubiertas por el spec `training-center-repair`.
- Migración de la política `public_career_fair_candidates_insert` de `candidates`, que ya está acotada por `source = 'career-fair'`.
- Aplicación de las migraciones a cualquier base de datos, incluida la de producción (Requisito 14).
- Rediseño visual de las páginas de entrevista y de informes.
