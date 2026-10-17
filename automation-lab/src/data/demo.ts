import type { Activity, Workflow } from '../types'

export const workflows:Workflow[]=[
 {id:'infra-temp',name:'Thermal guardrail',description:'Detects abnormal equipment temperature and raises a warning.',scenario:'Smart infrastructure',trigger:'Sensor reading received',logic:'AND',enabled:true,createdAt:'2026-10-12T09:00:00.000Z',conditions:[{id:'c1',field:'temperature',operator:'gt',value:50},{id:'c2',field:'systemOnline',operator:'isTrue'}],action:{type:'alert',label:'Generate thermal warning',severity:'warning'}},
 {id:'security-login',name:'Login risk containment',description:'Reviews repeated login failures before a protective lock.',scenario:'Security monitoring',trigger:'Authentication event received',logic:'OR',enabled:true,createdAt:'2026-10-12T09:10:00.000Z',conditions:[{id:'c3',field:'failedAttempts',operator:'gte',value:5},{id:'c4',field:'locationMismatch',operator:'isTrue'}],action:{type:'approval',label:'Temporarily lock account',severity:'critical'}},
 {id:'task-deadline',name:'Deadline sentinel',description:'Reminds owners when active work nears its deadline.',scenario:'Task management',trigger:'Schedule tick',logic:'AND',enabled:true,createdAt:'2026-10-12T09:20:00.000Z',conditions:[{id:'c5',field:'hoursRemaining',operator:'lte',value:24},{id:'c6',field:'taskStatus',operator:'neq',value:'done'}],action:{type:'reminder',label:'Send deadline reminder',severity:'info'}}
]

export const initialActivity:Activity[]=[{id:'welcome',timestamp:'2026-10-17T08:30:00.000Z',name:'Demo environment ready',description:'Three shared-engine scenarios loaded. All data is simulated.',severity:'info',status:'success'}]

export const scenarioDefaults:Record<string,Record<string,unknown>>={
 'infra-temp':{temperature:42,humidity:55,systemOnline:true},
 'security-login':{failedAttempts:3,locationMismatch:false,account:'demo.user'},
 'task-deadline':{hoursRemaining:30,taskStatus:'active',owner:'Demo operator'}
}
