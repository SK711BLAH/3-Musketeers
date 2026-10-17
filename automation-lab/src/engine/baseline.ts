import type { BehavioralFingerprint, NumericBaseline, RiderSession } from '../types/detection'

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const percentile = (values: number[], position: number): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const fraction = index - lower
  return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * fraction
}

export const circularDifferenceMinutes = (a: number, b: number): number => {
  const difference = Math.abs(a - b) % 1440
  return Math.min(difference, 1440 - difference)
}

const circularMeanMinutes = (values: number[]): number => {
  const angles = values.map(value => (value / 1440) * Math.PI * 2)
  const sin = angles.reduce((sum, angle) => sum + Math.sin(angle), 0) / angles.length
  const cos = angles.reduce((sum, angle) => sum + Math.cos(angle), 0) / angles.length
  const angle = Math.atan2(sin, cos)
  return Math.round((((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 1440) % 1440)
}

export const summarize = (values: number[]): NumericBaseline => {
  if (!values.length) return { mean: 0, median: 0, standardDeviation: 0, robustSpread: 0, typicalRange: [0, 0] }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const q1 = percentile(values, 0.25)
  const q3 = percentile(values, 0.75)
  return {
    mean,
    median: median(values),
    standardDeviation: Math.sqrt(variance),
    robustSpread: (q3 - q1) / 1.349,
    typicalRange: [percentile(values, 0.1), percentile(values, 0.9)],
  }
}

const summarizeCircular = (values: number[]): NumericBaseline => {
  const center = circularMeanMinutes(values)
  const signed = values.map(value => {
    let delta = value - center
    if (delta > 720) delta -= 1440
    if (delta < -720) delta += 1440
    return delta
  })
  const spread = summarize(signed)
  return {
    ...spread,
    mean: center,
    median: (center + spread.median + 1440) % 1440,
    typicalRange: [
      (center + spread.typicalRange[0] + 1440) % 1440,
      (center + spread.typicalRange[1] + 1440) % 1440,
    ],
  }
}

const frequencies = (values: string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1
    return counts
  }, {})

const mode = (counts: Record<string, number>): string =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? ''

export function buildBehavioralFingerprint(riderId: string, history: RiderSession[]): BehavioralFingerprint {
  const sessions = history.filter(session => session.riderId === riderId)
  const knownDevices = frequencies(sessions.map(session => session.deviceId))
  const knownCities = frequencies(sessions.map(session => session.city))
  const knownZones = frequencies(sessions.map(session => session.deliveryZone))
  return {
    riderId,
    sampleSize: sessions.length,
    loginTime: summarizeCircular(sessions.map(session => session.loginTimeMinutes)),
    deliveryDuration: summarize(sessions.map(session => session.averageDeliveryDurationMinutes)),
    acceptanceRate: summarize(sessions.map(session => session.acceptanceRate)),
    breakDuration: summarize(sessions.map(session => session.averageBreakDurationMinutes)),
    shiftDuration: summarize(sessions.map(session => session.shiftDurationMinutes)),
    knownDevices,
    knownCities,
    knownZones,
    primaryDeviceId: mode(knownDevices),
    primaryCity: mode(knownCities),
    primaryZone: mode(knownZones),
    generatedAt: sessions.reduce((latest, session) => session.timestamp > latest ? session.timestamp : latest, new Date(0).toISOString()),
  }
}
