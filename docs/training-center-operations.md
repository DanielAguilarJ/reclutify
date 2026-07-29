# Centro de Capacitación — Operaciones

Guía operativa del módulo de capacitación (`/admin/training` y `/training/*`): cómo diagnosticar el entorno, qué migraciones aplicar y en qué orden, y qué hay que verificar a mano en un despliegue.

Está pensada para ejecutar pasos, no para leerse de corrido. Los comandos asumen la raíz del repositorio.

---

## 1. Diagnóstico del entorno

El módulo depende de tablas, columnas nulables, funciones RPC, un bucket privado de storage y membresía en `org_members`. Si algo de eso falta, el flujo se rompe. El diagnóstico dice **qué** falta y **qué migración lo provee**.

### Cómo ejecutarlo

- **Desde el panel:** abre `/admin/training`. El banner de diagnóstico (`src/components/admin/TrainingDiagnosticsBanner.tsx`) se consulta automáticamente al cargar y solo aparece cuando algún check crítico falla, listando cada elemento con su remediación. Si la petición de diagnóstico falla, el panel se carga igual y el banner no aparece.
- **Directo:**

  ```bash
  # requiere sesión con rol owner o admin en la organización
  curl -s -b cookies.txt https://<host>/api/training/diagnostics | jq
  curl -s -b cookies.txt 'https://<host>/api/training/diagnostics?orgId=<uuid>' | jq
  ```

  `orgId` es opcional: si se omite se resuelve desde `user_profiles.org_id` del usuario autenticado. Un usuario sin rol `owner` ni `admin` recibe `403`. El endpoint no es público porque revela estructura interna de la base de datos.

### Cómo leer la respuesta

`ok` es `true` solo si ningún check de severidad `critical` está en `missing`. Cada check trae `status`:

| `status` | Significado | Acción |
|---|---|---|
| `ok` | El elemento existe y cumple lo esperado. | Ninguna. |
| `missing` | El elemento falta o no cumple (p. ej. una columna que sigue siendo `NOT NULL`). | Aplicar la migración indicada en `remediation`. |
| `unknown` | La estrategia usada no pudo determinar el estado. | Aplicar `202607280001_training_environment_report.sql` y repetir el diagnóstico. |

`unknown` aparece cuando el reporte se obtuvo **por sondeo**. El campo `source` lo indica:

- `source: "rpc"` — se usó `training_environment_report()`. Reporte completo y preciso.
- `source: "probe"` — la función de reporte no existe todavía, así que el endpoint cayó al sondeo ligero (`select` con `limit 0` por tabla, `listBuckets()`, `rpc()` con argumentos inválidos por función). Detecta lo esencial, pero hay elementos que no puede determinar (nulabilidad de columnas, índices, atributos del bucket) y quedan en `unknown`. Los `unknown` no cuentan como fallo y no invalidan `ok`.

`OPENROUTER_API_KEY` ausente se reporta como `warning`, no como fallo crítico, así que no invalida `ok`. Lo que deja de funcionar está en la sección 6.

---

## 2. Migraciones de esta reparación

Dos archivos nuevos en `supabase/migrations/`:

| Migración | Qué provee | Riesgo |
|---|---|---|
| `202607280001_training_environment_report.sql` | La función `public.training_environment_report()`, que introspecciona tablas, nulabilidad de columnas, funciones, bucket e índices y devuelve `JSONB`. `SECURITY DEFINER`, `EXECUTE` solo para `service_role`. Nunca lanza excepción: lo ausente se reporta como `false`. | **Inocuo.** Solo añade una función de lectura de catálogos. Sin ella, el diagnóstico funciona en modo sondeo con estados `unknown`. |
| `202607280002_training_v2_consolidated_repair.sql` | Reparación consolidada: reaplica el contenido de `202607180002`–`202607180005` (funciones transaccionales, guarda de desasociación de documentos, arranque de módulo, correcciones de acceso), crea el bucket privado `training-documents`, hace backfill de `org_members` y recarga el schema cache de PostgREST. | **Medio.** Es DDL sobre datos reales. Ver la advertencia de la sección 4. |

`supabase/repair_training_v2.sql` se conserva como **camino manual equivalente** a la segunda migración: mismo contenido, para cuando no haya acceso al CLI y haya que pegarlo en el SQL Editor. No hace falta ejecutar ambos.

---

## 3. Cómo aplicarlas

### Opción A — CLI de Supabase (recomendada)

```bash
supabase link --project-ref <project-ref>   # solo la primera vez
supabase migration list                     # ver qué falta en remoto
supabase db push                            # aplica TODAS las pendientes, en orden
```

`supabase db push` aplica las migraciones pendientes en orden de nombre de archivo. Ese es el comportamiento deseado: ver la precondición de la sección 5.

### Opción B — SQL Editor del Dashboard

Abre el SQL Editor del proyecto y pega el contenido de cada archivo pendiente, **en orden de nombre**, uno por ejecución:

1. `supabase/migrations/202607180001_training_v2_foundation.sql` (si falta)
2. `supabase/migrations/202607280001_training_environment_report.sql`
3. `supabase/migrations/202607280002_training_v2_consolidated_repair.sql` — o, de forma equivalente, `supabase/repair_training_v2.sql`

Después de aplicar, repite el diagnóstico y confirma `ok: true` y `source: "rpc"`.

---

## 4. Advertencia de riesgo

> **`202607280002_training_v2_consolidated_repair.sql` debe aplicarse primero en un entorno de pruebas y con respaldo. Nunca directamente en producción sin confirmación explícita del responsable.**

La migración es idempotente por diseño (`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` antes de cada política, `INSERT ... ON CONFLICT`, `UPDATE` acotados por `NOT EXISTS`), así que reaplicarla sobre una base ya migrada es seguro. **La idempotencia no elimina el riesgo:** sigue siendo DDL ejecutándose sobre datos reales, redefine funciones y políticas RLS en uso y hace backfill de `org_members`. Un error de permisos o de política deja la sección de administración inaccesible.

Secuencia mínima antes de tocar producción:

1. Respaldo de la base de datos (`supabase db dump` o el snapshot del Dashboard).
2. Aplicar en un proyecto de pruebas o en una rama de base de datos.
3. Ejecutar el diagnóstico ahí y confirmar `ok: true`.
4. Recorrer a mano los casos de la sección 7.
5. Con eso verificado y confirmación explícita, aplicar en producción.

---

## 5. Precondición: el orden importa

La migración consolidada **no crea las tablas** de `202607180001_training_v2_foundation.sql`. Solo define funciones, permisos, políticas y datos que dependen de ellas.

Su sección 0 comprueba la precondición y, si falta algo, aborta con un mensaje accionable en lugar de un `relation does not exist` opaco:

```
training_v2_foundation_missing: faltan public.training_program_documents, ...
— aplica 20260530_training_center.sql y 202607180001_training_v2_foundation.sql
antes de esta migración
```

También aborta con `training_v2_foundation_missing` si falta `public.is_training_admin`.

Si ves ese error, **no intentes forzar la migración consolidada.** El orden correcto es aplicar todas las migraciones pendientes en orden de nombre de archivo (`supabase db push` lo hace solo), no ejecutar únicamente la consolidada.

---

## 6. Variables de entorno del módulo

Ver [`.env.example`](../.env.example) para la lista completa del proyecto. Lo que este módulo necesita:

| Variable | Obligatoria | Efecto si falta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | El módulo no funciona. El diagnóstico lo reporta como fallo crítico. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Igual que la anterior. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Igual que la anterior. Es la clave que usan las rutas de servidor para storage y RPCs. |
| `OPENROUTER_API_KEY` | No (con matiz) | La subida y el procesamiento de documentos siguen funcionando, solo **sin resumen ni temas** (el documento queda `ready` igual). En cambio, las rutas que dependen de la IA responden `503`: generación de módulos, tutor IA del chat y **calificación de preguntas abiertas** en las evaluaciones. Módulos con preguntas solo cerradas sí se evalúan. El diagnóstico la reporta como `warning`, no como fallo crítico. |
| `TRAINING_AI_MODEL` | No | Usa el valor por defecto (`google/gemini-2.5-flash`). |
| `TRAINING_CONTEXT_CHAR_BUDGET` | No | Usa el valor por defecto (300.000 caracteres de documentos por generación). Solo acepta un entero positivo; cualquier otro valor —vacío, `0`, negativo, decimal, texto— cae al defecto sin degradar la generación. Súbelo únicamente si el modelo configurado en `TRAINING_AI_MODEL` tiene ventana de contexto para más; la justificación del número está en `src/lib/training/document-context.ts`. Si el material de un programa no cabe, la respuesta de la generación incluye `contextNotice` con los documentos truncados y lo mismo queda en el log del servidor. |

---

## 7. Subida de documentos: por qué es directa a Storage

Esto es lo que hay que entender antes de tocar la subida.

La plataforma de despliegue (Vercel) **rechaza peticiones con cuerpo grande —alrededor de 4.5 MB— en la capa de plataforma, con `413`, antes de que el handler de la ruta se ejecute.** Ningún cambio dentro del handler puede evitarlo.

Consecuencias operativas:

- `POST /api/training/documents` es el **camino heredado**: sirve para archivos pequeños y para las pruebas existentes. No lo uses como camino principal.
- La interfaz (`/admin/training/configure/[programId]`) usa el **flujo de tres pasos**, en el que el archivo nunca pasa por la plataforma:
  1. `POST /api/training/documents/upload-url` → devuelve `{ documentId, storagePath, signedUrl, token }`. JSON pequeño, sin problema de tamaño.
  2. `uploadToSignedUrl(path, token, file)` desde el navegador, directo a Supabase Storage. El techo real es el `file_size_limit` del bucket (15 MB).
  3. `POST /api/training/documents/process` → descarga el objeto en el servidor, valida, extrae texto, crea fragmentos y la asociación.
- **Probar la subida solo en local es engañoso:** el límite de cuerpo no existe en `next dev`, así que un PDF que falla en producción funciona sin problema en la máquina de desarrollo. Cualquier cambio en la subida se valida en una vista previa desplegada, no en local.

---

## 8. Verificación manual pendiente de entorno

Estos casos no se pueden cubrir con pruebas unitarias porque dependen de la plataforma de despliegue. Ejecútalos contra una **vista previa desplegada**:

- [ ] Subir un PDF de más de 5 MB. Es el caso que falla por el límite de cuerpo de petición y funciona en local.
- [ ] Subir un archivo de 20 MB y confirmar que se rechaza sin dejar objeto huérfano en el bucket.
- [ ] Renombrar un `.exe` a `.pdf` y confirmar el rechazo por `FILE_TYPE_MISMATCH`, con borrado del objeto.
- [ ] Recorrido completo: generar módulos, publicar, contratar, abrir el enlace del empleado, completar un módulo con evaluación.
---

## 9. Seguridad: permisos de las funciones RPC

Esta sección existe porque el módulo tuvo una vulnerabilidad real: las 15 funciones `SECURITY DEFINER` del esquema `public` eran ejecutables por el rol `anon`, es decir por cualquiera con la clave pública del proyecto, vía `POST /rest/v1/rpc/<nombre>`.

### El patrón correcto para funciones nuevas

```sql
REVOKE ALL     ON FUNCTION public.mi_funcion(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mi_funcion(UUID, TEXT) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mi_funcion(UUID, TEXT) TO service_role;
```

Las tres líneas, en ese orden. **`REVOKE ... FROM PUBLIC` por sí solo no cierra nada en Supabase**, y esa fue la causa raíz del agujero:

- PostgreSQL concede `EXECUTE` a `PUBLIC` al crear una función. Revocarlo es necesario.
- Pero Supabase además concede `EXECUTE` **a los roles `anon` y `authenticated` por nombre**, mediante `ALTER DEFAULT PRIVILEGES` sobre el esquema `public`. Son entradas de ACL distintas de la de `PUBLIC`.
- Revocar del pseudo-rol `PUBLIC` no toca una concesión nominal. La función sigue expuesta por PostgREST con la clave anon, aunque la migración *parezca* haberla cerrado.

Por eso hay que revocar de cada rol por nombre. Y por eso el `GRANT` va al final: así el orden de aplicación nunca deja a `service_role` sin el permiso que sí necesita.

### Ninguna función del módulo debe ser ejecutable por `anon` ni `authenticated`

No es una preferencia de estilo: **estas funciones autorizan con parámetros que envía el llamante**, no con `auth.uid()`.

- `hire_training_candidate(...)` y compañía comprueban la membresía de `p_actor_user_id`, un UUID que viaja en el cuerpo de la petición. Quien pueda invocar la función elige quién dice ser.
- `finalize_training_evaluation(...)` recibe `p_score` como parámetro: el empleado podría cerrar su evaluación con la nota que quiera.

El modelo de seguridad del módulo está en las rutas de servidor: verifican la sesión, la organización y el rol, y solo entonces llaman a la RPC con `createAdminClient()` (`service_role`). Todas las llamadas del producto salen de ahí, así que revocar `anon`/`authenticated` no cambia ningún comportamiento. Si una función del módulo necesita ser llamada desde el navegador, la respuesta no es concederle `authenticated`: es añadir una ruta de servidor que la envuelva.

Migraciones que aplican este endurecimiento:

| Migración | Alcance |
|---|---|
| `202607290001_training_revoke_anon_execute.sql` | Las 12 funciones transaccionales del módulo, más `training_environment_report()` y `is_training_admin` (a esta solo `anon`). Al final avisa con `WARNING` de cualquier función `SECURITY DEFINER` de `public` que siga expuesta. |
| `202607290002_stripe_revoke_anon_execute.sql` | `update_org_subscription`. Requiere que el despliegue ya use `service_role` en el webhook de Stripe. |

### Excepción: `is_training_admin(UUID)`

Conserva `EXECUTE` para `authenticated`. Las políticas RLS de las tablas de capacitación la invocan y **se evalúan con el rol del llamante**: si se le revoca `authenticated`, el panel de administración deja de poder leer sus propias tablas. A esta función se le revoca solo `anon`.

Es segura en ese rol porque no acepta identidad como parámetro: resuelve al usuario con `auth.uid()` y devuelve un booleano. Un llamante no puede pedirla «como si fuera» otro usuario.

### Cómo comprobarlo

Esta consulta debe devolver **solo** la fila de `is_training_admin` con `authenticated`. Cualquier otra fila es una función expuesta a la API pública:

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       r.rolname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
ORDER BY p.proname, r.rolname;
```

Comprobación desde fuera, sin credenciales de base de datos: una función cerrada responde `404` con la clave anon, no `400` ni `200`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$SUPABASE_URL/rest/v1/rpc/hire_training_candidate" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d '{}'
```

Y el informe de advisors de seguridad del proyecto, que lista funciones expuestas y `search_path` mutable:

```bash
supabase db advisors --linked       # requiere CLI v2.81.3 o superior
# o el panel: Dashboard → Advisors → Security Advisor
```

`search_path` mutable se corrige aparte, en `202607290004_set_function_search_path.sql`, con `ALTER FUNCTION ... SET search_path = public` sobre las funciones de trigger que se crearon sin esa cláusula. Las funciones del módulo ya la declaran en su definición (`SET search_path = public`); mantenla en cualquier función nueva.
