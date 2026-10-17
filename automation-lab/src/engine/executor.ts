import { evaluateWorkflow } from './evaluator'
import type { Execution, Workflow } from '../types'
const uid=(prefix:string)=>`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`
export function makeExecution(workflow:Workflow,inputs:Record<string,unknown>):Execution{
 const now=new Date().toISOString(),evaluation=evaluateWorkflow(workflow,inputs),id=uid('run')
 const trace=[
  {id:uid('step'),label:'Input received',detail:`${workflow.trigger}: ${Object.entries(inputs).map(([k,v])=>`${k}=${v}`).join(', ')}`,status:'completed' as const,at:now},
  ...evaluation.conditions.map(c=>({id:uid('step'),label:`Condition ${c.passed?'satisfied':'not satisfied'}`,detail:c.explanation,status:c.passed?'completed' as const:'failed' as const,at:now})),
  {id:uid('step'),label:evaluation.matched?'Rule matched':'Rule skipped',detail:evaluation.matched?`${workflow.logic} logic resolved true.`:`${workflow.logic} logic resolved false.`,status:evaluation.matched?'completed' as const:'failed' as const,at:now},
  {id:uid('step'),label:evaluation.matched?(workflow.action.type==='approval'?'Approval requested':'Action executed'):'No action required',detail:evaluation.matched?workflow.action.label:'The configured action was not selected.',status:evaluation.matched&&workflow.action.type==='approval'?'pending' as const:evaluation.matched?'completed' as const:'failed' as const,at:now}
 ]
 return{id,workflowId:workflow.id,workflowName:workflow.name,startedAt:now,outcome:!evaluation.matched?'no-match':workflow.action.type==='approval'?'pending':'success',inputs,trace,actionLabel:workflow.action.label}
}
