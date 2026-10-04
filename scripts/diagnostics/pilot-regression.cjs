const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const path=require('node:path');
function source(file){
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports});return module.exports;
}
const {AuditBudget}=source('auditBudget.ts');
const {evaluateFrozen,scoreFromDeviation}=source('../../supabase/functions/_shared/estimation.ts');
const {matchesAcceptedAnswer}=source('../../supabase/functions/_shared/trivia.ts');
const worst=new AuditBudget(.75,.75,3.75);
worst.reserve();worst.uncertain();worst.reserve();worst.uncertain();
assert.throws(()=>worst.reserve(),/PILOT_LIMIT/);assert.equal(worst.attempts,2);assert.equal(worst.committedUSD,1.5);
const attempts=new AuditBudget(.001,.75,3.75);
for(let i=0;i<80;i++){attempts.reserve();attempts.settle(1,1);}
assert.throws(()=>attempts.reserve(),/PILOT_LIMIT/);
assert.throws(()=>attempts.settle(NaN,0),/invalid billable/);
const accounting=new AuditBudget(.1,.75,3.75);accounting.reserve();accounting.settle(1000,2000);
assert.ok(Math.abs(accounting.committedUSD-.00825)<1e-12);
assert.equal(accounting.outputTokens,2000);
assert.equal(evaluateFrozen(.1,.2).deviationPercent,100); // No max(reference,1) distortion.
assert.equal(evaluateFrozen(100,100).score,100);assert.equal(evaluateFrozen(100,300).score,0);
assert.throws(()=>evaluateFrozen(0,0));assert.throws(()=>evaluateFrozen(-5,3));
let previous=100;for(let d=0;d<=1000;d+=.25){const score=scoreFromDeviation(d);assert.ok(score<=previous&&score>=0&&score<=100);previous=score;}
assert.equal(matchesAcceptedAnswer('SATURN',['Saturn']),true);
assert.equal(matchesAcceptedAnswer('Saturn!!!',['Saturn']),true);
assert.equal(matchesAcceptedAnswer('Mars',['Saturn']),false);
console.log(JSON.stringify({kind:'offline-bounded-pilot-and-rubric',cases:8,passed:true,providerAttempts:0,spendUSD:0},null,2));
