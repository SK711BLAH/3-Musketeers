import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { initialActivity, workflows as demoWorkflows } from '../data/demo'
import { makeExecution } from '../engine/executor'
import type { Activity, Approval, Audit, Execution, Notification, Settings, Workflow } from '../types'

const uid=(p:string)=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
const activityStatus=(outcome:Execution['outcome']):Activity['status']=>outcome==='success'?'success':outcome==='pending'?'pending':outcome==='no-match'?'warning':'error'
type State={
 workflows:Workflow[];executions:Execution[];activity:Activity[];notifications:Notification[];approvals:Approval[];audit:Audit[];settings:Settings;busyIds:string[]
 execute:(id:string,inputs:Record<string,unknown>,key?:string)=>Execution|undefined;decide:(id:string,decision:'APPROVED'|'REJECTED')=>void
 toggleWorkflow:(id:string)=>void;saveWorkflow:(w:Workflow)=>void;deleteWorkflow:(id:string)=>void
 markRead:(id:string)=>void;markAllRead:()=>void;dismiss:(id:string)=>void;setSettings:(s:Partial<Settings>)=>void;reset:()=>void
}
const defaults=()=>({workflows:demoWorkflows,executions:[] as Execution[],activity:initialActivity,notifications:[] as Notification[],approvals:[] as Approval[],audit:[] as Audit[],settings:{theme:'dark',role:'ADMIN',notifySuccess:true,notifyWarning:true,confirmSensitive:true} as Settings,busyIds:[] as string[]})

export const useLabStore=create<State>()(persist((set,get)=>({
 ...defaults(),
 execute:(id,inputs,key)=>{
  const state=get(),workflow=state.workflows.find(w=>w.id===id)
  if(!workflow||!workflow.enabled)return undefined
  const duplicateKey=key??`${id}:${JSON.stringify(inputs)}`
  const recentDuplicate=state.executions.some(e=>e.workflowId===id&&JSON.stringify(e.inputs)===JSON.stringify(inputs)&&Date.now()-new Date(e.startedAt).getTime()<800)
  if(state.busyIds.includes(duplicateKey)||recentDuplicate)return undefined
  set({busyIds:[...state.busyIds,duplicateKey]})
  const execution=makeExecution(workflow,inputs),matched=execution.outcome!=='no-match',now=execution.startedAt
  const activityId=uid('event')
  const activity:Activity={id:activityId,executionId:execution.id,timestamp:now,name:execution.outcome==='pending'?'Approval requested':matched?'Execution completed':'Conditions not matched',description:matched?workflow.action.label:'No action executed.',severity:matched?workflow.action.severity:'info',status:activityStatus(execution.outcome),workflowId:workflow.id,details:{inputs,trace:execution.trace}}
  const notification:Notification={id:uid('note'),executionId:execution.id,timestamp:now,title:execution.outcome==='pending'?'Human decision required':matched?'Automation completed':'Rule evaluated',message:`${workflow.name}: ${activity.description}`,severity:matched?workflow.action.severity:'info',read:false,relatedActivityId:activityId}
  const approval:Approval|undefined=execution.outcome==='pending'?{id:uid('approval'),executionId:execution.id,workflowId:workflow.id,workflowName:workflow.name,requestedAction:workflow.action.label,reason:'The rule matched a sensitive action configured for human review.',severity:workflow.action.severity,evidence:inputs,timestamp:now,state:'PENDING'}:undefined
  const audit:Audit={id:uid('audit'),timestamp:now,initiator:'Demo engine',workflowName:workflow.name,action:'Execute workflow',previousStatus:'IDLE',newStatus:execution.outcome.toUpperCase(),outcome:execution.outcome,details:{executionId:execution.id,inputs}}
  const notify=workflow.action.severity==='success'?state.settings.notifySuccess:workflow.action.severity==='warning'||workflow.action.severity==='critical'?state.settings.notifyWarning:true
  set(s=>({executions:[execution,...s.executions],activity:[activity,...s.activity],notifications:notify?[notification,...s.notifications]:s.notifications,approvals:approval?[approval,...s.approvals]:s.approvals,audit:[audit,...s.audit],workflows:s.workflows.map(w=>w.id===id?{...w,lastRunAt:now}:w),busyIds:s.busyIds.filter(x=>x!==duplicateKey)}))
  return execution
 },
 decide:(id,decision)=>set(s=>{
  const approval=s.approvals.find(a=>a.id===id);if(!approval||approval.state!=='PENDING'||s.settings.role==='VIEWER')return s
  const now=new Date().toISOString(),approved=decision==='APPROVED',execution=s.executions.find(e=>e.id===approval.executionId)
  const activity:Activity={id:uid('event'),executionId:approval.executionId,timestamp:now,name:approved?'Action approved':'Action rejected',description:approved?`${approval.requestedAction} executed after review.`:'Sensitive action was not executed.',severity:approved?'success':'warning',status:approved?'success':'warning',workflowId:approval.workflowId,details:approval.evidence}
  const note:Notification={id:uid('note'),executionId:approval.executionId,timestamp:now,title:`Approval ${approved?'granted':'rejected'}`,message:`${approval.workflowName}: ${activity.description}`,severity:approved?'success':'warning',read:false,relatedActivityId:activity.id}
  const audit:Audit={id:uid('audit'),timestamp:now,initiator:s.settings.role,workflowName:approval.workflowName,action:approved?'Approve action':'Reject action',previousStatus:'PENDING',newStatus:decision,outcome:approved?'executed':'cancelled',details:approval.evidence}
  return{approvals:s.approvals.map(a=>a.id===id?{...a,state:decision}:a),executions:s.executions.map(e=>e.id===approval.executionId?{...e,outcome:approved?'success':'failed',trace:[...e.trace,{id:uid('step'),label:approved?'Approval granted':'Approval rejected',detail:activity.description,status:approved?'completed':'failed',at:now}]}:e),activity:[activity,...s.activity],notifications:[note,...s.notifications],audit:[audit,...s.audit]}
 }),
 toggleWorkflow:id=>set(s=>{const w=s.workflows.find(x=>x.id===id);if(!w)return s;const enabled=!w.enabled;return{workflows:s.workflows.map(x=>x.id===id?{...x,enabled}:x),audit:[{id:uid('audit'),timestamp:new Date().toISOString(),initiator:s.settings.role,workflowName:w.name,action:'Change workflow status',previousStatus:w.enabled?'ENABLED':'DISABLED',newStatus:enabled?'ENABLED':'DISABLED',outcome:'updated'},...s.audit]}}),
 saveWorkflow:w=>set(s=>{const exists=s.workflows.some(x=>x.id===w.id);return{workflows:exists?s.workflows.map(x=>x.id===w.id?w:x):[w,...s.workflows],audit:[{id:uid('audit'),timestamp:new Date().toISOString(),initiator:s.settings.role,workflowName:w.name,action:exists?'Edit workflow':'Create workflow',previousStatus:exists?'EXISTING':'NONE',newStatus:'SAVED',outcome:'success'},...s.audit]}}),
 deleteWorkflow:id=>set(s=>{const w=s.workflows.find(x=>x.id===id);return{workflows:s.workflows.filter(x=>x.id!==id),audit:w?[{id:uid('audit'),timestamp:new Date().toISOString(),initiator:s.settings.role,workflowName:w.name,action:'Delete workflow',previousStatus:'EXISTING',newStatus:'DELETED',outcome:'success'},...s.audit]:s.audit}}),
 markRead:id=>set(s=>({notifications:s.notifications.map(n=>n.id===id?{...n,read:true}:n)})),markAllRead:()=>set(s=>({notifications:s.notifications.map(n=>({...n,read:true}))})),dismiss:id=>set(s=>({notifications:s.notifications.filter(n=>n.id!==id)})),
 setSettings:patch=>set(s=>({settings:{...s.settings,...patch}})),reset:()=>set(defaults())
}),{name:'automation-lab-state',version:1}))

export const selectMetrics=(s:State)=>({active:s.workflows.filter(w=>w.enabled).length,total:s.executions.length,success:s.executions.filter(e=>e.outcome==='success').length,failed:s.executions.filter(e=>e.outcome==='failed').length,pending:s.approvals.filter(a=>a.state==='PENDING').length,unread:s.notifications.filter(n=>!n.read).length})
