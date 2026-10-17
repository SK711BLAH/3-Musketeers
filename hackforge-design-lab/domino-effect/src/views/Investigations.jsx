import {useState} from 'react';
import {ClipboardCheck,History,MessageSquareText} from 'lucide-react';

const highImpact=new Set(['Request verification','Escalate','Resolve']);

export default function Investigations({cases,setCases}){
 const [selected,setSelected]=useState(cases[0]?.id);
 const current=cases.find(c=>c.id===selected)||cases[0];
 const act=(action)=>{
  if(highImpact.has(action)&&!window.confirm(`${action} ${current.id}? This updates the deterministic demo case and audit trail.`))return;
  setCases(all=>all.map(c=>c.id!==current.id?c:{
   ...c,
   status:action==='Review case'?'In review':action==='Mark legitimate'||action==='Mark inconclusive'||action==='Resolve'?'Resolved':action==='Reopen'?'Open':action==='Escalate'?'Escalated':c.status,
   verification:action==='Request verification'?'Requested · demo':c.verification,
   resolution:action==='Mark legitimate'?'Legitimate':action==='Mark inconclusive'?'Inconclusive':action==='Resolve'?'Resolved after review':action==='Reopen'?'—':c.resolution,
   audit:[...c.audit,`${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · Demo analyst · ${action}`]
  }));
 };
 return <main className="page"><section className="page-hero"><div><span>HUMAN REVIEW / PROPORTIONATE RESPONSE</span><h1>OPEN <i>INVESTIGATIONS.</i></h1><p>A behavioral anomaly is not proof of fraud. Review evidence, request proportionate verification, and preserve an auditable decision trail.</p></div><ClipboardCheck/></section><section className="case-layout"><div className="case-list">{cases.map(c=><button className={selected===c.id?'selected':''} onClick={()=>setSelected(c.id)} key={c.id}><span>{c.id}<em>{c.status}</em></span><b>{c.riderId}</b><small>{c.sessionId} · Risk {c.risk} · Confidence {c.confidence}%</small></button>)}</div>{current&&<article className="case-detail"><div className="case-title"><div><span>{current.id} / {current.status}</span><h2>{current.riderId} · {current.sessionId}</h2></div><div className="score-pair compact"><div><b>{current.risk}</b><span>RISK</span></div><div><b>{current.confidence}%</b><span>CONF.</span></div></div></div><div className="case-columns"><div><h3>TRIGGERING SIGNALS</h3>{current.signals.map(x=><p className="finding" key={x}>{x}</p>)}<h3>RECOMMENDED ACTION</h3><strong>{current.recommended}</strong><p>Verification: {current.verification}</p><p>Resolution: {current.resolution}</p></div><div><h3><History/> EVENT TIMELINE</h3>{current.timeline.map(x=><p key={x}>{x}</p>)}<h3><MessageSquareText/> ANALYST NOTES</h3><p>{current.notes}</p></div></div><div className="case-actions">{['Review case','Request verification','Mark legitimate','Mark inconclusive','Escalate','Resolve',...(current.status==='Resolved'?['Reopen']:[])].map(x=><button onClick={()=>act(x)} key={x}>{x}</button>)}</div><div className="audit"><h3>AUDIT TRAIL</h3>{current.audit.map((x,i)=><p key={i}>{x}</p>)}</div></article>}</section></main>;
}
