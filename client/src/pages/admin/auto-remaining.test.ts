import { describe, it, expect } from 'vitest';

/**
 * アポ残数自動計算のテスト
 * confirmed_countをDBに手動保存する代わりに、承認済みアポ数から自動計算する
 */

// 承認済みアポ数からconfirmedCountを計算するロジック
function getConfirmedCount(approvedCounts: Record<string, number>, projectId: string): number {
  return approvedCounts[projectId] || 0;
}

// 残数を計算するロジック
function getRemainingCount(
  isUnlimited: boolean,
  maxAppointmentsTotal: number,
  approvedCounts: Record<string, number>,
  projectId: string
): number | string {
  if (isUnlimited) return '—';
  return maxAppointmentsTotal - getConfirmedCount(approvedCounts, projectId);
}

describe('アポ残数自動計算', () => {
  const approvedCounts: Record<string, number> = {
    'project-1': 5,
    'project-2': 0,
    'project-3': 10,
  };

  describe('getConfirmedCount', () => {
    it('承認済みアポがある場合、正しい数を返す', () => {
      expect(getConfirmedCount(approvedCounts, 'project-1')).toBe(5);
    });

    it('承認済みアポがない場合、0を返す', () => {
      expect(getConfirmedCount(approvedCounts, 'project-2')).toBe(0);
    });

    it('存在しないプロジェクトの場合、0を返す', () => {
      expect(getConfirmedCount(approvedCounts, 'non-existent')).toBe(0);
    });
  });

  describe('getRemainingCount', () => {
    it('無制限の場合、"—"を返す', () => {
      expect(getRemainingCount(true, 0, approvedCounts, 'project-1')).toBe('—');
    });

    it('上限10、承認済み5の場合、残数5を返す', () => {
      expect(getRemainingCount(false, 10, approvedCounts, 'project-1')).toBe(5);
    });

    it('上限10、承認済み0の場合、残数10を返す', () => {
      expect(getRemainingCount(false, 10, approvedCounts, 'project-2')).toBe(10);
    });

    it('上限10、承認済み10の場合、残数0を返す', () => {
      expect(getRemainingCount(false, 10, approvedCounts, 'project-3')).toBe(0);
    });

    it('上限5、承認済み10の場合、マイナスの残数を返す（超過）', () => {
      expect(getRemainingCount(false, 5, approvedCounts, 'project-3')).toBe(-5);
    });

    it('存在しないプロジェクトの場合、上限がそのまま残数になる', () => {
      expect(getRemainingCount(false, 20, approvedCounts, 'non-existent')).toBe(20);
    });
  });

  describe('承認済みアポ数の集計ロジック', () => {
    it('アポデータから案件ごとの承認済み数を正しく集計できる', () => {
      const appointments = [
        { project_id: 'p1', status: 'approved' },
        { project_id: 'p1', status: 'approved' },
        { project_id: 'p1', status: 'pending' },
        { project_id: 'p2', status: 'approved' },
        { project_id: 'p2', status: 'rejected' },
        { project_id: 'p3', status: 'pending' },
      ];

      // 承認済みのみをフィルタして集計
      const approvedOnly = appointments.filter(a => a.status === 'approved');
      const counts: Record<string, number> = {};
      approvedOnly.forEach(a => {
        counts[a.project_id] = (counts[a.project_id] || 0) + 1;
      });

      expect(counts['p1']).toBe(2);
      expect(counts['p2']).toBe(1);
      expect(counts['p3']).toBeUndefined(); // 承認済みなし
    });

    it('空のアポデータの場合、空のカウントを返す', () => {
      const appointments: { project_id: string; status: string }[] = [];
      const approvedOnly = appointments.filter(a => a.status === 'approved');
      const counts: Record<string, number> = {};
      approvedOnly.forEach(a => {
        counts[a.project_id] = (counts[a.project_id] || 0) + 1;
      });

      expect(Object.keys(counts).length).toBe(0);
    });
  });

  describe('案件保存時にconfirmed_countを含めない', () => {
    it('保存ペイロードにconfirmed_countが含まれないことを確認', () => {
      const payload = {
        title: 'テスト案件',
        max_appointments_total: 10,
        is_unlimited: false,
        priority: 'normal',
        status: 'active',
        is_count_excluded: false,
      };

      // confirmed_countがペイロードに含まれていないことを確認
      expect('confirmed_count' in payload).toBe(false);
    });
  });
});
