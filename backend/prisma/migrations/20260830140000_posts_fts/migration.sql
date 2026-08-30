-- AG-21: FTS over posts and public marketplace profiles.
-- unaccent (accent-insensitive) + pg_trgm (typo / similarity).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent(text) is STABLE; this wrapper is IMMUTABLE so it can be indexed
-- and used in generated tsvector columns.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

CREATE TEXT SEARCH CONFIGURATION public.spanish_unaccent (COPY = pg_catalog.spanish);
ALTER TEXT SEARCH CONFIGURATION public.spanish_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, spanish_stem;

CREATE OR REPLACE FUNCTION public.posts_search_vector(title text, category text, description text)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('public.spanish_unaccent', coalesce(title, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(category, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(description, '')), 'B')
$$;

CREATE OR REPLACE FUNCTION public.profiles_search_vector(
  display_name text,
  municipality text,
  category text,
  bio text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('public.spanish_unaccent', coalesce(display_name, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(municipality, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(category, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(bio, '')), 'B')
$$;

CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_vector" tsvector GENERATED ALWAYS AS (
        public.posts_search_vector("title", "category", "description")
    ) STORED,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");
CREATE INDEX "posts_title_trgm_idx" ON "posts" USING GIN (public.f_unaccent("title") gin_trgm_ops);
CREATE INDEX "posts_category_trgm_idx" ON "posts" USING GIN (public.f_unaccent("category") gin_trgm_ops);
CREATE INDEX "posts_description_trgm_idx" ON "posts" USING GIN (public.f_unaccent("description") gin_trgm_ops);

CREATE TABLE "marketplace_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "search_vector" tsvector GENERATED ALWAYS AS (
        public.profiles_search_vector("display_name", "municipality", "category", "bio")
    ) STORED,

    CONSTRAINT "marketplace_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketplace_profiles_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "marketplace_profiles_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "profiles_search_vector_idx" ON "marketplace_profiles" USING GIN ("search_vector");
CREATE INDEX "profiles_display_name_trgm_idx"
    ON "marketplace_profiles" USING GIN (public.f_unaccent("display_name") gin_trgm_ops);
CREATE INDEX "profiles_municipality_trgm_idx"
    ON "marketplace_profiles" USING GIN (public.f_unaccent("municipality") gin_trgm_ops);
CREATE INDEX "profiles_category_trgm_idx"
    ON "marketplace_profiles" USING GIN (public.f_unaccent("category") gin_trgm_ops);
CREATE INDEX "profiles_bio_trgm_idx"
    ON "marketplace_profiles" USING GIN (public.f_unaccent("bio") gin_trgm_ops);
