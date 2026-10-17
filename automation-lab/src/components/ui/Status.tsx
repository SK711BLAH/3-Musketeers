import type { Severity } from '../../types';import { cn } from '../../utils/cn'
const color:Record<string,string>={info:'bg-sky-500',success:'bg-emerald-500',warning:'bg-amber-500',critical:'bg-rose-500',error:'bg-rose-500',pending:'bg-amber-500'}
export function Status({value,className}:{value:string;className?:string}){return <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider',className)}><i className={cn('status-dot',color[value.toLowerCase()]??'bg-ink/30')}/>{value}</span>}
export const severityColor=(s:Severity)=>color[s]
