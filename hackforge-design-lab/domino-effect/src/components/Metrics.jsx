export default function Metrics({ riders }) {
  const active = riders.length;
  const trusted = riders.filter(rider => rider.riskLevel === 'TRUSTED').length;
  const suspicious = riders.filter(rider => rider.riskLevel === 'SUSPICIOUS').length;
  const highRisk = riders.filter(rider => rider.riskLevel === 'HIGH RISK').length;
  const average = active
    ? Math.round(riders.reduce((sum, rider) => sum + rider.identityConfidence, 0) / active)
    : 0;
  const primary = [
    ['ACTIVE RIDERS', active, 'neutral'],
    ['TRUSTED', trusted, 'trusted'],
    ['SUSPICIOUS', suspicious, 'watch'],
    ['HIGH RISK', highRisk, 'risk'],
  ];
  return <section className="metric-grid" aria-label="Live rider statistics">
    {primary.map(([label, value, tone]) => <article className={tone} key={label}><b>{value}</b><span>{label}</span></article>)}
    <small>AVERAGE IDENTITY CONFIDENCE · {average}%</small>
  </section>;
}
