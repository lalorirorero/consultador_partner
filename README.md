# Buscador de RUTs — GeoVictoria

Página web que replica el buscador de RUTs de la planilla de GeoVictoria.
El usuario ingresa un **RUT** (sin puntos, con guion, ej. `77029999-9`) o el
**nombre** de una empresa y la app consulta **en vivo** una tabla de
**Zoho Analytics**:

- Si el RUT/empresa **está** en la tabla (en negociación con nosotros) → **No Disponible** (rojo).
- Si **no está** → **Disponible** (verde).

Resultado mostrado: `77865944-1 | Norte Verde SpA | No Disponible`.

## Stack

- **Next.js 14** (App Router) + React, desplegado en **Vercel**.
- Página cliente (`app/page.tsx`) con el buscador.
- API route `app/api/buscar/route.ts` que consulta Zoho Analytics (API v2).
- Caché en memoria del servidor con TTL ~5 min (`lib/zoho.ts`).

## Lógica

La **presencia** del RUT en la tabla = **No Disponible**. La **ausencia** =
**Disponible**. Los RUTs se normalizan en ambos lados (se quitan puntos,
espacios y guion, y la `K` pasa a minúscula), de modo que `77.865.944-1` y
`77865944-1` coinciden. También se permite búsqueda por substring del nombre.

## Variables de entorno

Todas las credenciales se leen de variables de entorno (nunca hardcodeadas).
Ver `.env.example`. Para desarrollo local copia ese archivo a `.env.local`.

| Variable             | Descripción                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `ZOHO_DC`            | Data center: `com` / `eu` / `in` / `com.au` / `jp`                 |
| `ZOHO_CLIENT_ID`     | Client ID del Self Client de Zoho                                  |
| `ZOHO_CLIENT_SECRET` | Client Secret del Self Client                                      |
| `ZOHO_REFRESH_TOKEN` | Refresh token (scope `ZohoAnalytics.data.read`)                    |
| `ZOHO_ORG_ID`        | ORG ID de Zoho Analytics (cabecera `ZANALYTICS-ORGID`)             |
| `ZOHO_WORKSPACE_ID`  | `1943489000000004001`                                              |
| `ZOHO_VIEW_ID`       | `1943489000048875306`                                              |
| `ZOHO_RUT_COLUMN`    | Nombre EXACTO de la columna de RUT en la tabla                     |
| `ZOHO_NAME_COLUMN`   | Nombre EXACTO de la columna de nombre / razón social              |

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completa las credenciales
npm run dev                  # http://localhost:3000
```

## Despliegue en Vercel

1. Importa el repo en Vercel (framework detectado: Next.js).
2. En **Project Settings → Environment Variables**, carga todas las variables
   de la tabla anterior (Production y Preview).
3. Deploy.

## Cómo generar las credenciales de Zoho (Self Client)

1. Entra a <https://api-console.zoho.com> con la cuenta que tiene acceso a la
   tabla de Zoho Analytics.
2. Crea (o abre) un cliente de tipo **Self Client** → copia el **Client ID** y
   el **Client Secret**.
3. En la pestaña **Generate Code**:
   - Scope: `ZohoAnalytics.data.read`
   - Time Duration: 10 min · Description: lo que quieras
   - Genera el **grant token** (código). Es de un solo uso y corta vida.
4. Intercambia el grant token por un **refresh token** (válido permanentemente):

   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=TU_CLIENT_ID" \
     -d "client_secret=TU_CLIENT_SECRET" \
     -d "code=GRANT_TOKEN"
   ```

   Guarda el `refresh_token` de la respuesta. (Si tu cuenta no es `.com`,
   cambia el dominio por `accounts.zoho.eu`, `.in`, `.com.au` o `.jp`.)
5. **ORG ID**: en Zoho Analytics, ícono ⚙ (Settings) → **Organization** /
   **Admin**, o en la URL del panel de administración. Es el valor que va en la
   cabecera `ZANALYTICS-ORGID`.

Carga `Client ID`, `Client Secret`, `Refresh Token` y `ORG ID` en las variables
de entorno correspondientes.
