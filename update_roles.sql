-- شغّليه من Supabase > SQL Editor (آمن للتشغيل أكثر من مرة)
-- الأدوار: manager (مديرة المكتب) + admin (الرئيس التنفيذي) = كل الصلاحيات،
-- ceo (المدير التنفيذي) = الاجتماعات فقط (إلا لو غيّرتِ دوره إلى admin)، marketer = اطلاع فقط.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('manager', 'admin', 'ceo', 'marketer'));

create or replace function public.is_full() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(role in ('manager', 'admin'), false) from public.profiles where id = auth.uid()
$$;

drop policy if exists "members read docs" on public.docs;
drop policy if exists "manager inserts docs" on public.docs;
drop policy if exists "manager updates docs" on public.docs;
drop policy if exists "manager deletes docs" on public.docs;
drop policy if exists "read docs" on public.docs;
drop policy if exists "insert docs" on public.docs;
drop policy if exists "update docs" on public.docs;
drop policy if exists "delete docs" on public.docs;

create policy "read docs" on public.docs for select to authenticated using (
  public.is_full()
  or (public.my_role() in ('ceo', 'marketer') and collection in ('tasks', 'employees', 'config', 'meetings'))
  or (public.my_role() = 'ceo' and collection = 'alerts' and data->>'type' in ('meeting_request', 'minutes')));

create policy "insert docs" on public.docs for insert to authenticated with check (
  public.is_full()
  or (public.my_role() = 'ceo' and (collection = 'meetings' or (collection = 'alerts' and data->>'type' in ('meeting_request', 'minutes')))));

create policy "update docs" on public.docs for update to authenticated
  using (public.is_full() or (public.my_role() = 'ceo' and collection = 'meetings'))
  with check (public.is_full() or (public.my_role() = 'ceo' and collection = 'meetings'));

create policy "delete docs" on public.docs for delete to authenticated using (public.is_full());

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('manager', 'ceo', 'admin'));

drop policy if exists "manager uploads attachments" on storage.objects;
drop policy if exists "manager deletes attachments" on storage.objects;
create policy "manager uploads attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_full());
create policy "manager deletes attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_full());
