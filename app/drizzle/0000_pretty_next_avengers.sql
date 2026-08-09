CREATE TABLE `padron_publico` (
	`dataset_version` text NOT NULL,
	`num_cep` text NOT NULL,
	`nombres_completos` text NOT NULL,
	`nombre_normalizado` text NOT NULL,
	`consejo_regional` text NOT NULL,
	`estado_habilidad` text NOT NULL,
	`fecha_actualizacion` text NOT NULL,
	`foto_url` text,
	PRIMARY KEY(`dataset_version`, `num_cep`),
	FOREIGN KEY (`dataset_version`) REFERENCES `padron_snapshots`(`dataset_version`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_padron_cep_version` ON `padron_publico` (`num_cep`,`dataset_version`);--> statement-breakpoint
CREATE INDEX `idx_padron_nombre_version` ON `padron_publico` (`nombre_normalizado`,`dataset_version`);--> statement-breakpoint
CREATE TABLE `padron_snapshots` (
	`dataset_version` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`generated_at` text NOT NULL,
	`source` text NOT NULL,
	`record_count` integer NOT NULL,
	`checksum_sha256` text NOT NULL,
	`status` text DEFAULT 'staging' NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_padron_snapshots_status` ON `padron_snapshots` (`status`);