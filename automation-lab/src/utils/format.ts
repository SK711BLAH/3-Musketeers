export const time=(iso:string)=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(iso))
export const dateTime=(iso:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso))
export const csv=(rows:Record<string,unknown>[])=>{const keys=Object.keys(rows[0]??{});return[keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\n')}
