"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { BrandProfile } from "@/lib/brand";

type SearchType = "cep" | "nombre";

type PublicRecord = {
  num_cep: string;
  nombres_completos: string;
  consejo_regional: string;
  estado_habilidad: "Habilitado" | "Inhabilitado";
  fecha_actualizacion: string;
  foto_url: string | null;
};

type ConsultaResponse = {
  request_id: string;
  resultados: PublicRecord[];
  total: number;
  datos_actualizados_al: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter((word) => !["PERSONA", "SINTETICA"].includes(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ResultAvatar({ record }: { record: PublicRecord }) {
  const [failed, setFailed] = useState(false);

  if (!record.foto_url || failed) {
    return (
      <span className="result-avatar result-avatar--placeholder" aria-hidden="true">
        {initials(record.nombres_completos)}
      </span>
    );
  }

  return (
    // The production adapter allows only approved photo hosts. The demo deliberately
    // uses synthetic paths, so an unavailable image degrades to the initials avatar.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="result-avatar"
      src={record.foto_url}
      alt={`Fotografía pública de ${record.nombres_completos}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function ConsultaClient({ brand }: { brand: BrandProfile }) {
  const [searchType, setSearchType] = useState<SearchType>("cep");
  const [value, setValue] = useState("");
  const [results, setResults] = useState<PublicRecord[]>([]);
  const [message, setMessage] = useState("Ingresa un dato para iniciar una consulta.");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const example = useMemo(
    () => (searchType === "cep" ? "D100001" : "PERSONA SINTETICA 001"),
    [searchType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();

    if (!trimmed) {
      setResults([]);
      setUpdatedAt(null);
      setHasSearched(false);
      setMessage("Ingresa un número CEP o un nombre completo.");
      return;
    }

    setIsLoading(true);
    setMessage("Consultando padrón público…");
    setHasSearched(true);

    try {
      const response = await fetch("/api/v1/consulta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: searchType,
          valor: trimmed,
          turnstile_token: "local-demo-token",
        }),
      });
      const body = (await response.json()) as ConsultaResponse & {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(body.error?.message ?? "No fue posible completar la consulta.");
      }

      setResults(body.resultados);
      setUpdatedAt(body.datos_actualizados_al);
      setMessage(
        body.total === 0
          ? "No encontramos coincidencias exactas. Revisa el dato e inténtalo nuevamente."
          : `${body.total} coincidencia${body.total === 1 ? "" : "s"} encontrada${body.total === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setResults([]);
      setUpdatedAt(null);
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible completar la consulta. Inténtalo nuevamente.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function changeSearchType(nextType: SearchType) {
    setSearchType(nextType);
    setValue("");
    setResults([]);
    setUpdatedAt(null);
    setHasSearched(false);
    setMessage("Ingresa un dato para iniciar una consulta.");
  }

  return (
    <main
      className="site-shell"
      style={
        {
          "--brand-primary": brand.tokens.primary,
          "--brand-primary-dark": brand.tokens.primaryDark,
        } as CSSProperties
      }
    >
      <header className="topbar">
        <a className="brand" href="#consulta" aria-label={`${brand.productName}, ir a la consulta`}>
          <span className="brand-mark" aria-hidden="true">ED</span>
          <span>
            <strong>{brand.productName}</strong>
            <small>{brand.issuerName}</small>
          </span>
        </a>
        <span className="environment-tag">{brand.environmentLabel}</span>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Consulta ciudadana · datos de demostración</p>
        <h1 id="page-title">Verifica la colegiatura y habilidad profesional.</h1>
        <p className="hero-copy">
          Busca una coincidencia exacta por número CEP o nombre completo. Esta versión usa un padrón sintético y no emite constancias oficiales.
        </p>
      </section>

      <section id="consulta" className="consultation-card" aria-labelledby="consulta-title">
        <div className="consultation-heading">
          <div>
            <p className="eyebrow">Consulta pública</p>
            <h2 id="consulta-title">Consulta a un profesional</h2>
          </div>
          <span className="limit-note">Máximo 5 resultados</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="search-type" aria-label="Tipo de consulta">
            <legend>Buscar por</legend>
            <button
              className={searchType === "cep" ? "search-option search-option--selected" : "search-option"}
              type="button"
              aria-pressed={searchType === "cep"}
              onClick={() => changeSearchType("cep")}
            >
              Número CEP
            </button>
            <button
              className={searchType === "nombre" ? "search-option search-option--selected" : "search-option"}
              type="button"
              aria-pressed={searchType === "nombre"}
              onClick={() => changeSearchType("nombre")}
            >
              Nombre completo
            </button>
          </fieldset>

          <label className="search-label" htmlFor="consulta-valor">
            {searchType === "cep" ? "Número de colegiatura CEP" : "Nombre completo del profesional"}
          </label>
          <div className="search-row">
            <input
              id="consulta-valor"
              name="valor"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={`Ejemplo: ${example}`}
              autoComplete="off"
              maxLength={searchType === "cep" ? 20 : 160}
              inputMode={searchType === "cep" ? "text" : "text"}
              aria-describedby="consulta-help consulta-status"
            />
            <button className="search-submit" type="submit" disabled={isLoading}>
              {isLoading ? "Consultando…" : "Consultar"}
            </button>
          </div>
          <p id="consulta-help" className="field-help">
            Solo se admiten coincidencias exactas. No se permiten listados, comodines ni descargas.
          </p>
        </form>
      </section>

      <section className="results" aria-labelledby="resultados-title">
        <div className="results-heading">
          <div>
            <p className="eyebrow">Resultado de la consulta</p>
            <h2 id="resultados-title">Estado de colegiatura</h2>
          </div>
          {updatedAt ? <span className="updated-at">Datos actualizados: {formatDate(updatedAt)}</span> : null}
        </div>

        <p id="consulta-status" className="status-message" role="status" aria-live="polite">
          {message}
        </p>

        {hasSearched && results.length === 0 && !isLoading ? (
          <div className="empty-state">
            <strong>Sin coincidencias exactas</strong>
            <p>Comprueba la escritura. Para probar la demo, usa {example}.</p>
          </div>
        ) : null}

        <div className="result-grid">
          {results.map((record) => (
            <article className="result-card" key={record.num_cep}>
              <div className="result-identification">
                <ResultAvatar record={record} />
                <div>
                  <p className="result-name">{record.nombres_completos}</p>
                  <p className="result-cep">CEP {record.num_cep}</p>
                </div>
              </div>
              <span className={`ability-status ability-status--${record.estado_habilidad === "Habilitado" ? "enabled" : "disabled"}`}>
                <span aria-hidden="true">{record.estado_habilidad === "Habilitado" ? "●" : "◆"}</span>
                {record.estado_habilidad}
              </span>
              <dl className="result-details">
                <div>
                  <dt>Consejo regional</dt>
                  <dd>{record.consejo_regional}</dd>
                </div>
                <div>
                  <dt>Fecha de actualización</dt>
                  <dd>{formatDate(record.fecha_actualizacion)}</dd>
                </div>
              </dl>
              <p className="result-disclaimer">La consulta demo no constituye una constancia oficial.</p>
            </article>
          ))}
        </div>
      </section>

      <aside className="disclaimer" aria-label="Información de la demostración">
        <strong>{brand.disclaimer}</strong>
        <span>La producción incorporará controles Turnstile, rate limiting y una proyección pública validada.</span>
      </aside>

      <footer className="footer">
        <span>{brand.productName}</span>
        <span>Arquitectura serverless · Consulta sin registro</span>
      </footer>
    </main>
  );
}
