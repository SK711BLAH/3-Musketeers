import {useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {Edit3,Play,Plus,Trash2,X} from 'lucide-react'
import {z} from 'zod'
import {useForm} from 'react-hook-form'
import {zodResolver} from '@hookform/resolvers/zod'
import {useLabStore} from '../../stores/useLabStore'
import {scenarioDefaults} from '../../data/demo'
import {PageHeader} from '../../components/ui/PageHeader'
import {Status} from '../../components/ui/Status'
import {operatorLabel} from '../../engine/evaluator'
import type {Workflow} from '../../types'

const schema=z.object({name:z.string().min(3),description:z.string().min(8),field:z.string().min(1),value:z.coerce.number(),action:z.string().min(3)})

export function AutomationsPage(){
 const s=useLabStore(),[editing,setEditing]=useState<Workflow|null|undefined>(undefined)
 const remove=(w:Workflow)=>{if(window.confirm(`Delete “${w.name}”? This cannot be undone.`))s.deleteWorkflow(w.id)}
 return <div className="animate-enter"><PageHeader eyebrow="Build / Rules" title="Automations" description="Create, control, and run structured IF–THEN rules. No rule content is dynamically executed." action={<button className="btn-primary" onClick={()=>setEditing(null)}><Plus size={16}/>New automation</button>}/><div className="space-y-3">{s.workflows.map(w=><article className="panel grid gap-4 p-5 lg:grid-cols-[1.1fr_1fr_auto] lg:items-center" key={w.id}><div><div className="flex flex-wrap items-center gap-2"><Status value={w.enabled?'success':'pending'}/><span className="label">{w.scenario}</span></div><h2 className="mt-3 font-semibold">{w.name}</h2><p className="mt-1 text-sm text-ink/50">{w.description}</p></div><div className="border-l border-line pl-4"><p className="label">IF / {w.logic}</p><p className="mt-2 font-mono text-xs leading-6">{w.conditions.map(c=>`${c.field} ${operatorLabel[c.operator]} ${c.value??''}`).join(` ${w.logic} `)}<br/><span className="text-signal">THEN</span> {w.action.label}</p></div><div className="flex gap-2"><button className="btn" disabled={!w.enabled} onClick={()=>s.execute(w.id,scenarioDefaults[w.id]??{[w.conditions[0].field]:Number(w.conditions[0].value)+1})} title="Run automation"><Play size={15}/><span className="hidden xl:inline">Run</span></button><button className="btn px-2.5" onClick={()=>setEditing(w)} aria-label={`Edit ${w.name}`}><Edit3 size={15}/></button><button className="btn px-2.5" onClick={()=>s.toggleWorkflow(w.id)}>{w.enabled?'Disable':'Enable'}</button><button className="btn px-2.5 text-rose-500" onClick={()=>remove(w)} aria-label={`Delete ${w.name}`}><Trash2 size={15}/></button></div></article>)}</div>{editing!==undefined&&<WorkflowDialog workflow={editing} close={()=>setEditing(undefined)}/>}</div>
}

function WorkflowDialog({workflow,close}:{workflow:Workflow|null;close:()=>void}){
 const save=useLabStore(s=>s.saveWorkflow)
 const {register,handleSubmit,formState:{errors}}=useForm<z.input<typeof schema>,unknown,z.output<typeof schema>>({resolver:zodResolver(schema),defaultValues:{name:workflow?.name??'',description:workflow?.description??'',field:workflow?.conditions[0].field??'temperature',value:Number(workflow?.conditions[0].value??50),action:workflow?.action.label??'Generate warning'}})
 const submit=handleSubmit(d=>{save({id:workflow?.id??`custom-${Date.now()}`,name:d.name,description:d.description,scenario:'Custom',trigger:'Manual or adapter event',logic:'AND',enabled:workflow?.enabled??true,createdAt:workflow?.createdAt??new Date().toISOString(),lastRunAt:workflow?.lastRunAt,conditions:[{id:`condition-${Date.now()}`,field:d.field,operator:'gt',value:d.value}],action:{type:'alert',label:d.action,severity:'warning'}});close()})
 return <Dialog.Root open onOpenChange={o=>!o&&close()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/60"/><Dialog.Content className="panel fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-6"><Dialog.Title className="text-xl font-semibold">{workflow?'Edit automation':'New automation'}</Dialog.Title><Dialog.Description className="mt-1 text-sm text-ink/50">Create a safe structured threshold rule.</Dialog.Description><Dialog.Close className="absolute right-4 top-4"><X/></Dialog.Close><form className="mt-6 space-y-4" onSubmit={submit}><label className="block"><span className="label">Name</span><input className="input mt-1" {...register('name')}/></label><label className="block"><span className="label">Description</span><input className="input mt-1" {...register('description')}/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Input field</span><input className="input mt-1" {...register('field')}/></label><label><span className="label">Greater than</span><input className="input mt-1" type="number" {...register('value')}/></label></div><label className="block"><span className="label">Then action</span><input className="input mt-1" {...register('action')}/></label>{Object.keys(errors).length>0&&<p role="alert" className="text-sm text-rose-500">Enter a valid name, description, field, numeric threshold, and action.</p>}<div className="flex justify-end gap-2 pt-2"><button type="button" className="btn" onClick={close}>Cancel</button><button className="btn-primary">Save automation</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
}
