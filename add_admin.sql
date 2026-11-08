-- شغّليه بعد ما تنشئين الحساب الجديد من Authentication > Users > Add user (مع Auto Confirm)
-- غيّري الإيميل والاسم حسب الشخص. اسم المستخدم بالدخول = الجزء قبل @
-- 1) حساب الرئيس التنفيذي الجديد (كل الصلاحيات)
insert into public.profiles (id, name, role)
select id, 'الرئيس التنفيذي', 'admin' from auth.users where email = 'president@shahnat.team'
on conflict (id) do update set role = excluded.role, name = excluded.name;

-- 2) إعطاء المدير التنفيذي الحالي كل الصلاحيات أيضاً
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'ceo@shahnat.team');

-- للتأكد:
select p.name, p.role, u.email from public.profiles p join auth.users u on u.id = p.id;
