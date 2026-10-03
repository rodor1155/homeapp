-- APPLIED to project fybpmpnfocaxhqiwiyhs on 4 Oct 2026.
-- public.rls_auto_enable() is an event-trigger helper; it must not be callable
-- through the REST API by anon/authenticated (Supabase advisor 0028/0029).
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
