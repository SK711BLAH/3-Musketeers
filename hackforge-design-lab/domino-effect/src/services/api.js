import {riders,sessions,initialCases,metrics,scenarios,evaluationSessions} from '../data/scenarios';
export class ShadowprintApi {
 async getRiders(){throw new Error('FastAPI adapter not configured')}
 async getSessions(){throw new Error('FastAPI adapter not configured')}
 async getBaseline(_riderId){throw new Error('FastAPI adapter not configured')}
 async getRiskAssessment(_sessionId){throw new Error('FastAPI adapter not configured')}
 async getCases(){throw new Error('FastAPI adapter not configured')}
 async createVerification(_sessionId){throw new Error('FastAPI adapter not configured')}
 async runSimulation(_scenarioId){throw new Error('FastAPI adapter not configured')}
 async evaluatePolicy(_threshold){throw new Error('FastAPI adapter not configured')}
 connectLiveEvents(_onEvent){throw new Error('WebSocket adapter not configured')}
}
export class DeterministicDemoAdapter {
 mode='DETERMINISTIC DEMO DATA';
 async loadSnapshot(){return {riders,sessions,cases:structuredClone(initialCases),metrics,scenarios,evaluationSessions}}
 async runSimulation(id){return structuredClone(scenarios[id])}
 evaluatePolicy(threshold){const flagged=evaluationSessions.filter(x=>x.score>=threshold);const takeovers=evaluationSessions.filter(x=>x.label==='takeover');const genuine=evaluationSessions.filter(x=>x.label==='genuine');const takeoverFlagged=flagged.filter(x=>x.label==='takeover').length;const genuineEscalated=flagged.filter(x=>x.label==='genuine').length;return {size:evaluationSessions.length,takeoverFlagged,takeoverMissed:takeovers.length-takeoverFlagged,genuineEscalated,verificationRequests:flagged.length,falsePositiveRate:genuineEscalated/genuine.length*100}}
}
export const api=new DeterministicDemoAdapter();
