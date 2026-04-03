import { describe, it, expect } from 'vitest';

// Test the calcStats logic for count-excluded appointments
// Non-count (excluded) = approved + is_count_excluded project only
// Pending/rejected/cancelled appointments on excluded projects are counted normally

interface MockAppointment {
  id: string;
  status: string;
  project?: { is_count_excluded?: boolean };
}

function calcStats(appts: MockAppointment[]) {
  // 非カウント = 承認済み＋非カウント案件のアポのみ
  const excludedAppts = appts.filter(a => a.project?.is_count_excluded === true && a.status === 'approved');
  const countable = appts.filter(a => !excludedAppts.includes(a));
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

describe('calcStats with is_count_excluded (approved only)', () => {
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

  it('should only exclude approved appointments from excluded projects', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'approved', project: { is_count_excluded: true } },  // excluded
      { id: '3', status: 'pending', project: { is_count_excluded: true } },   // NOT excluded (pending)
      { id: '4', status: 'rejected', project: { is_count_excluded: true } },  // NOT excluded (rejected)
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(3); // id:1, id:3, id:4
    expect(stats.approved).toBe(1); // only id:1
    expect(stats.pending).toBe(1); // id:3 (pending on excluded project = normal count)
    expect(stats.rejected).toBe(1); // id:4 (rejected on excluded project = normal count)
    expect(stats.excluded).toBe(1); // only id:2 (approved + excluded)
  });

  it('should handle pending appointments on excluded projects as normal', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'pending', project: { is_count_excluded: true } },
      { id: '2', status: 'pending', project: { is_count_excluded: true } },
      { id: '3', status: 'pending', project: { is_count_excluded: false } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(3); // all pending = all counted normally
    expect(stats.pending).toBe(3);
    expect(stats.excluded).toBe(0); // no approved on excluded projects
  });

  it('should handle cancelled appointments on excluded projects as normal', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'cancelled', project: { is_count_excluded: true } },
      { id: '2', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(1); // id:1 (cancelled = normal)
    expect(stats.cancelled).toBe(1);
    expect(stats.excluded).toBe(1); // id:2 (approved + excluded)
  });

  it('should handle all appointments being approved on excluded projects', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: true } },
      { id: '2', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    expect(stats.total).toBe(0);
    expect(stats.approved).toBe(0);
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

  it('should correctly calculate approval rate (excluded from denominator)', () => {
    const appts: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: false } },
      { id: '2', status: 'approved', project: { is_count_excluded: false } },
      { id: '3', status: 'rejected', project: { is_count_excluded: false } },
      { id: '4', status: 'approved', project: { is_count_excluded: true } },
      { id: '5', status: 'approved', project: { is_count_excluded: true } },
    ];
    const stats = calcStats(appts);
    // Approval rate should be 2/3 = 66.7% (excluded not in denominator)
    const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    expect(approvalRate).toBe(67); // 2/3 rounded
    expect(stats.excluded).toBe(2);
  });

  it('should transition: pending on excluded project → approved → becomes excluded', () => {
    // Before approval: pending on excluded project = counted normally
    const beforeApproval: MockAppointment[] = [
      { id: '1', status: 'pending', project: { is_count_excluded: true } },
    ];
    const statsBefore = calcStats(beforeApproval);
    expect(statsBefore.pending).toBe(1);
    expect(statsBefore.excluded).toBe(0);

    // After approval: same appointment now approved = excluded
    const afterApproval: MockAppointment[] = [
      { id: '1', status: 'approved', project: { is_count_excluded: true } },
    ];
    const statsAfter = calcStats(afterApproval);
    expect(statsAfter.pending).toBe(0);
    expect(statsAfter.approved).toBe(0); // not in approved count
    expect(statsAfter.excluded).toBe(1); // now excluded
  });
});
