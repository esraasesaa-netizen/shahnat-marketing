-- شغّليه بعد ما تعملي الحسابين من Authentication > Users > Add user
-- غيّري الأسماء إذا بدك. اسم المستخدم بالدخول = الجزء قبل @ (مثلاً esraa)

insert into public.profiles (id, name, role)
select id, 'إسراء', 'manager' from auth.users where email = 'esraa@shahnat.team'
on conflict (id) do update set role = excluded.role, name = excluded.name;

insert into public.profiles (id, name, role)
select id, 'المدير التنفيذي', 'ceo' from auth.users where email = 'ceo@shahnat.team'
on conflict (id) do update set role = excluded.role, name = excluded.name;

-- للتأكد:
select p.name, p.role, u.email from public.profiles p join auth.users u on u.id = p.id;
