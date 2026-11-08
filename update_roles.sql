-- شغّليه مرة وحدة من Supabase > SQL Editor (بعد supabase_setup.sql)
-- المدير التنفيذي: يقرأ المهام والاجتماعات، ويكتب بالاجتماعات فقط، ويرسل طلب اجتماع.
-- الملاحظات والتنبيهات الأخرى: لمديرة المكتب فقط.
drop policy if exists "members read docs" on public.docs;
drop policy if exists "manager inserts docs" on public.docs;
drop policy if exists "manager updates docs" on public.docs;
drop policy if exists "manager deletes docs" on public.docs;
drop policy if exists "read docs" on public.docs;
drop policy if exists "insert docs" on public.docs;
drop policy if exists "update docs" on public.docs;
drop policy if exists "delete docs" on public.docs;

create policy "read docs" on public.docs for select to authenticated using (
  public.my_role() = 'manager'
  or (public.my_role() in ('ceo', 'marketer') and collection in ('tasks', 'employees', 'config', 'meetings'))
  or (public.my_role() = 'ceo' and collection = 'alerts' and data->>'type' in ('meeting_request', 'minutes')));

create policy "insert docs" on public.docs for insert to authenticated with check (
  public.my_role() = 'manager'
  or (public.my_role() = 'ceo' and (collection = 'meetings' or (collection = 'alerts' and data->>'type' in ('meeting_request', 'minutes')))));

create policy "update docs" on public.docs for update to authenticated
  using (public.my_role() = 'manager' or (public.my_role() = 'ceo' and collection = 'meetings'))
  with check (public.my_role() = 'manager' or (public.my_role() = 'ceo' and collection = 'meetings'));

create policy "delete docs" on public.docs for delete to authenticated using (public.my_role() = 'manager');
