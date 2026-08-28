-- V22: RBAC — SuperAdministrador role seed + vigente flag on ctr_roles_user
-- Apply to: each TENANT database (ctr_roles lives in tenant schema)

-- Seed SuperAdministrador role with fixed id=2 to avoid ambiguity
INSERT INTO ctr_roles (id_rol, descripcion, vigente)
VALUES (2, 'SuperAdministrador', 1)
ON CONFLICT (id_rol) DO UPDATE SET descripcion = EXCLUDED.descripcion;

-- Advance the sequence past the seeded rows so new roles start at id=3+
SELECT SETVAL('ctr_roles_id_rol_seq', GREATEST((SELECT MAX(id_rol) FROM ctr_roles), 2));

-- Fast-path vigente flag on ctr_roles_user so we can deactivate in O(1)
ALTER TABLE ctr_roles_user
    ADD COLUMN IF NOT EXISTS vigente SMALLINT NOT NULL DEFAULT 1;

-- Backfill: cross-check with admin table — mark as inactive if admin record is inactive
UPDATE ctr_roles_user ru
   SET vigente = 0
 FROM ctr_roles_user_admin rua
WHERE ru.id_usuario = rua.id_usuario
  AND ru.id_rol     = rua.id_rol
  AND COALESCE(rua.vigente, 1) = 0;
