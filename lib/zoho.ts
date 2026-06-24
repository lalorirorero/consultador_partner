// Cliente de Zoho Analytics (API v2) con caché en memoria.
//
// Flujo:
//  1. Obtener un access token a partir del refresh token (OAuth v2).
//  2. Leer todas las filas de la vista (tabla) de Zoho Analytics.
//  3. Construir un índice normalizado RUT -> Nombre para búsquedas rápidas.
//
// Todas las credenciales se leen desde variables de entorno. Nunca se
// hardcodean valores sensibles.

type ZohoRow = Record<string, string>;

export interface PartnerRecord {
  rut: string; // RUT tal como viene en la tabla
  nombre: string; // Nombre / razón social tal como viene en la tabla
  rutNorm: string; // RUT normalizado para comparar
  nombreNorm: string; // Nombre normalizado para buscar por substring
}

interface DatasetCache {
  records: PartnerRecord[];
  byRut: Map<string, PartnerRecord>;
  fetchedAt: number;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// TTL del dataset en memoria (~5 minutos).
const DATASET_TTL_MS = 5 * 60 * 1000;
// Margen de seguridad para refrescar el token antes de que expire.
const TOKEN_SKEW_MS = 60 * 1000;

let datasetCache: DatasetCache | null = null;
let tokenCache: TokenCache | null = null;

function env(name: string, required = true): string {
  const value = process.env[name];
  if (required && (!value || value.trim() === "")) {
    throw new Error(
      `Falta la variable de entorno ${name}. Configúrala en Vercel y en .env.local.`,
    );
  }
  return (value ?? "").trim();
}

// Normaliza un RUT: quita puntos, espacios y guion, y pasa la K a minúscula.
// Así "77.865.944-1" y "77865944-1" coinciden.
export function normalizeRut(value: string): string {
  return (value || "")
    .toString()
    .replace(/[.\s-]/g, "")
    .toLowerCase();
}

// Normaliza texto para búsqueda por substring (sin acentos, minúsculas).
export function normalizeText(value: string): string {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ¿El término ingresado parece un RUT? (mayoría de dígitos, opcional dígito
// verificador K). Lo usamos para decidir el modo de búsqueda.
export function looksLikeRut(value: string): boolean {
  const norm = normalizeRut(value);
  return /^\d{6,}[0-9k]?$/.test(norm);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - TOKEN_SKEW_MS > now) {
    return tokenCache.accessToken;
  }

  const dc = env("ZOHO_DC"); // com / eu / in / com.au / jp
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: env("ZOHO_REFRESH_TOKEN"),
    client_id: env("ZOHO_CLIENT_ID"),
    client_secret: env("ZOHO_CLIENT_SECRET"),
  });

  const url = `https://accounts.zoho.${dc}/oauth/v2/token?${params.toString()}`;
  const res = await fetch(url, { method: "POST" });
  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inesperada al pedir token a Zoho: ${text.slice(0, 300)}`);
  }

  if (!res.ok || !json.access_token) {
    throw new Error(
      `No se pudo obtener access token de Zoho (${res.status}): ${
        json.error || text.slice(0, 300)
      }`,
    );
  }

  const expiresInSec = Number(json.expires_in) || 3600;
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + expiresInSec * 1000,
  };
  return tokenCache.accessToken;
}

async function fetchAllRows(): Promise<ZohoRow[]> {
  const dc = env("ZOHO_DC");
  const workspaceId = env("ZOHO_WORKSPACE_ID");
  const viewId = env("ZOHO_VIEW_ID");
  const orgId = env("ZOHO_ORG_ID");

  const accessToken = await getAccessToken();

  const config = encodeURIComponent(JSON.stringify({ responseFormat: "json" }));
  const url = `https://analyticsapi.zoho.${dc}/restapi/v2/workspaces/${workspaceId}/views/${viewId}/data?CONFIG=${config}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "ZANALYTICS-ORGID": orgId,
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inesperada al leer la vista de Zoho: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    throw new Error(
      `Error al leer datos de Zoho Analytics (${res.status}): ${
        json?.data?.errorMessage || json?.errorMessage || text.slice(0, 300)
      }`,
    );
  }

  // La API v2 puede devolver las filas en distintas envolturas según versión.
  // Cubrimos las formas más comunes.
  const rows: ZohoRow[] | undefined =
    json?.data ?? json?.response?.data ?? (Array.isArray(json) ? json : undefined);

  if (!Array.isArray(rows)) {
    throw new Error(
      `No se encontraron filas en la respuesta de Zoho. Estructura recibida: ${Object.keys(
        json || {},
      ).join(", ")}`,
    );
  }

  return rows;
}

function buildDataset(rows: ZohoRow[]): DatasetCache {
  const rutColumn = env("ZOHO_RUT_COLUMN");
  const nameColumn = env("ZOHO_NAME_COLUMN");

  const records: PartnerRecord[] = [];
  const byRut = new Map<string, PartnerRecord>();

  for (const row of rows) {
    const rawRut = row[rutColumn];
    const rawName = row[nameColumn];
    if (rawRut === undefined && rawName === undefined) continue;

    const rut = (rawRut ?? "").toString().trim();
    const nombre = (rawName ?? "").toString().trim();
    const rutNorm = normalizeRut(rut);
    if (!rutNorm && !nombre) continue;

    const record: PartnerRecord = {
      rut,
      nombre,
      rutNorm,
      nombreNorm: normalizeText(nombre),
    };
    records.push(record);
    if (rutNorm && !byRut.has(rutNorm)) {
      byRut.set(rutNorm, record);
    }
  }

  return { records, byRut, fetchedAt: Date.now() };
}

async function getDataset(): Promise<DatasetCache> {
  const now = Date.now();
  if (datasetCache && now - datasetCache.fetchedAt < DATASET_TTL_MS) {
    return datasetCache;
  }
  const rows = await fetchAllRows();
  datasetCache = buildDataset(rows);
  return datasetCache;
}

export interface SearchResult {
  found: boolean;
  rut: string; // RUT a mostrar (el de la tabla si se encontró, si no el ingresado)
  nombre: string; // Nombre a mostrar (vacío si no se encontró)
}

// Busca por RUT (presencia exacta normalizada) o por substring de nombre.
export async function searchPartner(query: string): Promise<SearchResult> {
  const term = (query || "").trim();
  if (!term) {
    return { found: false, rut: "", nombre: "" };
  }

  const dataset = await getDataset();

  if (looksLikeRut(term)) {
    const norm = normalizeRut(term);
    const match = dataset.byRut.get(norm);
    if (match) {
      return { found: true, rut: match.rut || term, nombre: match.nombre };
    }
    return { found: false, rut: term, nombre: "" };
  }

  // Búsqueda por nombre (substring).
  const termNorm = normalizeText(term);
  const match = dataset.records.find((r) => r.nombreNorm.includes(termNorm));
  if (match) {
    return { found: true, rut: match.rut, nombre: match.nombre };
  }
  return { found: false, rut: term, nombre: "" };
}
