-- ============================================================
-- MeBooks: tambah event "reviewed" dalam feed.
-- Jalankan SEKALI dalam SQL Editor selepas schema.sql (projek sama).
-- ============================================================

-- 1) Benarkan jenis event baru + simpan petikan review (maks 280 aksara)
alter table public.activity_events drop constraint if exists activity_events_kind_check;
alter table public.activity_events
  add constraint activity_events_kind_check
  check (kind in ('started', 'progress', 'finished', 'rated', 'reviewed'));
alter table public.activity_events
  add column if not exists body text not null default '' check (char_length(body) <= 280);

-- 2) Bila review berubah: buang event review lama, tambah baru jika buku awam & review tak kosong
create or replace function public.on_user_book_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review is distinct from old.review then
    delete from public.activity_events
     where user_book_id = new.id and kind = 'reviewed';
    if new.is_public and char_length(trim(new.review)) > 0 then
      insert into public.activity_events (user_id, user_book_id, book_id, kind, body)
      values (new.user_id, new.id, new.book_id, 'reviewed', left(trim(new.review), 280));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_books_review_feed on public.user_books;
create trigger user_books_review_feed after update of review on public.user_books
  for each row execute function public.on_user_book_review();

-- 3) Bila buku dibuka semula (awam), muncul semula review yang sedia ada
create or replace function public.on_user_book_visibility()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_public and not new.is_public then
    delete from public.activity_events where user_book_id = new.id;
  elsif new.is_public and not old.is_public and char_length(trim(new.review)) > 0 then
    insert into public.activity_events (user_id, user_book_id, book_id, kind, body)
    values (new.user_id, new.id, new.book_id, 'reviewed', left(trim(new.review), 280));
  end if;
  return new;
end;
$$;

revoke all on function public.on_user_book_review() from public, anon, authenticated;
