import type { Condition, Evaluation, Workflow } from '../types'

const n=(v:unknown)=>typeof v==='number'?v:Number(v)
export function evaluateCondition(condition:Condition,actual:unknown):boolean{
 switch(condition.operator){
  case'gt':return n(actual)>n(condition.value)
  case'lt':return n(actual)<n(condition.value)
  case'gte':return n(actual)>=n(condition.value)
  case'lte':return n(actual)<=n(condition.value)
  case'eq':return String(actual).toLowerCase()===String(condition.value).toLowerCase()
  case'neq':return String(actual).toLowerCase()!==String(condition.value).toLowerCase()
  case'contains':return String(actual).toLowerCase().includes(String(condition.value).toLowerCase())
  case'isTrue':return actual===true
  case'isFalse':return actual===false
 }
}
export const operatorLabel:Record<Condition['operator'],string>={gt:'>',lt:'<',gte:'≥',lte:'≤',eq:'=',neq:'≠',contains:'contains',isTrue:'is true',isFalse:'is false'}
export function evaluateWorkflow(workflow:Workflow,inputs:Record<string,unknown>):Evaluation{
 const conditions=workflow.conditions.map(condition=>{const actual=inputs[condition.field];const passed=evaluateCondition(condition,actual);return{condition,actual,passed,explanation:`${condition.field} (${String(actual)}) ${operatorLabel[condition.operator]} ${condition.value??''}`.trim()}})
 return{matched:workflow.logic==='AND'?conditions.every(c=>c.passed):conditions.some(c=>c.passed),conditions}
}
