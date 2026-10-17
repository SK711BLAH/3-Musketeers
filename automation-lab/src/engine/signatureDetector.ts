import type { RiderSession, SecondSignatureResult } from '../types/detection'
import { circularDifferenceMinutes, summarize } from './baseline'

type Vector = number[]
const distanceSquared = (a: Vector, b: Vector): number => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0)
const meanVector = (vectors: Vector[]): Vector => vectors[0].map((_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length)

const rawVector = (session: RiderSession): Vector => {
  const angle = (session.loginTimeMinutes / 1440) * Math.PI * 2
  return [
    Math.sin(angle),
    Math.cos(angle),
    session.averageDeliveryDurationMinutes,
    session.acceptanceRate,
    session.averageBreakDurationMinutes,
    session.shiftDurationMinutes,
  ]
}

function standardizedVectors(sessions: RiderSession[]): Vector[] {
  const raw = sessions.map(rawVector)
  return raw.map(vector => vector.map((value, index) => {
    const column = raw.map(item => item[index])
    const stats = summarize(column)
    const spread = Math.max(stats.standardDeviation, index < 2 ? 0.08 : index === 3 ? 0.03 : 1)
    return (value - stats.mean) / spread
  }))
}

function cluster(vectors: Vector[]): { labels: number[]; centroids: [Vector, Vector]; twoSse: number; oneSse: number } {
  const overall = meanVector(vectors)
  let first = vectors.reduce((best, vector) => distanceSquared(vector, overall) > distanceSquared(best, overall) ? vector : best, vectors[0])
  let second = vectors.reduce((best, vector) => distanceSquared(vector, first) > distanceSquared(best, first) ? vector : best, vectors[0])
  let labels = vectors.map(vector => distanceSquared(vector, first) <= distanceSquared(vector, second) ? 0 : 1)
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const groups = [vectors.filter((_, index) => labels[index] === 0), vectors.filter((_, index) => labels[index] === 1)]
    if (!groups[0].length || !groups[1].length) break
    first = meanVector(groups[0])
    second = meanVector(groups[1])
    const next = vectors.map(vector => distanceSquared(vector, first) <= distanceSquared(vector, second) ? 0 : 1)
    if (next.every((label, index) => label === labels[index])) break
    labels = next
  }
  const centroids: [Vector, Vector] = [first, second]
  return {
    labels,
    centroids,
    twoSse: vectors.reduce((sum, vector, index) => sum + distanceSquared(vector, centroids[labels[index]]), 0),
    oneSse: vectors.reduce((sum, vector) => sum + distanceSquared(vector, overall), 0),
  }
}

const circularCenter = (values: number[]): number => {
  const sin = values.reduce((sum, value) => sum + Math.sin(value / 1440 * Math.PI * 2), 0)
  const cos = values.reduce((sum, value) => sum + Math.cos(value / 1440 * Math.PI * 2), 0)
  const angle = Math.atan2(sin, cos)
  return ((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2)) * 1440
}

function distinguishingFeatures(sessions: RiderSession[], labels: number[]): string[] {
  const groups = [sessions.filter((_, i) => labels[i] === 0), sessions.filter((_, i) => labels[i] === 1)]
  const features: string[] = []
  const loginCenter = groups.map(group => circularCenter(group.map(s => s.loginTimeMinutes)))
  const loginSpread = Math.max(summarize(sessions.map(s => circularDifferenceMinutes(s.loginTimeMinutes, circularCenter(sessions.map(x => x.loginTimeMinutes))))).standardDeviation, 45)
  if (circularDifferenceMinutes(loginCenter[0], loginCenter[1]) / loginSpread >= 1.5) features.push('login time')

  const definitions: [string, (session: RiderSession) => number, number][] = [
    ['delivery duration', s => s.averageDeliveryDurationMinutes, 2.5],
    ['acceptance rate', s => s.acceptanceRate, 0.04],
    ['break duration', s => s.averageBreakDurationMinutes, 3],
    ['shift duration', s => s.shiftDurationMinutes, 35],
  ]
  for (const [name, getter, floor] of definitions) {
    const all = sessions.map(getter)
    const means = groups.map(group => group.map(getter).reduce((sum, value) => sum + value, 0) / group.length)
    if (Math.abs(means[0] - means[1]) / Math.max(summarize(all).standardDeviation, floor) >= 1.5) features.push(name)
  }
  return features
}

function patternsRecur(labels: number[]): boolean {
  const switches = labels.slice(1).filter((label, index) => label !== labels[index]).length
  const binSize = Math.ceil(labels.length / 3)
  const binsFor = (target: number) => new Set(labels.map((label, index) => label === target ? Math.floor(index / binSize) : -1).filter(bin => bin >= 0)).size
  return switches >= 3 || (binsFor(0) >= 2 && binsFor(1) >= 2)
}

export function detectSecondSignature(sessions: RiderSession[]): SecondSignatureResult {
  if (sessions.length < 12) {
    return { status: 'INCONCLUSIVE', secondSignatureDetected: false, patternCount: 1, distinguishingFeatures: [], confidenceLevel: 'inconclusive', observations: sessions.length, explanation: 'At least 12 sessions are needed to compare recurring behavioral patterns.' }
  }
  const ordered = [...sessions].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const result = cluster(standardizedVectors(ordered))
  const sizes = [result.labels.filter(label => label === 0).length, result.labels.filter(label => label === 1).length]
  const improvement = result.oneSse === 0 ? 0 : 1 - result.twoSse / result.oneSse
  const centroidDistance = Math.sqrt(distanceSquared(result.centroids[0], result.centroids[1]))
  const features = distinguishingFeatures(ordered, result.labels)
  const behavioralFeatures = features.filter(feature => feature !== 'login time')
  const sufficientClusters = Math.min(...sizes) >= 5 && Math.min(...sizes) / ordered.length >= 0.18
  const recurring = patternsRecur(result.labels)
  const detected = sufficientClusters && recurring && improvement >= 0.45 && centroidDistance >= 2.2 && behavioralFeatures.length >= 2
  if (!detected) {
    return { status: 'NOT_DETECTED', secondSignatureDetected: false, patternCount: 1, distinguishingFeatures: features, confidenceLevel: 'low', observations: ordered.length, explanation: 'The data does not show two sufficiently large, recurring, multi-feature patterns. Schedule differences alone are not treated as a second identity.' }
  }
  const confidenceLevel = improvement >= 0.65 && Math.min(...sizes) >= 8 ? 'high' : 'moderate'
  return {
    status: 'DETECTED',
    secondSignatureDetected: true,
    patternCount: 2,
    distinguishingFeatures: features,
    confidenceLevel,
    observations: ordered.length,
    explanation: 'Two recurring behavioral patterns were observed. This is not proof of account sharing; additional identity verification may be appropriate.',
  }
}
