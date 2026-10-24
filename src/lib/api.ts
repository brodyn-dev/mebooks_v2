import { supabase } from './supabase';
import type { ActivityEvent, Book, Profile, ReadingLog, UserBook } from './types';
import type { BookLookup } from './lookup';
import type { ImportRow } from './goodreads';

const USER_BOOK_SELECT = '*, book:books(*)';

function unwrap<T>(res: { data: unknown; error: { message: string } | null }): T {
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

/**
 * Salin buku dari rak orang lain ke rak saya (status "Nak baca", progres bermula dari 0).
 * Rating, ulasan, nota dan progres TAK disalin. Buku yang dah ada dilangkau.
 */
export async function copyBooksToShelf(
  userId: string,
  sourceBooks: UserBook[],
): Promise<{ added: number; skipped: number }> {
  const mine = await fetchShelf(userId);
  const onShelf = new Set(mine.map((ub) => ub.book_id));

  const toInsert: { book_id: string; page_count: number }[] = [];
  let skipped = 0;
  for (const ub of sourceBooks) {
    if (onShelf.has(ub.book_id)) {
      skipped++;
      continue;
    }
    onShelf.add(ub.book_id);
    toInsert.push({ book_id: ub.book_id, page_count: ub.page_count || ub.book?.page_count || 0 });
  }

  let added = 0;
  for (const part of chunks(toInsert, 100)) {
    unwrap(
      await supabase.from('user_books').insert(
        part.map((r) => ({
          user_id: userId,
          book_id: r.book_id,
          status: 'want',
          current_page: 0,
          page_count: r.page_count,
          is_public: false,
        })),
      ),
    );
    added += part.length;
  }
  return { added, skipped };
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

/** Semua nota peribadi saya, dipetakan ikut user_book_id (untuk eksport). */
export async function fetchAllNotes(userId: string): Promise<Record<string, string>> {
  const rows = unwrap(
    await supabase.from('book_notes').select('user_book_id, body').eq('user_id', userId),
  ) as { user_book_id: string; body: string }[];
  return Object.fromEntries(rows.map((r) => [r.user_book_id, r.body]));
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

/** Semua akaun (kecuali sendiri), disusun ikut username. */
export async function fetchAllProfiles(selfId: string): Promise<Profile[]> {
  return unwrap(
    await supabase
      .from('profiles')
      .select('*')
      .neq('id', selfId)
      .order('username', { ascending: true })
      .limit(500),
  ) as Profile[];
}

/** ID semua orang yang saya ikut. */
export async function fetchMyFollowingIds(selfId: string): Promise<string[]> {
  const rows = unwrap(
    await supabase.from('follows').select('following_id').eq('follower_id', selfId),
  ) as { following_id: string }[];
  return rows.map((r) => r.following_id);
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

export type MiniProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;

/** Senarai pengikut: siapa yang follow profil ini. */
export async function fetchFollowers(profileId: string): Promise<MiniProfile[]> {
  const res = await supabase
    .from('follows')
    .select('profile:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)')
    .eq('following_id', profileId)
    .order('created_at', { ascending: false });
  if (res.error) throw new Error(res.error.message);
  return (res.data as unknown as { profile: MiniProfile }[]).map((r) => r.profile);
}

/** Senarai mengikut: siapa yang profil ini follow. */
export async function fetchFollowing(profileId: string): Promise<MiniProfile[]> {
  const res = await supabase
    .from('follows')
    .select('profile:profiles!follows_following_id_fkey(id, username, display_name, avatar_url)')
    .eq('follower_id', profileId)
    .order('created_at', { ascending: false });
  if (res.error) throw new Error(res.error.message);
  return (res.data as unknown as { profile: MiniProfile }[]).map((r) => r.profile);
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
        'id, user_id, user_book_id, kind, page, rating, body, created_at, ' +
          'profile:profiles!activity_events_user_id_fkey(id, username, display_name, avatar_url), ' +
          'book:books!activity_events_book_id_fkey(id, title, authors, cover_url, page_count)',
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ) as unknown as ActivityEvent[];
}


// ---------- Import Goodreads ----------

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface ImportResult {
  added: number;
  alreadyInShelf: number;
  failed: number;
}

/**
 * Import baris Goodreads ke rak user.
 * - Buku dicari/ dicipta dalam katalog ikut ISBN.
 * - Rekod sejarah dimasukkan terus (tanpa event feed), supaya feed tak dibanjiri.
 * - Buku dimasukkan sebagai peribadi (tidak awam) sehingga user tukar sendiri.
 */
export async function importGoodreadsRows(
  userId: string,
  rows: ImportRow[],
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const total = rows.length;
  let done = 0;
  const tick = (n: number) => {
    done += n;
    onProgress(Math.min(done, total), total);
  };

  // 1) Katalog: cari buku sedia ada ikut ISBN
  const isbns = [...new Set(rows.map((r) => r.isbn13).filter((x): x is string => !!x))];
  const bookByIsbn = new Map<string, string>();
  for (const part of chunks(isbns, 100)) {
    const res = await supabase.from('books').select('id, isbn13').in('isbn13', part);
    for (const b of unwrap(res) as { id: string; isbn13: string }[]) bookByIsbn.set(b.isbn13, b.id);
  }

  // 2) Cipta buku baru yang belum ada (ikut ISBN, unik)
  const seen = new Set<string>();
  const newBooks = rows.filter((r) => {
    if (!r.isbn13 || bookByIsbn.has(r.isbn13) || seen.has(r.isbn13)) return false;
    seen.add(r.isbn13);
    return true;
  });
  for (const part of chunks(newBooks, 100)) {
    const res = await supabase
      .from('books')
      .insert(
        part.map((r) => ({
          isbn13: r.isbn13,
          title: r.title,
          authors: r.authors,
          publisher: r.publisher,
          published_year: r.published_year,
          cover_url: '',
          description: '',
          genre: '',
          page_count: r.page_count,
          created_by: userId,
        })),
      )
      .select('id, isbn13');
    for (const b of unwrap(res) as { id: string; isbn13: string }[]) bookByIsbn.set(b.isbn13, b.id);
  }

  // 3) Buku tanpa ISBN: cipta satu-satu
  const noIsbn = rows.filter((r) => !r.isbn13);
  const bookIdByRow = new Map<number, string>();
  for (const r of rows) if (r.isbn13 && bookByIsbn.has(r.isbn13)) bookIdByRow.set(r.line, bookByIsbn.get(r.isbn13)!);
  for (const r of noIsbn) {
    const res = await supabase
      .from('books')
      .insert({
        title: r.title,
        authors: r.authors,
        publisher: r.publisher,
        published_year: r.published_year,
        page_count: r.page_count,
        created_by: userId,
      })
      .select('id')
      .single();
    if (res.data) bookIdByRow.set(r.line, (res.data as { id: string }).id);
  }

  // 4) Rak sedia ada: jangan tindih
  const shelf = await fetchShelf(userId);
  const onShelf = new Set(shelf.map((ub) => ub.book_id));

  let alreadyInShelf = 0;
  let failed = 0;
  const toInsert: { row: ImportRow; bookId: string }[] = [];
  const insertedBooks = new Set<string>();
  for (const r of rows) {
    const bookId = bookIdByRow.get(r.line);
    if (!bookId) {
      failed++;
      tick(1);
      continue;
    }
    if (onShelf.has(bookId) || insertedBooks.has(bookId)) {
      alreadyInShelf++;
      tick(1);
      continue;
    }
    insertedBooks.add(bookId);
    toInsert.push({ row: r, bookId });
  }

  // 5) Masukkan rekod rak (dan sejarah) dalam kelompok
  let added = 0;
  const userBookIdByBook = new Map<string, string>();
  for (const part of chunks(toInsert, 100)) {
    const res = await supabase
      .from('user_books')
      .insert(
        part.map(({ row, bookId }) => ({
          user_id: userId,
          book_id: bookId,
          status: row.status,
          current_page: row.current_page,
          page_count: row.page_count,
          rating: row.rating,
          review: row.review,
          is_public: false,
          started_at: null,
          finished_at: row.finished_at,
          ...(row.added_at ? { created_at: row.added_at } : {}),
        })),
      )
      .select('id, book_id');
    if (res.error) {
      failed += part.length;
    } else {
      for (const ub of res.data as { id: string; book_id: string }[]) {
        userBookIdByBook.set(ub.book_id, ub.id);
        added++;
      }
    }
    tick(part.length);
  }

  // 6) Nota peribadi (hanya pemilik boleh baca)
  const notes = toInsert
    .map(({ row, bookId }) => ({ row, ubId: userBookIdByBook.get(bookId) }))
    .filter((x): x is { row: ImportRow; ubId: string } => !!x.ubId && !!x.row.note);
  for (const part of chunks(notes, 100)) {
    await supabase.from('book_notes').upsert(
      part.map((n) => ({ user_book_id: n.ubId, user_id: userId, body: n.row.note })),
    );
  }

  onProgress(total, total);
  return { added, alreadyInShelf, failed };
}
