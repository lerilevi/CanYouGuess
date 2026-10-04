// No default paid execution. Preflight is generated only after secure hosted-config verification.
import { AuditBudget } from './auditBudget.ts';
import { SYSTEM_PROMPT, QUESTION_SCHEMA, generatePrompt } from '../../supabase/functions/_shared/questionPrompt.ts';
import { evaluateFrozen, RUBRIC_VERSION } from '../../supabase/functions/_shared/estimation.ts';
import { matchesAcceptedAnswer } from '../../supabase/functions/_shared/trivia.ts';

const run = Deno.args.includes('--run');
if (!run) {
  console.log(JSON.stringify({status:'not-run',questions:28,maxAttempts:80,ceilingUSD:2,
    reason:'Requires verified hosted model/rates and secure GEMINI_API_KEY; no provider requests made.'}));
  Deno.exit(0);
}
const proofPath=Deno.env.get('AI_PILOT_PREFLIGHT');
const key=Deno.env.get('GEMINI_API_KEY');
if (!proofPath || !key) throw new Error('Secure pilot preflight/key is not configured. Do not paste secrets in chat.');
interface Proof {
  project:string; model:string; verifiedAt:string; pricingURL:string; inputRate:number; outputRate:number;
  inputTokenLimit:number; outputTokenLimit:number; country:string; hostedSourceSHA256:string;
}
const proof:Proof=JSON.parse(await Deno.readTextFile(proofPath));
if (proof.project!=='kkwhbtgewxvsvmuozxok' || !/^[a-z0-9._-]+$/i.test(proof.model)
  || Date.now()-Date.parse(proof.verifiedAt)>86_400_000 || Date.parse(proof.verifiedAt)>Date.now()+300_000
  || !Number.isFinite(Date.parse(proof.verifiedAt))
  || !proof.pricingURL.startsWith('https://ai.google.dev/') || !/^[a-f0-9]{64}$/.test(proof.hostedSourceSHA256)
  || ![proof.inputTokenLimit,proof.outputTokenLimit].every(n=>Number.isInteger(n)&&n>0)) throw new Error('Hosted-model preflight is missing/stale/invalid.');
// Unbilled metadata check: do not trust hand-entered context/output limits for the cost guard.
const metadataResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+proof.model, {
  headers: {'x-goog-api-key':key}, signal:AbortSignal.timeout(15_000),
});
if (!metadataResponse.ok) throw new Error('Model metadata could not be verified; no generation attempted.');
const metadata = await metadataResponse.json();
if (metadata.inputTokenLimit !== proof.inputTokenLimit || metadata.outputTokenLimit !== proof.outputTokenLimit
  || !metadata.supportedGenerationMethods?.includes('generateContent'))
  throw new Error('Provider limits differ from verified preflight; no generation attempted.');
// Use full context limit and DOUBLE full model output limit, not an assumed 4096-token thinking bound.
// This is intentionally conservative; unknown charges retain this full reservation and may stop the pilot early.
const worst=(proof.inputTokenLimit*proof.inputRate+2*proof.outputTokenLimit*proof.outputRate)/1_000_000;
const budget=new AuditBudget(worst,proof.inputRate,proof.outputRate);
const dir='planning/evidence/ai-pilot';
await Deno.mkdir(dir,{recursive:true});
// Permanent one-run marker prevents re-running an interrupted pilot with a fresh $2 budget.
const lock=await Deno.open(dir+'/run.lock',{createNew:true,write:true});lock.close();
const events=dir+'/attempts.jsonl', outputs=dir+'/questions.jsonl';
const append=(file:string,data:unknown)=>Deno.writeTextFile(file,JSON.stringify(data)+'\n',{append:true});
const categories=['my_country','world','science','history','food_drink','sports','art'];
let accepted=0;let stopped='completed';
try {
  for (const category of categories) for (const type of ['trivia','estimation']) for(let sample=0;sample<2;sample++) {
    let completed=false;
    while(!completed) {
      budget.reserve();
      const attempt=budget.attempts;
      await append(events,{event:'reserved',attempt,worstUSD:worst,committedUSD:budget.committedUSD,category,type,sample});
      const prompt=generatePrompt(category,proof.country,crypto.randomUUID(),type,[]);
      let metered=false;
      const started=Date.now();
      try {
        const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+proof.model+':generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(30_000),
          body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_PROMPT}]},contents:[{role:'user',parts:[{text:prompt}]}],
            generationConfig:{temperature:1.1,responseMimeType:'application/json',responseJsonSchema:QUESTION_SCHEMA,
              maxOutputTokens:4096,thinkingConfig:{thinkingLevel:'LOW'}}}),
        });
        // Error bodies may include upstream context; never print them or the key.
        if (!response.ok) throw new Error('Provider HTTP '+response.status);
        const payload=await response.json();const usage=payload.usageMetadata;
        if (!usage || !Number.isInteger(usage.promptTokenCount) || !Number.isInteger(usage.totalTokenCount)
          || usage.totalTokenCount < usage.promptTokenCount) throw new Error('Unmetered response');
        const outputTokens=Math.max(usage.totalTokenCount-usage.promptTokenCount,
          (usage.candidatesTokenCount??0)+(usage.thoughtsTokenCount??0));
        const cost=budget.settle(usage.promptTokenCount,outputTokens);metered=true;
        await append(events,{event:'metered',attempt,usage,costUSD:cost,latencyMS:Date.now()-started});
        const candidate=payload.candidates?.[0];
        if (candidate?.finishReason!=='STOP') throw new Error('Incomplete candidate');
        const text=(candidate.content?.parts??[]).filter((p:{thought?:boolean})=>!p.thought).map((p:{text?:string})=>p.text??'').join('');
        let q;
        try {q=JSON.parse(text);} catch { await append(outputs,{category,type,attempt,rejectedText:text,reason:'Invalid JSON'});throw new Error('Invalid JSON'); }
        const words=typeof q.question==='string'?q.question.trim().split(/\s+/).length:0;
        const structurallyValid=q.type===type && words>=8 && words<=14 && (type==='trivia'
          ?typeof q.correctAnswer==='string'&&q.correctAnswer.trim().length>0
            && Array.isArray(q.acceptableAnswers) && q.acceptableAnswers.every((a:unknown)=>typeof a==='string'&&a.trim().length>0)
          :typeof q.referenceAnswer==='number'&&q.referenceAnswer>0&&Number.isFinite(q.referenceAnswer)
            &&typeof q.unit==='string'&&q.unit.trim().length>0&&Array.isArray(q.steps)&&q.steps.length>=2);
        const scoreCases=type==='estimation' && structurallyValid
          ?[0,.5,.99,1,1.01,1.5,2,3].map(multiplier=>({answer:q.referenceAnswer*multiplier,
            ...evaluateFrozen(q.referenceAnswer,q.referenceAnswer*multiplier)})):type==='trivia' && structurallyValid
          ?[q.correctAnswer,...(Array.isArray(q.acceptableAnswers)?q.acceptableAnswers.slice(0,6):[]), 'deliberately wrong audit fixture']
            .map(answer=>({answer,score:matchesAcceptedAnswer(answer,[q.correctAnswer,...(q.acceptableAnswers??[]).slice(0,5)])?100:0,
              explanation:'Deterministic server alias matching; guesses are audit test fixtures, not player submissions.'})):[];
        await append(outputs,{category,type,sample,attempt,model:proof.model,prompt,rubric:RUBRIC_VERSION,question:q,
          scores:scoreCases,answer:type==='trivia'?q.correctAnswer:q.referenceAnswer,explanation:q.steps??[],
          structurallyValid,reviewStatus:'NOT HUMAN VALIDATED'});
        if (!structurallyValid) throw new Error('Candidate violates contract');
        accepted++;completed=true;
      } catch(e) {
        if (!metered) budget.uncertain();
        const message=e instanceof Error?e.message:'Provider failure';
        await append(events,{event:'rejected-or-failed',attempt,metered,message,latencyMS:Date.now()-started});
        if (message==='PROVIDER_BOUND_VIOLATION') throw e;
        // Bounded pause; every retry is a new counted, reserved attempt.
        await new Promise(resolve=>setTimeout(resolve,750));
      }
    }
  }
} catch(e) { stopped=e instanceof Error?e.message:'stopped'; }
const report={status:stopped,accepted,model:proof.model,rates:{input:proof.inputRate,output:proof.outputRate},
  attempts:budget.attempts,inputTokens:budget.inputTokens,outputTokensIncludingThinking:budget.outputTokens,
  measuredUSD:budget.measuredUSD,conservativeLiabilityUSD:budget.committedUSD,uncertainAttempts:budget.uncertainAttempts,
  questionFile:outputs,attemptFile:events};
await Deno.writeTextFile(dir+'/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (accepted!==28 || stopped!=='completed') Deno.exit(1);
