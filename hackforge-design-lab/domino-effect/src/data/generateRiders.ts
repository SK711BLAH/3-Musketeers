import type { RiderProfile, SessionRecord } from '../types/detection';
import { clamp } from '../engine/statistics';

const FIRST_NAMES = ['Aarav', 'Meera', 'Kabir', 'Zoya', 'Arjun', 'Isha', 'Vihaan', 'Anaya', 'Rohan', 'Diya'];
const LAST_NAMES = ['Mehta', 'Nair', 'Singh', 'Khan', 'Patel', 'Sharma', 'Reddy', 'Gupta', 'Das', 'Joshi'];
const LOCATIONS = [
  ['Mumbai', ['Andheri', 'Bandra', 'Powai']],
  ['Bengaluru', ['Indiranagar', 'Koramangala', 'Whitefield']],
  ['Delhi', ['Saket', 'Dwarka', 'Rohini']],
  ['Pune', ['Kothrud', 'Hinjewadi', 'Viman Nagar']],
  ['Hyderabad', ['Gachibowli', 'Madhapur', 'Banjara Hills']],
] as const;

export class SeededRandom {
  private state: number;
  constructor(seed = 0x5f3759df) { this.state = seed >>> 0; }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  normal(): number {
    const first = Math.max(this.next(), Number.EPSILON);
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * this.next());
  }
}

function wrapMinute(value: number): number { return ((Math.round(value) % 1440) + 1440) % 1440; }

function makeSession(rider: Omit<RiderProfile, 'history'>, index: number, random: SeededRandom): SessionRecord {
  const date = new Date(Date.UTC(2026, 7, 1 + index));
  return {
    id: `H-${rider.id}-${String(index + 1).padStart(2, '0')}`,
    riderId: rider.id,
    timestamp: date.toISOString(),
    loginMinute: wrapMinute(rider.typicalLoginMinute + random.normal() * 24),
    averageDeliveryMinutes: Number(clamp(rider.averageDeliveryMinutes + random.normal() * 2.1, 10, 60).toFixed(1)),
    acceptanceRate: Number(clamp(rider.acceptanceRate + random.normal() * 0.035, 0.3, 1).toFixed(3)),
    averageBreakMinutes: Number(clamp(rider.averageBreakMinutes + random.normal() * 2.2, 2, 45).toFixed(1)),
    shiftDurationHours: Number(clamp(rider.typicalShiftDurationHours + random.normal() * 0.45, 2, 12).toFixed(2)),
    deviceId: rider.registeredDeviceId,
    city: rider.registeredCity,
    zone: rider.primaryZone,
  };
}

export function generateRiders(seed = 20261017, riderCount = 50, shiftsPerRider = 30): RiderProfile[] {
  const random = new SeededRandom(seed);
  return Array.from({ length: riderCount }, (_, index) => {
    const [registeredCity, zones] = LOCATIONS[index % LOCATIONS.length];
    const base: Omit<RiderProfile, 'history'> = {
      id: `RD-${String(1001 + index)}`,
      name: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]}`,
      registeredCity,
      primaryZone: zones[index % zones.length],
      registeredDeviceId: `DEV-${String(70001 + index)}`,
      typicalLoginMinute: wrapMinute(6 * 60 + random.next() * 12 * 60),
      averageDeliveryMinutes: Number((18 + random.next() * 17).toFixed(1)),
      acceptanceRate: Number((0.66 + random.next() * 0.29).toFixed(3)),
      averageBreakMinutes: Number((8 + random.next() * 16).toFixed(1)),
      typicalShiftDurationHours: Number((5 + random.next() * 4).toFixed(2)),
    };
    const history = Array.from({ length: shiftsPerRider }, (_, shift) => makeSession(base, shift, random));
    return { ...base, history };
  });
}

export function generateHistoricalSessions(seed = 20261017): SessionRecord[] {
  return generateRiders(seed).flatMap((rider) => rider.history);
}
