export type PlanCode = 'STARTER' | 'GROWTH' | 'PRO';

export interface PlanLimits {
  students: number;
  staff: number;
  courses: number;
  batches: number;
  storageBytes: number;
  videos: number;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  monthlyPrice: number; // INR
  yearlyPrice: number;
  limits: PlanLimits;
  features: string[];
}

const GB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanCode, PlanDefinition> = {
  STARTER: {
    code: 'STARTER',
    name: 'Starter',
    monthlyPrice: 2999,
    yearlyPrice: 29990,
    limits: { students: 100, staff: 10, courses: 10, batches: 15, storageBytes: 10 * GB, videos: 100 },
    features: ['CRM', 'Students', 'Attendance', 'Fees', 'Basic LMS', 'Email support'],
  },
  GROWTH: {
    code: 'GROWTH',
    name: 'Growth',
    monthlyPrice: 6999,
    yearlyPrice: 69990,
    limits: { students: 500, staff: 40, courses: 50, batches: 80, storageBytes: 50 * GB, videos: 750 },
    features: ['Everything in Starter', 'Full LMS', 'Quizzes', 'Reports', 'WhatsApp/SMS hooks', 'Priority support'],
  },
  PRO: {
    code: 'PRO',
    name: 'Pro',
    monthlyPrice: 14999,
    yearlyPrice: 149990,
    limits: { students: 5000, staff: 300, courses: 500, batches: 800, storageBytes: 500 * GB, videos: 10000 },
    features: ['Everything in Growth', 'White label', 'Advanced analytics', 'API access', 'Dedicated manager'],
  },
};

export const PLAN_CODES: PlanCode[] = ['STARTER', 'GROWTH', 'PRO'];

export function planLimits(code: PlanCode): PlanLimits {
  return PLANS[code]?.limits ?? PLANS.STARTER.limits;
}
