import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'crafia-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});

// Types based on our DB schema
export type UserRole = 'admin' | 'partner' | 'sub_partner' | 'approver';
export type ProjectStatus = 'active' | 'inactive' | 'closed';
export type AllocationStatus = 'active' | 'inactive';
export type AppointmentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type OrgStatus = 'active' | 'inactive';
export type Priority = 'high' | 'normal' | 'low';
export type SnsAccountStatus = 'available' | 'assigned' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  parent_org_id: string | null;
  status: OrgStatus;
  created_at: string;
}

export interface User {
  id: string;
  org_id: string;
  login_id: string | null;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  project_number: string | null;
  company_name: string | null;
  service_name: string | null;
  service_overview: string | null;
  project_detail: string | null;
  acquisition_conditions: string | null;
  unit_price: number;
  scheduling_url: string | null;
  priority: Priority;
  is_unlimited: boolean;
  start_date: string | null;
  end_date: string | null;
  max_appointments_total: number;
  confirmed_count: number;
  status: ProjectStatus;
  created_at: string;
  created_by: string | null;
}

export interface Allocation {
  id: string;
  project_id: string;
  parent_org_id: string;
  child_org_id: string;
  payout_per_appointment: number;
  status: AllocationStatus;
  created_at: string;
  // Joined fields
  project?: Project;
  parent_org?: Organization;
  child_org?: Organization;
}

export interface Appointment {
  id: string;
  project_id: string;
  allocation_id: string;
  created_by_user_id: string;
  org_id: string;
  target_company_name: string;
  contact_person: string | null;
  meeting_datetime: string;
  notes: string | null;
  evidence_url: string | null;
  status: AppointmentStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  // Joined fields
  project?: Project;
  allocation?: Allocation;
  organization?: Organization;
  creator?: User;
}

export interface Notification {
  id: number;
  recipient_user_id: string;
  type: string;
  payload_json: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface SnsAccount {
  id: string;
  platform: string;
  account_name: string;
  login_id: string;
  login_password: string;
  assigned_user_id: string | null;
  assigned_at: string | null;
  notes: string | null;
  status: SnsAccountStatus;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_user?: User;
}

export interface AuditLog {
  id: number;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}
