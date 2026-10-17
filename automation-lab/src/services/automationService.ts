import type { Approval, Notification, Workflow } from '../types'
export interface AutomationService {fetchWorkflows():Promise<Workflow[]>;createWorkflow(w:Workflow):Promise<Workflow>;executeWorkflow(id:string,inputs:Record<string,unknown>):Promise<void>;fetchNotifications():Promise<Notification[]>;decideApproval(id:string,decision:Approval['state']):Promise<void>}
export const apiConfig={baseUrl:import.meta.env.VITE_API_URL??'/api',mode:'local' as 'local'|'remote'}
