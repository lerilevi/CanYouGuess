// Real migrations executed in ephemeral PostgreSQL/WASM; no hosted writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const runtimeRequire=require('node:module').createRequire(path.join(__dirname,'runtime/package.json'));
const {PGlite}=runtimeRequire('@electric-sql/pglite');
const {citext}=runtimeRequire('@electric-sql/pglite/contrib/citext');
const base=path.resolve(__dirname,'../..');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const {randomUUID}=require('node:crypto');
async function main(){
  const db=new PGlite({extensions:{citext}});const cases=[];
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;grant usage on schema auth to authenticated,service_role;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant execute on function auth.uid() to public;`);
  for(const file of fs.readdirSync(path.join(base,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
    await db.exec(fs.readFileSync(path.join(base,'supabase/migrations',file),'utf8'));
  }
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[A,'a@example.invalid',B,'b@example.invalid']);
  async function call(sql,args=[]){return (await db.query(sql,args)).rows;}
  await call("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await db.exec('set role authenticated');
  await call("select public.set_my_timezone('Asia/Jerusalem')");
  let state=(await call('select * from public.get_my_play_state()'))[0];
  assert.equal(state.free_limit,15);assert.equal(state.timezone,'Asia/Jerusalem');
  await assert.rejects(call("select public.set_my_timezone('Fake/Zone')"),/Unknown IANA/);
  await assert.rejects(call('select * from public.play_reservations'),/permission denied/);
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[A,randomUUID(),'world']),/permission denied/);
  await db.exec('reset role');cases.push('Timezone validated; private allowance/reward tables and RPCs denied to client');
  assert.equal((await call("select has_function_privilege('service_role','public.create_question_session(uuid,text,text,text,text,text[],timestamptz)','execute') allowed"))[0].allowed,false);
  await db.exec('set role service_role');
  const ids=[];
  for(let i=0;i<15;i++){
    const row=await call('select public.reserve_play($1,$2,$3) as r',[A,randomUUID(),'world']);ids.push(row[0].r.reservationId);
  }
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[A,randomUUID(),'world']),/allowance/);
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[B,randomUUID(),'science']),/Premium category/);
  cases.push('15 reservations exhaust allowance before any scoring; premium Categories cannot bypass');
  await call('select public.release_play($1,$2)',[A,ids[0]]);
  const request=randomUUID();
  const res=(await call('select public.reserve_play($1,$2,$3) as r',[A,request,'world']))[0].r;
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[A,request,'world']),/already used/);
  await assert.rejects(call('select public.create_reserved_question($1,$2,$3) as q',[A,res.reservationId,
    {type:'estimation',question:'Synthetic fixture in people?',acceptableAnswers:[],unit:'people',steps:[],rubricVersion:'relative-v1'}]),/reference/);
  const payload={type:'estimation',question:'Synthetic numeric fixture in people?',hint:'',correctAnswer:'',acceptableAnswers:[],referenceAnswer:100,unit:'people',steps:['Synthetic only','Not real AI output'],rubricVersion:'relative-v1'};
  const q=(await call('select public.create_reserved_question($1,$2,$3) as q',[A,res.reservationId,payload]))[0].q;
  const replay=(await call('select public.reserve_play($1,$2,$3) as r',[A,request,'world']))[0].r;
  assert.equal(replay.questionId,q);assert.equal(replay.referenceAnswer,undefined);
  await assert.rejects(call('select * from public.claim_question_session($1,$2,$3)',[B,q,'estimation']),/not found/);
  const claim=(await call('select * from public.claim_question_session($1,$2,$3)',[A,q,'estimation']))[0];
  const frozen=(await call('select public.get_frozen_reference($1,$2,$3) as f',[A,q,claim.evaluation_token]))[0].f;
  assert.equal(frozen.referenceAnswer,100);assert.equal(frozen.unit,'people');
  await call('select * from public.finalize_question_session($1,$2,$3,$4,$5)',[A,q,claim.evaluation_token,100,0]);
  await assert.rejects(call('select * from public.finalize_question_session($1,$2,$3,$4,$5)',[A,q,claim.evaluation_token,100,0]),/already finalized/);
  cases.push('Release is idempotent; retry replay is public-only; owner-bound frozen reference; exactly-once score');
  await db.exec('reset role');
  await call('insert into public.reward_credits(user_id,provider,transaction_id,credits) values($1,$2,$3,$4)',[A,'synthetic-offline','fixture',1]);
  const bonus=(await call('select public.reserve_play($1,$2,$3) as r',[A,randomUUID(),'world']))[0].r;
  assert.equal((await call('select consumed from public.reward_credits where user_id=$1',[A]))[0].consumed,1);
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[A,randomUUID(),'world']),/allowance/);
  await call('select public.release_play($1,$2)',[A,bonus.reservationId]);
  await call('select public.release_play($1,$2)',[A,bonus.reservationId]);
  assert.equal((await call('select consumed from public.reward_credits where user_id=$1',[A]))[0].consumed,0);
  await call('delete from public.reward_credits where user_id=$1',[A]);
  cases.push('Synthetic server credit reserves once and failed generation refunds exactly once; no client mint route');
  await call("select set_config('request.jwt.claim.sub',$1,false)",[A]);
  await call("select public.set_my_timezone('Pacific/Honolulu')");
  await assert.rejects(call("select public.set_my_timezone('Pacific/Auckland')"),/cooldown/);
  await assert.rejects(call('select public.reserve_play($1,$2,$3)',[A,randomUUID(),'world']),/allowance/);
  cases.push('Travel queues a delayed reset; second hop rejected; no extra allowance immediately');
  await call('delete from auth.users where id=$1',[A]);
  for(const table of ['play_accounts','play_reservations','reward_credits','question_sessions'])
    assert.equal((await call(`select count(*)::integer n from public.${table} where user_id=$1`,[A]))[0].n,0);
  cases.push('Deletion cascades through new private tables');
  assert.equal((await call('select public.account_data_exists($1) present',[A]))[0].present,false);
  await db.close();console.log(JSON.stringify({kind:'offline-postgresql-regression',networkCalls:0,cases},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
