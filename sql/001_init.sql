-- semantic-loop baseline schema
-- Adjust vector(1536) if your embedding model uses a different dimensionality.

create extension if not exists vector;

create table if not exists public.semantic_items (
  id text primary key,
  tribe text not null,
  kind text not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.semantic_item_scores (
  item_id text primary key references public.semantic_items(id) on delete cascade,
  attempts integer not null default 0,
  score_sum double precision not null default 0,
  score_avg double precision not null default 0,
  critic_avg double precision not null default 0,
  engagement_avg double precision not null default 0,
  last_score double precision,
  last_critic_score double precision,
  last_engagement_score double precision,
  last_outcome_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.semantic_outcomes (
  id text primary key,
  item_id text not null references public.semantic_items(id) on delete cascade,
  platform text not null,
  occurred_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  engagement_score double precision not null,
  critic_score double precision not null,
  final_score double precision not null,
  rationale text,
  tags text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.sl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists semantic_items_touch_updated_at on public.semantic_items;
create trigger semantic_items_touch_updated_at
before update on public.semantic_items
for each row execute function public.sl_touch_updated_at();

drop trigger if exists semantic_item_scores_touch_updated_at on public.semantic_item_scores;
create trigger semantic_item_scores_touch_updated_at
before update on public.semantic_item_scores
for each row execute function public.sl_touch_updated_at();

create index if not exists semantic_items_tribe_kind_idx on public.semantic_items (tribe, kind);
create index if not exists semantic_outcomes_item_id_idx on public.semantic_outcomes (item_id, occurred_at desc);
create index if not exists semantic_items_embedding_cos_idx
on public.semantic_items
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function public.sl_upsert_item(
  p_id text,
  p_tribe text,
  p_kind text,
  p_content text,
  p_embedding double precision[],
  p_metadata jsonb default '{}'::jsonb,
  p_created_at timestamptz default now(),
  p_updated_at timestamptz default now(),
  p_archived_at timestamptz default null
)
returns void
language plpgsql
as $$
begin
  insert into public.semantic_items (
    id,
    tribe,
    kind,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    archived_at
  )
  values (
    p_id,
    p_tribe,
    p_kind,
    p_content,
    p_embedding::vector,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_at,
    p_updated_at,
    p_archived_at
  )
  on conflict (id) do update
  set tribe = excluded.tribe,
      kind = excluded.kind,
      content = excluded.content,
      embedding = excluded.embedding,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at,
      archived_at = excluded.archived_at;

  insert into public.semantic_item_scores (item_id)
  values (p_id)
  on conflict (item_id) do nothing;
end;
$$;

create or replace function public.sl_match_items(
  p_tribe text default null,
  p_kind text default null,
  p_query_embedding double precision[] default null,
  p_limit integer default 8,
  p_min_similarity double precision default 0,
  p_include_archived boolean default false
)
returns table (
  id text,
  tribe text,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  archived_at timestamptz,
  attempts integer,
  score_sum double precision,
  score_avg double precision,
  critic_avg double precision,
  engagement_avg double precision,
  last_score double precision,
  last_critic_score double precision,
  last_engagement_score double precision,
  last_outcome_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  with ranked as (
    select
      i.id,
      i.tribe,
      i.kind,
      i.content,
      i.metadata,
      i.created_at,
      i.updated_at,
      i.archived_at,
      coalesce(s.attempts, 0) as attempts,
      coalesce(s.score_sum, 0) as score_sum,
      coalesce(s.score_avg, 0) as score_avg,
      coalesce(s.critic_avg, 0) as critic_avg,
      coalesce(s.engagement_avg, 0) as engagement_avg,
      s.last_score,
      s.last_critic_score,
      s.last_engagement_score,
      s.last_outcome_at,
      case
        when p_query_embedding is null then 0.5
        else 1 - (i.embedding <=> (p_query_embedding::vector))
      end as similarity
    from public.semantic_items i
    left join public.semantic_item_scores s on s.item_id = i.id
    where (p_tribe is null or i.tribe = p_tribe)
      and (p_kind is null or i.kind = p_kind)
      and (p_include_archived or i.archived_at is null)
  )
  select *
  from ranked
  where similarity >= coalesce(p_min_similarity, 0)
  order by similarity desc, score_avg desc, attempts asc
  limit greatest(1, coalesce(p_limit, 8));
$$;

create or replace function public.sl_record_outcome(
  p_item_id text,
  p_event_id text,
  p_platform text,
  p_occurred_at timestamptz,
  p_metrics jsonb,
  p_payload jsonb,
  p_engagement_score double precision,
  p_critic_score double precision,
  p_final_score double precision,
  p_rationale text default null,
  p_tags text[] default '{}',
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  insert into public.semantic_outcomes (
    id,
    item_id,
    platform,
    occurred_at,
    metrics,
    payload,
    engagement_score,
    critic_score,
    final_score,
    rationale,
    tags,
    meta
  )
  values (
    p_event_id,
    p_item_id,
    p_platform,
    p_occurred_at,
    coalesce(p_metrics, '{}'::jsonb),
    coalesce(p_payload, '{}'::jsonb),
    p_engagement_score,
    p_critic_score,
    p_final_score,
    p_rationale,
    coalesce(p_tags, '{}'),
    coalesce(p_meta, '{}'::jsonb)
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.sl_apply_outcome(
  p_item_id text,
  p_occurred_at timestamptz,
  p_engagement_score double precision,
  p_critic_score double precision,
  p_final_score double precision,
  p_decay_factor double precision default 0.95
)
returns table (
  item_id text,
  attempts integer,
  score_sum double precision,
  score_avg double precision,
  critic_avg double precision,
  engagement_avg double precision,
  last_score double precision,
  last_critic_score double precision,
  last_engagement_score double precision,
  last_outcome_at timestamptz,
  updated_at timestamptz
)
language plpgsql
as $$
declare
  v_prev public.semantic_item_scores%rowtype;
  v_attempts integer;
  v_score_sum double precision;
  v_score_avg double precision;
  v_critic_avg double precision;
  v_engagement_avg double precision;
  v_row public.semantic_item_scores%rowtype;
begin
  insert into public.semantic_item_scores (item_id)
  values (p_item_id)
  on conflict (item_id) do nothing;

  select *
  into v_prev
  from public.semantic_item_scores
  where semantic_item_scores.item_id = p_item_id
  for update;

  v_attempts := coalesce(v_prev.attempts, 0) + 1;
  v_score_sum := coalesce(v_prev.score_sum, 0) * greatest(0, least(1, coalesce(p_decay_factor, 0.95))) + p_final_score;
  v_score_avg := v_score_sum / greatest(1, v_attempts);
  v_critic_avg := ((coalesce(v_prev.critic_avg, 0) * coalesce(v_prev.attempts, 0)) + p_critic_score) / greatest(1, v_attempts);
  v_engagement_avg := ((coalesce(v_prev.engagement_avg, 0) * coalesce(v_prev.attempts, 0)) + p_engagement_score) / greatest(1, v_attempts);

  update public.semantic_item_scores
  set attempts = v_attempts,
      score_sum = v_score_sum,
      score_avg = greatest(0, least(1, v_score_avg)),
      critic_avg = greatest(0, least(1, v_critic_avg)),
      engagement_avg = greatest(0, least(1, v_engagement_avg)),
      last_score = p_final_score,
      last_critic_score = p_critic_score,
      last_engagement_score = p_engagement_score,
      last_outcome_at = p_occurred_at,
      updated_at = now()
  where semantic_item_scores.item_id = p_item_id;

  return query
  select
    s.item_id,
    s.attempts,
    s.score_sum,
    s.score_avg,
    s.critic_avg,
    s.engagement_avg,
    s.last_score,
    s.last_critic_score,
    s.last_engagement_score,
    s.last_outcome_at,
    s.updated_at
  from public.semantic_item_scores s
  where s.item_id = p_item_id;
end;
$$;
