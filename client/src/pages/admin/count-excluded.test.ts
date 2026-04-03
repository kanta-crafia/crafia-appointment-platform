import { describe, it, expect } from 'vitest';

// Test the calcStats logic for count-excluded appointments
// Simulating the same logic used in AgencyStats and PartnerAgencyStats

interface MockAppointment {
  id: string;
  status: string;
  project?: { is_count_excluded?: boolean };
}

function calcStats(appts: MockAppointment[]) {
  const countable = appts.filter(a => !a.project?.is_count_excluded);
  const excludedAppts = appts.filter(a => a.project?.is_count_excluded === true);
  return {
    total: countable.length,
    approved: countable.filter(a => a.status === 'approved').length,
    pending: countable.filter(a => a.status === 'pending').length,
    rejected: countable.filter(a => a.status === 'rejected').length,
    cancelled: countable.filter(a => a.status === 'cancelled').length,
    excluded: excludedAppts.length,
    appointments: appts,
  };
}

describe('calcStats with is_count_excluded', () => {
  it('should count all appointments when none are excluded', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'pending', project: { is_count_excluded: false } },
      { id: '3', status: 'rejected', project: { is_count_excluded: false } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(3);
    expect(stats.approved).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.excluded).toBe(0);
  });

  it('should exclude count-excluded appointments from totals', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'approved', project: { is_count_excluded: true } },
      { id: '3', status: 'pending', project: { is_count_excluded: true } },
      { id: '4', status: 'rejected', project: { is_count_excluded: false } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(2); // only non-excluded
    expect(stats.approved).toBe(1); // only id:1
    expect(stats.pending).toBe(0); // id:3 is excluded
    expect(stats.rejected).toBe(1);
    expect(stats.excluded).toBe(2); // id:2, id:3
  });

  it('should handle all appointments being excluded', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: true } },
      { id: '2', status: 'pending', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(0);
    expect(stats.approved).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.excluded).toBe(2);
  });

  it('should handle appointments without project data', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved' },
      { id: '2', status: 'pending', project: undefined },
      { id: '3', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(2); // id:1, id:2 (no project = countable)
    expect(stats.approved).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.excluded).toBe(1);
  });

  it('should handle empty appointments array', () => {
    const stats = calcStats([]);
    expect(stats.total).toBe(0);
    expect(stats.approved).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.rejected).toBe(0);
    expect(stats.cancelled).toBe(0);
    expect(stats.excluded).toBe(0);
  });

  it('should still include all appointments in the appointments array', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    expect(stats.appointments).toHaveLength(2); // all appointments preserved
    expect(stats.total).toBe(1); // but total only counts non-excluded
    expect(stats.excluded).toBe(1);
  });

  it('should correctly calculate approval rate denominator (total excludes non-counted)', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'approved', project: { is_count_excluded: false } },
      { id: '3', status: 'rejected', project: { is_count_excluded: false } },
      { id: '4', status: 'approved', project: { is_count_excluded: true } },
      { id: '5', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    // Approval rate should be 2/3 = 66.7%, not 4/5 = 80%
    const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    expect(approvalRate).toBe(67); // 2/3 rounded
    expect(stats.excluded).toBe(2);
  });
});
