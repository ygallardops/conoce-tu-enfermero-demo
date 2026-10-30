"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ResultPhoto({ record }: { record: PublicRecord }) {
  const [failed, setFailed] = useState(false);

  if (!record.foto_url || failed) return null;

  return (
    // The production adapter allows only approved photo hosts. The demo deliberately
    // uses synthetic paths, so an unavailable image is simply left out.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="result-photo"
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
  const [hasRequestError, setHasRequestError] = useState(false);
  const [formAlert, setFormAlert] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileElement = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const resultsSection = useRef<HTMLElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!__TURNSTILE_SITE_KEY__ || !turnstileElement.current) return;
    const render = () => {
      if (!window.turnstile || turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileElement.current!, {
        sitekey: __TURNSTILE_SITE_KEY__,
        action: "consulta_publica",
        callback: (token: string) => {
          setTurnstileToken(token);
          setFormAlert(null);
        },
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    };
    const existing = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile"]');
    if (existing) { render(); return; }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.append(script);
  }, []);

  useEffect(() => {
    if (!hasSearched || isLoading || !resultsHeading.current) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsHeading.current.focus({ preventScroll: true });
    resultsSection.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [hasSearched, isLoading]);

  const example = useMemo(
    () => (searchType === "cep" ? "00001" : "PERSONA SINTETICA 001"),
    [searchType],
  );
  const searchHelp = searchType === "cep"
    ? "Usa 5 o 6 dígitos; puede iniciar con cero."
    : "Escribe el nombre completo tal como aparece en el padrón.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    setFormAlert(null);

    if (!trimmed) {
      setResults([]);
      setUpdatedAt(null);
      setHasSearched(false);
      setFormAlert("Ingresa un número CEP o un nombre completo antes de consultar.");
      return;
    }

    if (__TURNSTILE_SITE_KEY__ && !turnstileToken) {
      setResults([]);
      setUpdatedAt(null);
      setHasSearched(false);
      setFormAlert("Completa la verificación «Verifique que es un ser humano» antes de consultar.");
      return;
    }

    setIsLoading(true);
    setMessage("Consultando padrón público…");
    setHasSearched(true);
    setHasRequestError(false);

    try {
      const response = await fetch("/api/v1/consulta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: searchType,
          valor: trimmed,
          turnstile_token: turnstileToken,
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
      setHasRequestError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible completar la consulta. Inténtalo nuevamente.",
      );
    } finally {
      setIsLoading(false);
      if (__TURNSTILE_SITE_KEY__) {
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
      }
    }
  }

  function changeSearchType(nextType: SearchType) {
    setSearchType(nextType);
    setValue("");
    setResults([]);
    setUpdatedAt(null);
    setHasSearched(false);
    setHasRequestError(false);
    setFormAlert(null);
    setMessage("Ingresa un dato para iniciar una consulta.");
  }

  return (
    <div className="site-shell" data-brand-profile={brand.id}>
      <header className="topbar">
        <div className="container">
          <a className="brand" href="#consulta">{brand.productName}</a>
          <span className="issuer">{brand.issuerName}</span>
        </div>
      </header>
      <div className="phase-banner">
        <p className="container">
          <strong className="phase-tag">{brand.environmentLabel}</strong>
          <span>{brand.disclaimer}</span>
        </p>
      </div>

      <main className="container page">
      <section id="consulta" className="intro" aria-labelledby="page-title">
        <h1 id="page-title">Verifica si un profesional de enfermería está habilitado</h1>
        <p className="lead">
          Busca por número de colegiatura o por nombre completo. Es gratis y no necesitas registrarte.
        </p>
      </section>

      <section className="consultation" aria-label="Formulario de consulta">
        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="search-type">
            <legend>¿Cómo quieres buscar?</legend>
            <label className="radio">
              <input
                type="radio"
                name="tipo"
                checked={searchType === "cep"}
                onChange={() => changeSearchType("cep")}
              />
              Número CEP
            </label>
            <label className="radio">
              <input
                type="radio"
                name="tipo"
                checked={searchType === "nombre"}
                onChange={() => changeSearchType("nombre")}
              />
              Nombre completo
            </label>
          </fieldset>

          <div className={searchType === "cep" ? "field field--cep" : "field"}>
            <label htmlFor="consulta-valor">
              {searchType === "cep" ? "Número de colegiatura CEP" : "Nombre completo del profesional"}
            </label>
            <p id="consulta-help" className="field-help">
              {searchHelp}
            </p>
            <input
              id="consulta-valor"
              name="valor"
              value={value}
              onChange={(event) => {
                setFormAlert(null);
                setValue(
                  searchType === "cep"
                    ? event.target.value.replace(/\D/g, "").slice(0, 6)
                    : event.target.value,
                );
              }}
              placeholder={`Ejemplo: ${example}`}
              autoComplete="off"
              maxLength={searchType === "cep" ? 6 : 160}
              minLength={searchType === "cep" ? 5 : 3}
              inputMode={searchType === "cep" ? "numeric" : "text"}
              pattern={searchType === "cep" ? "[0-9]{5,6}" : undefined}
              aria-describedby="consulta-help consulta-status"
            />
          </div>
          <div ref={turnstileElement} className="turnstile" aria-label="Verificación anti-bots" />
          {formAlert ? <p className="form-alert" role="alert">{formAlert}</p> : null}
          <button className="search-submit" type="submit" disabled={isLoading}>
            {isLoading ? "Consultando…" : "Consultar"}
          </button>
        </form>
      </section>

      {hasSearched ? <section ref={resultsSection} className="results" aria-labelledby="resultados-title">
        <h2 ref={resultsHeading} id="resultados-title" tabIndex={-1}>Resultado</h2>
        {updatedAt ? <p className="updated-at">Datos actualizados al {formatDate(updatedAt)}</p> : null}

        <p id="consulta-status" className="status-message" role="status" aria-live="polite">
          {message}
        </p>

        {!hasRequestError && results.length === 0 && !isLoading ? (
          <div className="empty-state">
            <strong>Sin coincidencias exactas</strong>
            <p>Comprueba la escritura. Para probar la demo, usa {example}.</p>
          </div>
        ) : null}

        {results.map((record) => {
          const enabled = record.estado_habilidad === "Habilitado";
          return (
            <article className="result" key={record.num_cep}>
              <div className={`status-panel status-panel--${enabled ? "enabled" : "disabled"}`}>
                <p className="status-label">Estado de habilidad</p>
                <p className="status-value">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={enabled ? "M4 12.5l5 5L20 6.5" : "M6 6l12 12M18 6L6 18"} />
                  </svg>
                  {record.estado_habilidad}
                </p>
                {enabled ? null : (
                  <p className="status-detail">No figura como habilitado para ejercer a la fecha de actualización.</p>
                )}
              </div>
              <div className="result-identification">
                <ResultPhoto record={record} />
                <p className="result-name">{record.nombres_completos}</p>
              </div>
              <dl className="summary">
                <div>
                  <dt>Número CEP</dt>
                  <dd className="cep">{record.num_cep}</dd>
                </div>
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
          );
        })}

        <p className="again"><a href="#consulta">Hacer otra consulta</a></p>
      </section> : null}
      </main>

      <footer className="footer">
        <p className="container">{brand.productName}</p>
      </footer>
    </div>
  );
}
