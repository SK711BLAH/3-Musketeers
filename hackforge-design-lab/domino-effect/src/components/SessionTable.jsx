import { useMemo, useState } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';

export default function SessionTable({ riders, onSelect }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('confidence');
  const rows = useMemo(() => riders
    .filter(rider => filter === 'ALL' || rider.riskLevel === filter)
    .filter(rider => `${rider.id} ${rider.name} ${rider.city} ${rider.lastEvent}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'confidence'
      ? a.identityConfidence - b.identityConfidence
      : a.name.localeCompare(b.name)), [riders, query, filter, sort]);
  return <section className="data-section">
    <div className="section-title">
      <div><span>CONTINUOUS SESSION ACTIVITY / DEMO</span><h2>LIVE RIDER FEED</h2></div>
      <div className="table-tools">
        <label><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search rider or event" /></label>
        <select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filter by risk">
          {['ALL', 'TRUSTED', 'SUSPICIOUS', 'HIGH RISK'].map(value => <option key={value}>{value}</option>)}
        </select>
        <button onClick={() => setSort(sort === 'confidence' ? 'name' : 'confidence')}><ArrowUpDown /> {sort === 'confidence' ? 'CONFIDENCE' : 'RIDER'}</button>
      </div>
    </div>
    <div className="session-table">
      <div className="rider-row table-head"><span>RIDER</span><span>DEVICE</span><span>IDENTITY CONFIDENCE</span><span>RISK</span><span>AUTOMATED ACTION</span><span>LAST EVENT</span></div>
      {rows.map(rider => <button className="rider-row" onClick={() => onSelect(rider.id)} key={rider.id}>
        <strong>{rider.name}<small>{rider.id} · {rider.city}</small></strong>
        <span>{rider.device}</span>
        <b className="table-confidence">{rider.identityConfidence}%</b>
        <em className={rider.riskLevel.toLowerCase().replace(' ', '-')}>{rider.riskLevel}</em>
        <span>{rider.automatedAction}</span>
        <span>{rider.lastEvent}</span>
      </button>)}
    </div>
  </section>;
}
