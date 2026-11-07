-- PENDIENTE_SUPABASE_RLS.sql
-- ---------------------------------------------------------------------
-- Dos permisos que la extensión necesita y que hoy le faltan a la base.
-- Síntoma en la consola:
--   POST /rest/v1/sri_declaraciones?on_conflict=...  401 (Unauthorized)
--   PATCH /rest/v1/clients?id=eq....                 401 (Unauthorized)
--
-- El primero hace que el upsert caiga al INSERT directo. El segundo impide
-- marcar en la web el estado de la credencial SRI (tax_profile).
--
-- Ejecutar UNA sola vez en Supabase → SQL Editor.
-- Es aditivo: no borra datos ni cambia filas existentes.
-- ---------------------------------------------------------------------

-- 1) sri_declaraciones: el upsert necesita SELECT + INSERT + UPDATE.
--    Sin la política de UPDATE, PostgREST devuelve 401/42501 y el registro
--    existente nunca se actualiza (sustitutivas, PDF recuperado después).
DROP POLICY IF EXISTS "sri_declaraciones_anon_select" ON public.sri_declaraciones;
CREATE POLICY "sri_declaraciones_anon_select" ON public.sri_declaraciones
    FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "sri_declaraciones_anon_update" ON public.sri_declaraciones;
CREATE POLICY "sri_declaraciones_anon_update" ON public.sri_declaraciones
    FOR UPDATE TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.sri_declaraciones TO anon;

-- 2) clients: la extensión ya puede actualizar declaration_history, pero no
--    tax_profile (permiso de columna). Solo se habilita esa columna; el resto
--    de clients sigue igual.
GRANT UPDATE (tax_profile, updated_at) ON public.clients TO anon;

-- ---------------------------------------------------------------------
-- Verificación (opcional): deberían aparecer las políticas de anon.
-- ---------------------------------------------------------------------
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename IN ('sri_declaraciones', 'clients')
-- ORDER BY tablename, policyname;
