begin;

create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Fixed ids keep failure output readable.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated', 'same-one@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{"username":"same"}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated', 'same-two@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{"username":"same"}', now(), now()
  );

select has_table('public', 'question_sessions', 'question_sessions exists');
select has_table('public', 'ai_request_events', 'ai_request_events exists');

select ok(
  not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'user_profiles', 'user_stats', 'score_events', 'user_badges',
         'category_scores', 'question_sessions', 'ai_request_events'
       )
       and (not c.relrowsecurity or not c.relforcerowsecurity)
  ),
  'RLS is enabled and forced on every application table'
);

select ok(not has_schema_privilege('anon', 'public', 'USAGE'), 'anon has no public schema usage');
select ok(not has_table_privilege('anon', 'public.user_profiles', 'SELECT'), 'anon cannot select profiles');
select ok(
  not has_function_privilege('anon', 'public.get_leaderboard(text,text,integer,integer)', 'EXECUTE'),
  'anon cannot execute leaderboard RPCs through PUBLIC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_leaderboard(text,text,integer,integer)', 'EXECUTE'),
  'authenticated can execute the leaderboard allowlist RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_question_session(uuid,uuid,uuid,integer,numeric)', 'EXECUTE'),
  'authenticated cannot finalize server-held questions directly'
);
select ok(not has_table_privilege('authenticated', 'public.score_events', 'INSERT'), 'client cannot insert scores');
select ok(not has_table_privilege('authenticated', 'public.user_badges', 'INSERT'), 'client cannot insert badges');
select ok(not has_table_privilege('authenticated', 'public.question_sessions', 'SELECT'), 'client cannot read correct answers');
select ok(
  not has_column_privilege('authenticated', 'public.user_profiles', 'timezone', 'UPDATE'),
  'client cannot bypass timezone validation with a direct column update'
);
select ok(
  not has_column_privilege('authenticated', 'public.user_profiles', 'username', 'UPDATE'),
  'client cannot bypass username/Auth metadata synchronization'
);
select ok(
  has_function_privilege('service_role', 'public.reserve_ai_request(uuid,text)', 'EXECUTE'),
  'service role can reserve AI requests'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_question_session(uuid,uuid,uuid,integer,numeric)', 'EXECUTE'),
  'service role can finalize a question transaction'
);
select ok(
  has_function_privilege('service_role', 'public.account_data_exists(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.account_data_exists(uuid)', 'EXECUTE'),
  'only service role can verify account-data cascades'
);
select ok(
  not has_table_privilege('service_role', 'public.question_sessions', 'SELECT'),
  'service role reaches private question state only through the RPC allowlist'
);

select is((select count(*) from public.user_profiles), 2::bigint, 'auth trigger creates both profiles');
select is(
  (select count(distinct username) from public.user_profiles),
  2::bigint,
  'duplicate username seeds are de-duplicated'
);
select ok(
  not exists (
    select 1
      from public.user_profiles p
      join auth.users u on u.id = p.id
     where p.username::text <> u.raw_user_meta_data ->> 'username'
  ),
  'new-user normalization keeps profile and Auth metadata usernames equal'
);

-- Authenticate as user A.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.set_my_timezone('Asia/Jerusalem') $$,
  'validated timezone RPC succeeds without a direct timezone column grant'
);
select throws_ok(
  $$ select public.set_my_timezone('Not/A_Real_Zone') $$,
  '22023', null,
  'invalid IANA timezone is rejected'
);
select lives_ok(
  $$ select public.update_my_username('Renamed Player') $$,
  'username RPC updates profile and Auth metadata atomically'
);
select is((select count(*) from public.user_profiles), 1::bigint, 'user A sees only its own profile');
update public.user_profiles
   set country = 'US'
 where id = '22222222-2222-4222-8222-222222222222';

reset role;
select is(
  (select timezone from public.user_profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Asia/Jerusalem',
  'timezone RPC persisted the validated zone'
);
select is(
  (
    select p.username::text
      from public.user_profiles p
      join auth.users u on u.id = p.id
     where p.id = '11111111-1111-4111-8111-111111111111'
       and p.username::text = u.raw_user_meta_data ->> 'username'
  ),
  'Renamed Player',
  'username RPC keeps both stores synchronized'
);
select is(
  (select country from public.user_profiles where id = '22222222-2222-4222-8222-222222222222'),
  null,
  'user A cannot update user B through RLS'
);

-- Create and finalize one server-held trivia question per user.
set local role service_role;
select lives_ok(
  $$
    do $block$
    declare
      v_session uuid;
    begin
      select public.create_question_session(
        '11111111-1111-4111-8111-111111111111', 'world', 'trivia',
        'Which element has the chemical symbol Au in science?', 'Gold', array['Gold', 'Au']
      ) into v_session;
      perform set_config('test.user_a_session', v_session::text, true);

      select public.create_question_session(
        '22222222-2222-4222-8222-222222222222', 'world', 'trivia',
        'Which planet is famous for its visible rings?', 'Saturn', array['Saturn']
      ) into v_session;
      perform set_config('test.user_b_session', v_session::text, true);
    end
    $block$;
  $$,
  'service role creates private question sessions'
);
reset role;
select is((select count(*) from public.question_sessions), 2::bigint, 'two sessions were stored');

set local role service_role;
select lives_ok(
  $$
    do $block$
    declare
      v_token uuid;
    begin
      select evaluation_token into v_token
        from public.claim_question_session(
          '11111111-1111-4111-8111-111111111111',
          current_setting('test.user_a_session')::uuid,
          'trivia'
        );
      perform set_config('test.user_a_claim', v_token::text, true);

      select evaluation_token into v_token
        from public.claim_question_session(
          '22222222-2222-4222-8222-222222222222',
          current_setting('test.user_b_session')::uuid,
          'trivia'
        );
      perform set_config('test.user_b_claim', v_token::text, true);
    end
    $block$;
  $$,
  'service role atomically claims both sessions'
);
select throws_ok(
  $$
    select * from public.claim_question_session(
      '11111111-1111-4111-8111-111111111111',
      current_setting('test.user_a_session')::uuid,
      'trivia'
    )
  $$,
  '55P03', null,
  'a concurrent evaluation cannot claim the same session'
);
select lives_ok(
  $$
    do $block$
    begin
      perform * from public.finalize_question_session(
        '11111111-1111-4111-8111-111111111111',
        current_setting('test.user_a_session')::uuid,
        current_setting('test.user_a_claim')::uuid,
        100, null
      );
      perform * from public.finalize_question_session(
        '22222222-2222-4222-8222-222222222222',
        current_setting('test.user_b_session')::uuid,
        current_setting('test.user_b_claim')::uuid,
        100, null
      );
    end
    $block$;
  $$,
  'server finalization atomically records both scores'
);
reset role;

select is((select count(*) from public.score_events), 2::bigint, 'one immutable score event exists per session');
select is(
  (select total_score from public.user_stats where user_id = '11111111-1111-4111-8111-111111111111'),
  100,
  'aggregate score is updated by the event trigger'
);
select ok(
  exists (
    select 1 from public.user_badges
     where user_id = '11111111-1111-4111-8111-111111111111'
       and badge_id = 'first_guess'
  ),
  'verifiable first_guess badge is awarded by the server transaction'
);
select ok(
  not exists (
    select 1 from public.question_sessions
     where correct_answer <> '' or cardinality(acceptable_answers) <> 0
  ),
  'stored answers are cleared after finalization'
);

set local role service_role;
select throws_ok(
  $$
    select * from public.finalize_question_session(
      '11111111-1111-4111-8111-111111111111',
      current_setting('test.user_a_session')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      100, null
    )
  $$,
  '23505', null,
  'a question session cannot be scored twice'
);
reset role;

-- Equal scores share a rank; username is only the display-order tiebreaker.
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*) from public.get_user_rank(
    '22222222-2222-4222-8222-222222222222', 'all_time', null
  )),
  0::bigint,
  'a caller cannot request another user rank through the security-definer RPC'
);
select is(
  (select count(*) from public.get_leaderboard('all_time', null, 10, 0) where rank = 1),
  2::bigint,
  'equal scores receive the same rank'
);
select is((select count(*) from public.score_events), 1::bigint, 'RLS exposes only user A score events');
reset role;

select throws_ok(
  $$
    insert into public.score_events (user_id, category, question_type, score, local_date)
    values ('22222222-2222-4222-8222-222222222222', 'made_up', 'trivia', 50, current_date)
  $$,
  '23514', null,
  'database rejects unknown categories even for privileged writers'
);

-- Rolling limits are serialized and enforced before a paid Gemini call.
set local role service_role;
select lives_ok(
  $$
    do $block$
    begin
      for i in 1..12 loop
        perform public.reserve_ai_request('11111111-1111-4111-8111-111111111111', 'generate');
      end loop;
    end
    $block$
  $$,
  'the documented per-minute generate allowance is accepted'
);
select throws_ok(
  $$ select public.reserve_ai_request('11111111-1111-4111-8111-111111111111', 'generate') $$,
  'P0001', null,
  'the next generate request is rate-limited'
);
select throws_ok(
  $$ select public.reserve_ai_request('11111111-1111-4111-8111-111111111111', 'invalid') $$,
  '22023', null,
  'unknown rate-limit action is rejected'
);
reset role;

-- Deleting auth.users is the single account-deletion source of truth.
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
select is(
  (select count(*) from public.user_profiles where id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'profile cascades on auth deletion'
);
select is(
  (select count(*) from public.score_events where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'score events cascade on auth deletion'
);
select is(
  (select count(*) from public.question_sessions where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'question sessions cascade on auth deletion'
);
select is(
  (select count(*) from public.ai_request_events where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'rate-limit events cascade on auth deletion'
);
select ok(
  exists (select 1 from auth.users where id = '22222222-2222-4222-8222-222222222222'),
  'deleting user A does not affect user B'
);
set local role service_role;
select is(
  public.account_data_exists('11111111-1111-4111-8111-111111111111'),
  false,
  'delete-account verification RPC sees no surviving application rows'
);
reset role;

select * from finish();
rollback;
