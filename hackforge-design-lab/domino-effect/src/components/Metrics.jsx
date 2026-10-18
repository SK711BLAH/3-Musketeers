export default function Metrics({ stats, connectionStatus }) {
  const primary = [
    ['ACTIVE RIDERS', stats?.activeRiders ?? 0, 'neutral'],
    ['AVERAGE TRUST SCORE', stats?.averageTrust ?? 0, 'trusted'],
    ['ELEVATED RISK', stats?.elevatedRisk ?? 0, 'watch'],
    ['PENDING VERIFICATIONS', stats?.pendingVerifications ?? 0, 'neutral'],
  ];
  return <section className="engine-summary" aria-label="Still Engine automation status">
    <div className={`engine-connection ${connectionStatus.toLowerCase()}`}><i /><span>STILL ENGINE — {connectionStatus === 'CONNECTED' ? 'ACTIVE' : connectionStatus}</span></div>
    <div className="metric-grid">
      {primary.map(([label, value, tone]) => <article className={tone} key={label}><b>{value}</b><span>{label}</span></article>)}
    </div>
  </section>;
}
