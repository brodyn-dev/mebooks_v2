export type Status = 'want' | 'reading' | 'finished';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  is_private: boolean;
  created_at: string;
}

export interface Book {
  id: string;
  isbn13: string | null;
  title: string;
  authors: string;
  publisher: string;
  published_year: string;
  cover_url: string;
  description: string;
  genre: string;
  page_count: number;
}

/** Satu entri dalam rak user (rekod peribadi + buku). */
export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  status: Status;
  current_page: number;
  page_count: number;
  rating: number | null;
  review: string;
  is_public: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  book: Book;
}

export interface ReadingLog {
  id: number;
  from_page: number;
  to_page: number;
  created_at: string;
}

export type ActivityKind = 'started' | 'progress' | 'finished' | 'rated';

export interface ActivityEvent {
  id: number;
  user_id: string;
  user_book_id: string;
  kind: ActivityKind;
  page: number | null;
  rating: number | null;
  created_at: string;
  profile: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  book: Pick<Book, 'id' | 'title' | 'authors' | 'cover_url' | 'page_count'>;
}
