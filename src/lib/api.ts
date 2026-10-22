import { supabase } from './supabase';
import type { ActivityEvent, Book, Profile, ReadingLog, UserBook } from './types';
import type { BookLookup } from './lookup';

const USER_BOOK_SELECT = '*, book:books(*)';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------- Rak buku ----------

export async function fetchShelf(userId: string): Promise<UserBook[]> {
  return unwrap(
    await supabase
      .from('user_books')
      .select(USER_BOOK_SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
  ) as UserBook[];
}

export async function fetchUserBookById(id: string): Promise<UserBook> {
  return unwrap(
    await supabase.from('user_books').select(USER_BOOK_SELECT).eq('id', id).single(),
  ) as UserBook;
}

/** Cari buku dalam katalog ikut ISBN, atau cipta jika belum ada. */
async function findOrCreateBook(userId: string, input: BookLookup & { isbn13: string | null }): Promise<Book> {
  if (input.isbn13) {
    const existing = await supabase.from('books').select('*').eq('isbn13', input.isbn13).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data as Book;
  }

  const created = await supabase
    .from('books')
    .insert({
      isbn13: input.isbn13,
      title: input.title,
      authors: input.authors,
      publisher: input.publisher,
      published_year: input.published_year,
      cover_url: input.cover_url,
      description: input.description,
      genre: input.genre,
      page_count: input.page_count,
      created_by: userId,
    })
    .select('*')
    .single();

  if (created.error && input.isbn13) {
    // Dua user scan ISBN sama serentak: ambil rekod yang baru dicipta oleh user lain
    const again = await supabase.from('books').select('*').eq('isbn13', input.isbn13).single();
    if (again.data) return again.data as Book;
  }
  return unwrap(created) as Book;
}

export async function addBookToShelf(
  userId: string,
  input: BookLookup & { isbn13: string | null },
): Promise<UserBook> {
  const book = await findOrCreateBook(userId, input);
  const row = unwrap(
    await supabase
      .from('user_books')
      .insert({
        user_id: userId,
        book_id: book.id,
        status: 'want',
        page_count: input.page_count || book.page_count || 0,
      })
      .select(USER_BOOK_SELECT)
      .single(),
  );
  return row as UserBook;
}

export async function updateUserBook(
  id: string,
  patch: Partial<Pick<UserBook, 'page_count' | 'rating' | 'review' | 'is_public'>>,
): Promise<void> {
  unwrap(await supabase.from('user_books').update(patch).eq('id', id));
}

/** Nota peribadi: hanya pemilik boleh baca/tulis (jadual book_notes). */
export async function fetchNote(userBookId: string): Promise<string> {
  const res = await supabase.from('book_notes').select('body').eq('user_book_id', userBookId).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data?.body ?? '';
}

export async function saveNote(userBookId: string, userId: string, body: string): Promise<void> {
  unwrap(
    await supabase
      .from('book_notes')
      .upsert({ user_book_id: userBookId, user_id: userId, body, updated_at: new Date().toISOString() }),
  );
}

export async function deleteUserBook(id: string): Promise<void> {
  unwrap(await supabase.from('user_books').delete().eq('id', id));
}

/** Satu-satunya cara tukar muka surat (server kemas kini status & feed). */
export async function logProgress(userBookId: string, page: number): Promise<UserBook> {
  const row = unwrap(
    await supabase.rpc('log_progress', { p_user_book_id: userBookId, p_page: page }),
  ) as Omit<UserBook, 'book'>;
  return fetchUserBookById(row.id);
}

export async function fetchReadingLogs(userBookId: string): Promise<ReadingLog[]> {
  return unwrap(
    await supabase
      .from('reading_logs')
      .select('id, from_page, to_page, created_at')
      .eq('user_book_id', userBookId)
      .order('created_at', { ascending: false })
      .limit(30),
  ) as ReadingLog[];
}

// ---------- Profil ----------

export async function fetchProfile(id: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile;
}

export async function updateMyProfile(
  id: string,
  patch: Partial<Pick<Profile, 'display_name' | 'bio' | 'is_private'>>,
): Promise<void> {
  unwrap(await supabase.from('profiles').update(patch).eq('id', id));
}

export async function searchProfiles(query: string, selfId: string): Promise<Profile[]> {
  const q = query.trim().toLowerCase().replace(/[%_,()*]/g, '');
  if (!q) return [];
  return unwrap(
    await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', selfId)
      .limit(20),
  ) as Profile[];
}

export interface FollowState {
  following: boolean;
  followers: number;
  followingCount: number;
}

export async function fetchFollowState(viewerId: string, targetId: string): Promise<FollowState> {
  const [mine, followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle(),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetId),
  ]);
  return {
    following: Boolean(mine.data),
    followers: followers.count ?? 0,
    followingCount: following.count ?? 0,
  };
}

export async function follow(viewerId: string, targetId: string): Promise<void> {
  unwrap(await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId }));
}

export async function unfollow(viewerId: string, targetId: string): Promise<void> {
  unwrap(await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', targetId));
}

// ---------- Feed ----------

export async function fetchFeed(): Promise<ActivityEvent[]> {
  return unwrap(
    await supabase
      .from('activity_events')
      .select(
        'id, user_id, user_book_id, kind, page, rating, created_at, ' +
          'profile:profiles!activity_events_user_id_fkey(id, username, display_name, avatar_url), ' +
          'book:books!activity_events_book_id_fkey(id, title, authors, cover_url, page_count)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ) as unknown as ActivityEvent[];
}
