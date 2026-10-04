/** Reserve worst-case charge BEFORE every upstream attempt (including retries). */
export class AuditBudget {
  attempts = 0;
  committedUSD = 0;
  measuredUSD = 0;
  inputTokens = 0;
  outputTokens = 0;
  uncertainAttempts = 0;
  constructor(readonly worstAttemptUSD:number, readonly inputRate:number, readonly outputRate:number) {
    if (![worstAttemptUSD,inputRate,outputRate].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid rates/bounds');
  }
  reserve() {
    if (this.attempts>=80 || this.committedUSD+this.worstAttemptUSD>2) throw new Error('PILOT_LIMIT');
    this.attempts++;
    this.committedUSD+=this.worstAttemptUSD;
  }
  settle(input:number, output:number) {
    if (![input,output].every(n=>Number.isInteger(n)&&n>=0)) throw new Error('Missing/invalid billable usage');
    const cost=(input*this.inputRate+output*this.outputRate)/1_000_000;
    if (cost>this.worstAttemptUSD+1e-9) throw new Error('PROVIDER_BOUND_VIOLATION');
    this.committedUSD+=cost-this.worstAttemptUSD;
    this.measuredUSD+=cost;this.inputTokens+=input;this.outputTokens+=output;
    return cost;
  }
  uncertain() { this.uncertainAttempts++; } // Never release reservation for unmetered/timeout responses.
}
