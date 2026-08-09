// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const padronSnapshots = sqliteTable(
  "padron_snapshots",
  {
    datasetVersion: text("dataset_version").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    generatedAt: text("generated_at").notNull(),
    source: text("source").notNull(),
    recordCount: integer("record_count").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    status: text("status", { enum: ["staging", "active", "retired"] })
      .notNull()
      .default("staging"),
    importedAt: text("imported_at").notNull(),
  },
  (table) => [index("idx_padron_snapshots_status").on(table.status)],
);

export const padronPublico = sqliteTable(
  "padron_publico",
  {
    datasetVersion: text("dataset_version")
      .notNull()
      .references(() => padronSnapshots.datasetVersion, { onDelete: "cascade" }),
    numCep: text("num_cep").notNull(),
    nombresCompletos: text("nombres_completos").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),
    consejoRegional: text("consejo_regional").notNull(),
    estadoHabilidad: text("estado_habilidad", {
      enum: ["Habilitado", "Inhabilitado"],
    }).notNull(),
    fechaActualizacion: text("fecha_actualizacion").notNull(),
    fotoUrl: text("foto_url"),
  },
  (table) => [
    primaryKey({ columns: [table.datasetVersion, table.numCep] }),
    index("idx_padron_cep_version").on(table.numCep, table.datasetVersion),
    index("idx_padron_nombre_version").on(
      table.nombreNormalizado,
      table.datasetVersion,
    ),
  ],
);
