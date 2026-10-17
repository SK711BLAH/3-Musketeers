import type { DetectionConfig, SecondSignatureResult, SessionRecord } from '../types/detection';
import { defaultDetectionConfig } from './config';
import { circularDifferenceMinutes, mean, standardDeviation } from './statistics';

type Vector = number[];

function euclideanSquared(a: Vector, b: Vector): number {
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
}

function vectorMean(vectors: Vector[]): Vector {
  return vectors[0].map((_, index) => mean(vectors.map((vector) => vector[index])));
}

function featureVector(session: SessionRecord): Vector {
  const angle = (session.loginMinute / 1440) * Math.PI * 2;
  return [
    Math.sin(angle),
    Math.cos(angle),
    session.averageDeliveryMinutes,
    session.acceptanceRate,
    session.averageBreakMinutes,
    session.shiftDurationHours,
  ];
}

function standardize(vectors: Vector[]): Vector[] {
  const columns = vectors[0].map((_, index) => vectors.map((vector) => vector[index]));
  const centers = columns.map(mean);
  const spreads = columns.map((column, index) => Math.max(standardDeviation(column, centers[index]), 0.01));
  return vectors.map((vector) => vector.map((value, index) => (value - centers[index]) / spreads[index]));
}

function findInitialCentroids(vectors: Vector[]): [Vector, Vector] {
  let pair: [number, number] = [0, 1];
  let greatest = -1;
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const distance = euclideanSquared(vectors[i], vectors[j]);
      if (distance > greatest) {
        greatest = distance;
        pair = [i, j];
      }
    }
  }
  return [[...vectors[pair[0]]], [...vectors[pair[1]]]];
}

function twoMeans(vectors: Vector[]) {
  let centroids = findInitialCentroids(vectors);
  let assignments = vectors.map(() => 0);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const nextAssignments = vectors.map((vector) =>
      euclideanSquared(vector, centroids[0]) <= euclideanSquared(vector, centroids[1]) ? 0 : 1,
    );
    if (iteration > 0 && nextAssignments.every((value, index) => value === assignments[index])) break;
    assignments = nextAssignments;
    const groups = [0, 1].map((cluster) => vectors.filter((_, index) => assignments[index] === cluster));
    if (groups.some((group) => group.length === 0)) break;
    centroids = [vectorMean(groups[0]), vectorMean(groups[1])];
  }
  return { assignments, centroids };
}

function rawClusterMeans(sessions: SessionRecord[], assignments: number[], cluster: number) {
  const group = sessions.filter((_, index) => assignments[index] === cluster);
  const sin = mean(group.map((session) => Math.sin((session.loginMinute / 1440) * Math.PI * 2)));
  const cos = mean(group.map((session) => Math.cos((session.loginMinute / 1440) * Math.PI * 2)));
  const loginMinute = ((Math.atan2(sin, cos) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 1440;
  return {
    loginMinute,
    delivery: mean(group.map((session) => session.averageDeliveryMinutes)),
    acceptance: mean(group.map((session) => session.acceptanceRate)),
    breaks: mean(group.map((session) => session.averageBreakMinutes)),
    shift: mean(group.map((session) => session.shiftDurationHours)),
  };
}

export function detectSecondSignature(
  sessions: SessionRecord[],
  config: DetectionConfig = defaultDetectionConfig,
): SecondSignatureResult {
  if (sessions.length < config.signature.minimumSessions) {
    return {
      status: 'INCONCLUSIVE',
      secondSignatureDetected: false,
      patternCount: 1,
      distinguishingFeatures: [],
      confidenceLevel: 'low',
      explanation: `At least ${config.signature.minimumSessions} sessions are needed to assess recurring signatures.`,
    };
  }

  const vectors = standardize(sessions.map(featureVector));
  const { assignments, centroids } = twoMeans(vectors);
  const sizes = [0, 1].map((cluster) => assignments.filter((value) => value === cluster).length);
  if (Math.min(...sizes) < config.signature.minimumClusterSize) {
    return {
      status: 'NOT_DETECTED', secondSignatureDetected: false, patternCount: 1,
      distinguishingFeatures: [], confidenceLevel: 'low',
      explanation: 'No second pattern recurred often enough to be considered a signature.',
    };
  }

  const singleCenter = vectorMean(vectors);
  const singleSse = vectors.reduce((sum, vector) => sum + euclideanSquared(vector, singleCenter), 0);
  const twoSse = vectors.reduce(
    (sum, vector, index) => sum + euclideanSquared(vector, centroids[assignments[index]]),
    0,
  );
  const improvement = singleSse ? 1 - twoSse / singleSse : 0;
  const centroidDistance = Math.sqrt(euclideanSquared(centroids[0], centroids[1]));
  const first = rawClusterMeans(sessions, assignments, 0);
  const second = rawClusterMeans(sessions, assignments, 1);
  const distinguishingFeatures: string[] = [];
  if (circularDifferenceMinutes(first.loginMinute, second.loginMinute) >= 90) distinguishingFeatures.push('login time');
  if (Math.abs(first.delivery - second.delivery) >= 5) distinguishingFeatures.push('delivery duration');
  if (Math.abs(first.acceptance - second.acceptance) >= 0.12) distinguishingFeatures.push('acceptance rate');
  if (Math.abs(first.breaks - second.breaks) >= 6) distinguishingFeatures.push('break duration');
  if (Math.abs(first.shift - second.shift) >= 1.25) distinguishingFeatures.push('shift duration');

  // A schedule-only split can represent an ordinary morning/evening routine.
  const behavioralDifferences = distinguishingFeatures.filter((feature) => feature !== 'login time');
  const detected = improvement >= config.signature.minimumSseImprovement
    && centroidDistance >= config.signature.minimumCentroidDistance
    && behavioralDifferences.length >= 2;
  if (!detected) {
    return {
      status: 'NOT_DETECTED', secondSignatureDetected: false, patternCount: 1,
      distinguishingFeatures,
      confidenceLevel: 'low',
      explanation: 'The sessions do not form two sufficiently distinct recurring behavioral patterns.',
    };
  }

  const confidenceLevel = improvement > 0.65 && Math.min(...sizes) >= 6 ? 'high' : 'moderate';
  return {
    status: 'DETECTED',
    secondSignatureDetected: true,
    patternCount: 2,
    distinguishingFeatures,
    confidenceLevel,
    explanation: 'Two recurring behavioral patterns were observed. This is not proof of account sharing; additional identity verification may be appropriate.',
  };
}
