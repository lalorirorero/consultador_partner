"use client";

import { useState, FormEvent } from "react";

interface SearchResponse {
  rut: string;
  nombre: string;
  estatus: string;
  disponible: boolean;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSearched(true);

    try {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Error al consultar.");
      }
      setResult(data as SearchResponse);
    } catch (err: any) {
      setError(err?.message || "Error al consultar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="logo-img"
          src="/logo-geovictoria.png"
          alt="GeoVictoria"
        />
      </header>

      <main className="container">
        <h1 className="title">Buscador de RUTs</h1>
        <p className="help">
          Para buscar una empresa, ingresa su RUT sin puntos y con guion. Si la
          empresa se encuentra en negociación con nosotros o ya es cliente
          directo de GeoVictoria, aparecerá como{" "}
          <strong>&ldquo;No Disponible&rdquo;</strong>. En caso contrario, se
          mostrará como <strong>&ldquo;Disponible&rdquo;</strong>.
        </p>

        <form onSubmit={handleSearch}>
          <div className="card">
            <div className="band">Nombre o RUT</div>
            <div className="card-body">
              <div className="search-row">
                <input
                  className="search-input"
                  type="text"
                  placeholder="Ej: 777777777-0 o GeoVictoria"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                <button className="search-btn" type="submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : "Buscar"}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="band">Estatus</div>
            <div className="card-body">
              {loading && <span className="placeholder">Consultando…</span>}

              {!loading && error && <span className="error">{error}</span>}

              {!loading && !error && result && (
                <div className="result">
                  <span className="rut">{result.rut}</span>
                  {result.nombre ? (
                    <>
                      <span className="sep">|</span>
                      <span className="nombre">{result.nombre}</span>
                    </>
                  ) : null}
                  <span className="sep">|</span>
                  <span
                    className={result.disponible ? "status-si" : "status-no"}
                  >
                    {result.estatus}
                  </span>
                </div>
              )}

              {!loading && !error && !result && (
                <span className="placeholder">
                  {searched
                    ? "Sin resultados."
                    : "El resultado de la búsqueda aparecerá aquí."}
                </span>
              )}
            </div>
          </div>
        </form>
      </main>
    </>
  );
}
