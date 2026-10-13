-- =============================================================================
-- Mensajería (huecos encontrados por supabase/tests/security/30_messaging.sql)
--
-- 1) messages (mensajes directos): cualquier manager / admin leía y podía
--    borrar los mensajes privados de cualquier persona de la empresa. En el
--    chat actual (chat_messages) solo los participantes leen; aquí igual.
-- 2) broadcasts (avisos a todo el huerto): cualquier usuario con sesión
--    (runner, QC…) podía enviar un aviso "urgent" a todo su huerto. En la app
--    solo el manager envía avisos. Editar/borrar: manager/admin de ese huerto.
-- =============================================================================

-- 1) Mensajes directos: solo remitente y destinatario
DROP POLICY IF EXISTS "messages_view_policy" ON public.messages;   -- incluía is_manager()
DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages; -- incluía is_manager()
DROP POLICY IF EXISTS "Delete own sent messages" ON public.messages;
CREATE POLICY "Delete own sent messages" ON public.messages FOR DELETE TO authenticated
    USING (sender_id = auth.uid());

-- 2) Avisos
DROP POLICY IF EXISTS "broadcasts_insert_policy" ON public.broadcasts;
CREATE POLICY "broadcasts_insert_policy" ON public.broadcasts FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND orchard_id = public.get_my_orchard_id()
        AND public.is_role(ARRAY['manager', 'admin'])
    );

DROP POLICY IF EXISTS "broadcasts_update_policy" ON public.broadcasts;
CREATE POLICY "broadcasts_update_policy" ON public.broadcasts FOR UPDATE TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']))
    WITH CHECK (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']));

DROP POLICY IF EXISTS "broadcasts_delete_policy" ON public.broadcasts;
CREATE POLICY "broadcasts_delete_policy" ON public.broadcasts FOR DELETE TO authenticated
    USING (orchard_id = public.get_my_orchard_id() AND public.is_role(ARRAY['manager', 'admin']));
