-- مكتب تسويق شحنات — إعداد قاعدة البيانات (شغّليه مرة واحدة من SQL Editor في Supabase)

-- 1) مكان حفظ بيانات المكتب: المهام، الموظفين، الاجتماعات، ملف الشركة
create table if not exists public.docs (
  path        text primary key,
  collection  text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists docs_collection_idx on public.docs (collection);

-- 2) الحسابات والصلاحيات
create table if not exists public.profiles (
  id    uuid primary key references auth.users (id) on delete cascade,
  name  text not null default '',
  role  text not null check (role in ('manager', 'ceo', 'marketer'))
);

alter table public.docs enable row level security;
alter table public.profiles enable row level security;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

drop policy if exists "members read docs" on public.docs;
drop policy if exists "manager inserts docs" on public.docs;
drop policy if exists "manager updates docs" on public.docs;
drop policy if exists "manager deletes docs" on public.docs;
create policy "members read docs"    on public.docs for select to authenticated using (public.my_role() is not null);
create policy "manager inserts docs" on public.docs for insert to authenticated with check (public.my_role() = 'manager');
create policy "manager updates docs" on public.docs for update to authenticated using (public.my_role() = 'manager') with check (public.my_role() = 'manager');
create policy "manager deletes docs" on public.docs for delete to authenticated using (public.my_role() = 'manager');

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('manager', 'ceo'));

-- 3) التحديث المباشر (لما مديرة المكتب تغيّر شي، يظهر عند المدير التنفيذي فوراً)
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4) مرفقات المهام
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true)
on conflict (id) do nothing;
drop policy if exists "manager uploads attachments" on storage.objects;
drop policy if exists "manager deletes attachments" on storage.objects;
create policy "manager uploads attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.my_role() = 'manager');
create policy "manager deletes attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.my_role() = 'manager');
