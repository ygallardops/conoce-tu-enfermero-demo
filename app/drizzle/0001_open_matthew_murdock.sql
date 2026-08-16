CREATE UNIQUE INDEX IF NOT EXISTS `idx_padron_single_active`
ON `padron_snapshots` (`status`) WHERE `status` = 'active';--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ck_padron_snapshots_status_insert`
BEFORE INSERT ON `padron_snapshots`
WHEN NEW.`status` NOT IN ('staging', 'active', 'retired')
BEGIN
	SELECT RAISE(ABORT, 'ck_padron_snapshots_status');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ck_padron_snapshots_status_update`
BEFORE UPDATE OF `status` ON `padron_snapshots`
WHEN NEW.`status` NOT IN ('staging', 'active', 'retired')
BEGIN
	SELECT RAISE(ABORT, 'ck_padron_snapshots_status');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ck_padron_estado_habilidad_insert`
BEFORE INSERT ON `padron_publico`
WHEN NEW.`estado_habilidad` NOT IN ('Habilitado', 'Inhabilitado')
BEGIN
	SELECT RAISE(ABORT, 'ck_padron_estado_habilidad');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `ck_padron_estado_habilidad_update`
BEFORE UPDATE OF `estado_habilidad` ON `padron_publico`
WHEN NEW.`estado_habilidad` NOT IN ('Habilitado', 'Inhabilitado')
BEGIN
	SELECT RAISE(ABORT, 'ck_padron_estado_habilidad');
END;
