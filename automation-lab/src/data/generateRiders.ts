import type { RiderProfile } from '../types/detection'
import { createSeededRandom, generateHistoricalSessions, type RiderTemplate } from './generateSessions'

const firstNames = ['Aarav', 'Aditi', 'Akash', 'Ananya', 'Arjun', 'Diya', 'Farhan', 'Gauri', 'Ishaan', 'Kavya', 'Manish', 'Meera', 'Nikhil', 'Pooja', 'Rahul', 'Riya', 'Sahil', 'Sneha', 'Varun', 'Zoya']
const lastNames = ['Sharma', 'Patel', 'Khan', 'Singh', 'Rao', 'Gupta', 'Iyer', 'Das', 'Mehta', 'Yadav']
const locations = [
  { city: 'Bengaluru', zones: ['Indiranagar', 'Koramangala', 'Whitefield', 'Jayanagar'] },
  { city: 'Mumbai', zones: ['Andheri', 'Bandra', 'Powai', 'Dadar'] },
  { city: 'Delhi', zones: ['Saket', 'Dwarka', 'Rohini', 'Lajpat Nagar'] },
  { city: 'Hyderabad', zones: ['Hitech City', 'Banjara Hills', 'Kondapur', 'Secunderabad'] },
  { city: 'Pune', zones: ['Kothrud', 'Hinjawadi', 'Viman Nagar', 'Baner'] },
]

export function generateRiders(seed = 20261017, riderCount = 50, shiftsPerRider = 30): RiderProfile[] {
  const random = createSeededRandom(seed)
  return Array.from({ length: riderCount }, (_, index) => {
    const location = locations[index % locations.length]
    const template: RiderTemplate = {
      riderId: `RD-${String(1001 + index).padStart(4, '0')}`,
      city: location.city,
      zone: location.zones[Math.floor(random.next() * location.zones.length)],
      deviceId: `DEV-${String(70001 + index).padStart(5, '0')}`,
      loginTimeMinutes: Math.round((6 * 60 + random.next() * 12 * 60) % 1440),
      deliveryDurationMinutes: 18 + random.next() * 17,
      acceptanceRate: 0.65 + random.next() * 0.3,
      breakDurationMinutes: 8 + random.next() * 17,
      shiftDurationMinutes: 300 + random.next() * 240,
    }
    const historicalSessions = generateHistoricalSessions(template, shiftsPerRider, random)
    return {
      riderId: template.riderId,
      name: `${firstNames[index % firstNames.length]} ${lastNames[(index * 3) % lastNames.length]}`,
      registeredCity: template.city,
      primaryDeliveryZone: template.zone,
      registeredDeviceId: template.deviceId,
      typicalLoginTimeMinutes: template.loginTimeMinutes,
      averageDeliveryDurationMinutes: Number(template.deliveryDurationMinutes.toFixed(1)),
      orderAcceptanceRate: Number(template.acceptanceRate.toFixed(3)),
      averageBreakDurationMinutes: Number(template.breakDurationMinutes.toFixed(1)),
      typicalShiftDurationMinutes: Math.round(template.shiftDurationMinutes),
      historicalSessions,
    }
  })
}

export const syntheticRiders = generateRiders()
export const syntheticHistoricalSessions = syntheticRiders.flatMap(rider => rider.historicalSessions)
