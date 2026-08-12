export type PublicRecord = {
  num_cep: string;
  nombres_completos: string;
  consejo_regional: string;
  estado_habilidad: "Habilitado" | "Inhabilitado";
  fecha_actualizacion: string;
  foto_url: string | null;
};

export async function queryPublicRegistry(
  db: D1Database,
  input: { tipo: "cep" | "nombre"; valor: string },
): Promise<{ records: PublicRecord[]; generatedAt: string } | null> {
  const predicate = input.tipo === "cep" ? "p.num_cep = ?" : "p.nombre_normalizado = ?";
  const query = `SELECT
      p.num_cep,
      p.nombres_completos,
      p.consejo_regional,
      p.estado_habilidad,
      p.fecha_actualizacion,
      p.foto_url
    FROM padron_publico p
    INNER JOIN padron_snapshots s ON s.dataset_version = p.dataset_version
    WHERE s.status = 'active' AND ${predicate}
    ORDER BY p.nombres_completos ASC
    LIMIT 5`;
  const [activeResult, recordsResult] = await db.batch([
    db.prepare(
      "SELECT generated_at FROM padron_snapshots WHERE status = 'active' ORDER BY generated_at DESC LIMIT 1",
    ),
    db.prepare(query).bind(input.valor),
  ]);
  const active = activeResult.results[0] as { generated_at?: string } | undefined;
  if (!active?.generated_at) return null;
  return {
    records: recordsResult.results as unknown as PublicRecord[],
    generatedAt: active.generated_at,
  };
}
