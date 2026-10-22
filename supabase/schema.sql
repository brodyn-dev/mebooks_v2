-- ============================================================
-- MeBooks v2 - schema lengkap untuk projek Supabase BARU (kosong).
-- Jalankan dalam SQL Editor sekali sahaja.
-- ============================================================
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 60),
  bio          text not null default '' check (char_length(bio) <= 280),
  avatar_url   text not null default '',
  is_private   boolean not null default false,  -- true = library & aktiviti hanya untuk pengikut
  created_at   timestamptz not null default now()
);

-- Auto cipta profil bila user daftar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), uname)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- BOOKS (katalog kongsi, satu rekod per ISBN-13)
-- ------------------------------------------------------------
create table public.books (
  id             uuid primary key default gen_random_uuid(),
  isbn13         text unique check (isbn13 is null or isbn13 ~ '^97[89][0-9]{10}$'),
  title          text not null check (char_length(title) between 1 and 300),
  authors        text not null default '' check (char_length(authors) <= 300),
  publisher      text not null default '',
  published_year text not null default '',
  cover_url      text not null default '',
  description    text not null default '' check (char_length(description) <= 2000),
  genre          text not null default '',
  page_count     integer not null default 0 check (page_count >= 0 and page_count <= 10000),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ------------------------------------------------------------
-- USER_BOOKS (rak peribadi: setiap user satu rekod per buku)
-- ------------------------------------------------------------
create table public.user_books (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  status       text not null default 'want' check (status in ('want', 'reading', 'finished')),
  current_page integer not null default 0 check (current_page >= 0),
  page_count   integer not null default 0 check (page_count >= 0 and page_count <= 10000),
  rating       smallint check (rating between 1 and 5),
  review       text not null default '' check (char_length(review) <= 5000),  -- awam
  is_public    boolean not null default true,  -- tunjuk dalam profil & feed
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, book_id),
  check (current_page <= page_count or page_count = 0)
);
create index user_books_user_idx on public.user_books(user_id);
create index user_books_book_idx on public.user_books(book_id);

-- ------------------------------------------------------------
-- BOOK_NOTES (nota PERIBADI - jadual berasingan supaya RLS lajur tak bocor)
-- ------------------------------------------------------------
create table public.book_notes (
  user_book_id uuid primary key references public.user_books(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  body         text not null default '' check (char_length(body) <= 5000),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- READING LOGS (sejarah setiap kemas kini progres)
-- ------------------------------------------------------------
create table public.reading_logs (
  id           bigint generated always as identity primary key,
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  from_page    integer not null,
  to_page      integer not null,
  created_at   timestamptz not null default now()
);
create index reading_logs_ub_idx on public.reading_logs(user_book_id, created_at desc);

-- ------------------------------------------------------------
-- FOLLOWS
-- ------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows(following_id);

-- ------------------------------------------------------------
-- ACTIVITY (feed awam; dijana SERVER sahaja, tiada data peribadi)
-- ------------------------------------------------------------
create table public.activity_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  user_book_id uuid not null references public.user_books(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  kind         text not null check (kind in ('started', 'progress', 'finished', 'rated')),
  page         integer,
  rating       smallint,
  created_at   timestamptz not null default now()
);
create index activity_user_idx on public.activity_events(user_id, created_at desc);
create index activity_created_idx on public.activity_events(created_at desc);

-- ============================================================
-- HELPER: updated_at
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger user_books_touch before update on public.user_books
  for each row execute function public.touch_updated_at();

-- ============================================================
-- GUARD: current_page & status hanya boleh diubah melalui log_progress()
-- (supaya setiap perubahan pasti tercatat dalam log & feed)
-- ============================================================
create or replace function public.guard_progress_fields()
returns trigger language plpgsql as $$
begin
  if (new.current_page is distinct from old.current_page
      or new.status is distinct from old.status)
     and coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    raise exception 'Gunakan log_progress() untuk kemas kini progres';
  end if;
  return new;
end;
$$;
create trigger user_books_guard before update on public.user_books
  for each row execute function public.guard_progress_fields();

-- ============================================================
-- RPC: log_progress - satu-satunya cara tukar muka surat / status
-- ============================================================
create or replace function public.log_progress(p_user_book_id uuid, p_page integer)
returns public.user_books
language plpgsql security definer set search_path = public as $$
declare
  ub        public.user_books;
  old_page  integer;
  old_status text;
  new_status text;
begin
  if auth.uid() is null then
    raise exception 'Perlu log masuk';
  end if;

  select * into ub from public.user_books
   where id = p_user_book_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Buku tidak dijumpai dalam rak kau';
  end if;

  if p_page < 0 then
    raise exception 'Muka surat tidak sah';
  end if;
  if ub.page_count > 0 and p_page > ub.page_count then
    raise exception 'Muka surat melebihi jumlah muka surat buku (%)', ub.page_count;
  end if;

  old_page := ub.current_page;
  old_status := ub.status;

  if p_page = old_page then
    return ub;
  end if;

  new_status := case
    when ub.page_count > 0 and p_page >= ub.page_count then 'finished'
    when p_page > 0 then 'reading'
    else 'want'
  end;

  perform set_config('app.via_rpc', 'on', true);

  update public.user_books set
    current_page = p_page,
    status       = new_status,
    started_at   = case when p_page > 0 then coalesce(started_at, now()) else null end,
    finished_at  = case when new_status = 'finished' then coalesce(finished_at, now()) else null end
  where id = ub.id
  returning * into ub;

  insert into public.reading_logs (user_book_id, user_id, from_page, to_page)
  values (ub.id, ub.user_id, old_page, p_page);

  -- Feed: hanya jika buku ini awam
  if ub.is_public then
    if new_status = 'finished' and old_status <> 'finished' then
      insert into public.activity_events (user_id, user_book_id, book_id, kind, page)
      values (ub.user_id, ub.id, ub.book_id, 'finished', p_page);
    elsif old_page = 0 and p_page > 0 then
      insert into public.activity_events (user_id, user_book_id, book_id, kind, page)
      values (ub.user_id, ub.id, ub.book_id, 'started', p_page);
    elsif p_page > old_page then
      insert into public.activity_events (user_id, user_book_id, book_id, kind, page)
      values (ub.user_id, ub.id, ub.book_id, 'progress', p_page);
    end if;
  end if;

  return ub;
end;
$$;

revoke all on function public.log_progress(uuid, integer) from public, anon;
grant execute on function public.log_progress(uuid, integer) to authenticated;

-- ============================================================
-- TRIGGERS: rating -> feed; buang feed bila buku disorok
-- ============================================================
create or replace function public.on_user_book_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rating is not null and new.rating is distinct from old.rating then
    delete from public.activity_events
     where user_book_id = new.id and kind = 'rated';
    if new.is_public then
      insert into public.activity_events (user_id, user_book_id, book_id, kind, rating)
      values (new.user_id, new.id, new.book_id, 'rated', new.rating);
    end if;
  end if;
  return new;
end;
$$;
create trigger user_books_rating_feed after update of rating on public.user_books
  for each row execute function public.on_user_book_rating();

create or replace function public.on_user_book_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_public and not new.is_public then
    delete from public.activity_events where user_book_id = new.id;
  end if;
  return new;
end;
$$;
create trigger user_books_visibility_feed after update of is_public on public.user_books
  for each row execute function public.on_user_book_visibility();

-- ============================================================
-- RPC: kira sama ada user boleh lihat rak orang lain
-- ============================================================
create or replace function public.is_follower_of(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows
     where follower_id = auth.uid() and following_id = p_user_id
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.books           enable row level security;
alter table public.user_books      enable row level security;
alter table public.reading_logs    enable row level security;
alter table public.follows         enable row level security;
alter table public.activity_events enable row level security;
alter table public.book_notes      enable row level security;

-- book_notes: pemilik sahaja, tiada siapa lain (termasuk pengikut)
create policy "book_notes_own" on public.book_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- profiles: semua user log masuk boleh cari; user kemas kini profil sendiri sahaja
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- books: katalog kongsi; user boleh tambah, tiada edit/padam dari client
create policy "books_select" on public.books for select to authenticated using (true);
create policy "books_insert" on public.books for insert to authenticated
  with check (created_by = auth.uid());

-- user_books: pemilik penuh; orang lain hanya baca buku awam (dan ikut privasi profil)
create policy "user_books_select" on public.user_books for select to authenticated using (
  user_id = auth.uid()
  or (
    is_public
    and exists (
      select 1 from public.profiles p
       where p.id = user_books.user_id
         and (not p.is_private or public.is_follower_of(p.id))
    )
  )
);
create policy "user_books_insert_own" on public.user_books for insert to authenticated
  with check (user_id = auth.uid());
create policy "user_books_update_own" on public.user_books for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_books_delete_own" on public.user_books for delete to authenticated
  using (user_id = auth.uid());

-- reading_logs: pemilik sahaja (ditulis oleh log_progress, bukan client)
create policy "reading_logs_select_own" on public.reading_logs for select to authenticated
  using (user_id = auth.uid());

-- follows
create policy "follows_select" on public.follows for select to authenticated using (true);
create policy "follows_insert_own" on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "follows_delete_own" on public.follows for delete to authenticated
  using (follower_id = auth.uid());

-- activity: sendiri atau orang yang kau follow (ditulis oleh server sahaja)
create policy "activity_select" on public.activity_events for select to authenticated using (
  user_id = auth.uid() or public.is_follower_of(user_id)
);

-- ============================================================
-- Kunci fungsi: hanya client yang sepatutnya memanggilnya
-- ============================================================
revoke all on function public.is_follower_of(uuid) from public, anon;
grant execute on function public.is_follower_of(uuid) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.on_user_book_rating() from public, anon, authenticated;
revoke all on function public.on_user_book_visibility() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.guard_progress_fields() from public, anon, authenticated;
