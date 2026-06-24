import { NextRequest, NextResponse } from "next/server";
import { searchPartner } from "@/lib/zoho";

// Esta ruta consulta Zoho Analytics, por lo que debe ejecutarse en el runtime
// de Node y nunca cachearse estáticamente.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get("q") || "").trim();

  if (!query) {
    return NextResponse.json(
      { error: "Ingresa un RUT o nombre de empresa." },
      { status: 400 },
    );
  }

  try {
    const result = await searchPartner(query);
    // Presencia en la tabla = está en negociación = "No Disponible".
    // Ausencia = "Disponible".
    const estatus = result.found ? "No Disponible" : "Disponible";
    return NextResponse.json({
      rut: result.rut,
      nombre: result.nombre,
      estatus,
      disponible: !result.found,
    });
  } catch (err: any) {
    console.error("Error en /api/buscar:", err);
    return NextResponse.json(
      { error: err?.message || "Error consultando Zoho Analytics." },
      { status: 500 },
    );
  }
}
