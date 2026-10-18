import { Activity, Bike } from 'lucide-react';

export const views = ['LIVE MONITOR', 'INTELLIGENCE LAB', 'RIDER INSIGHTS'];

export default function Header({ view, onNavigate, onRiderDemo, mode }) {
  return (
    <header className="app-header">
      <button className="brand" onClick={() => onNavigate('LIVE MONITOR')} aria-label="StillYou? live monitor">
        <b>STILL</b><i>YOU?</i>
        <small>IDENTITY ISN'T A ONE-TIME CHECK.</small>
      </button>
      <nav aria-label="Primary navigation">
        {views.map(name => (
          <button className={view === name ? 'on' : ''} onClick={() => onNavigate(name)} key={name}>{name}</button>
        ))}
      </nav>
      <div className="header-actions">
        <span className="system-active"><Activity /> SYSTEM ACTIVE</span>
        <button className="rider-demo-link" onClick={onRiderDemo}><Bike /> RIDER PORTAL</button>
        <small>{mode}</small>
      </div>
    </header>
  );
}
