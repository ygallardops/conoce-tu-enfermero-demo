PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_padron_snapshots` (
	`dataset_version` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`source` text NOT NULL,
	`record_count` integer NOT NULL,
	`checksum_sha256` text NOT NULL,
	`status` text DEFAULT 'staging' NOT NULL,
	`imported_at` text NOT NULL,
	CONSTRAINT "ck_padron_snapshots_status" CHECK("__new_padron_snapshots"."status" in ('staging', 'active', 'retired'))
);
--> statement-breakpoint
INSERT INTO `__new_padron_snapshots`("dataset_version", "schema_version", "generated_at", "source", "record_count", "checksum_sha256", "status", "imported_at") SELECT "dataset_version", "schema_version", "generated_at", "source", "record_count", "checksum_sha256", "status", "imported_at" FROM `padron_snapshots`;--> statement-breakpoint
DROP TABLE `padron_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_padron_snapshots` RENAME TO `padron_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_padron_snapshots_status` ON `padron_snapshots` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_padron_single_active` ON `padron_snapshots` (`status`) WHERE "padron_snapshots"."status" = 'active';--> statement-breakpoint
CREATE TABLE `__new_padron_publico` (
	`dataset_version` text NOT NULL,
	`num_cep` text NOT NULL,
	`nombres_completos` text NOT NULL,
	`nombre_normalizado` text NOT NULL,
	`consejo_regional` text NOT NULL,
	`estado_habilidad` text NOT NULL,
	`fecha_actualizacion` text NOT NULL,
	`foto_url` text,
	PRIMARY KEY(`dataset_version`, `num_cep`),
	FOREIGN KEY (`dataset_version`) REFERENCES `padron_snapshots`(`dataset_version`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_padron_estado_habilidad" CHECK("__new_padron_publico"."estado_habilidad" in ('Habilitado', 'Inhabilitado'))
);
--> statement-breakpoint
INSERT INTO `__new_padron_publico`("dataset_version", "num_cep", "nombres_completos", "nombre_normalizado", "consejo_regional", "estado_habilidad", "fecha_actualizacion", "foto_url") SELECT "dataset_version", "num_cep", "nombres_completos", "nombre_normalizado", "consejo_regional", "estado_habilidad", "fecha_actualizacion", "foto_url" FROM `padron_publico`;--> statement-breakpoint
DROP TABLE `padron_publico`;--> statement-breakpoint
ALTER TABLE `__new_padron_publico` RENAME TO `padron_publico`;--> statement-breakpoint
CREATE INDEX `idx_padron_cep_version` ON `padron_publico` (`num_cep`,`dataset_version`);--> statement-breakpoint
CREATE INDEX `idx_padron_nombre_version` ON `padron_publico` (`nombre_normalizado`,`dataset_version`);