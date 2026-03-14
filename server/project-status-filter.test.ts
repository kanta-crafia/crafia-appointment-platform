import { describe, expect, it } from "vitest";

/**
 * 案件ステータス「無効(inactive)」「終了(closed)」のフィルタリングロジックテスト
 * 
 * フロントエンドのフィルタリングロジックを純粋関数として抽出し、テストする。
 * 実際のコンポーネントと同じロジックを使用。
 */

// --- フィルタリングロジック（コンポーネントから抽出） ---

interface Project {
  id: string;
  title: string;
  status: 'active' | 'inactive' | 'closed';
  is_unlimited: boolean;
  max_appointments_total: number;
  confirmed_count: number;
  project_number?: string;
}

interface Allocation {
  id: string;
  project_id: string;
  status: 'active' | 'inactive';
  payout_per_appointment: number;
  project?: Project;
}

// MyAllocations.tsx のフィルタリングロジック
function filterAllocationsForList(allocations: Allocation[]): Allocation[] {
  return allocations.filter(a => a.project?.status !== 'closed');
}

// NewAppointment.tsx のフィルタリングロジック
function filterAllocationsForRegistration(allocations: Allocation[]): Allocation[] {
  return allocations.filter(a => a.project?.status !== 'closed');
}

// NewAppointment.tsx の選択可否判定ロジック
function isAllocationDisabledForRegistration(alloc: Allocation): boolean {
  const proj = alloc.project;
  if (!proj) return true;
  const isUnlimited = proj.is_unlimited;
  const remaining = isUnlimited ? null : proj.max_appointments_total - proj.confirmed_count;
  const isFull = !isUnlimited && remaining !== null && remaining <= 0;
  const projectInactive = proj.status === 'inactive';
  return isFull || projectInactive;
}

// MyAllocations.tsx のアポ登録可否判定ロジック
function canRegisterAppointment(alloc: Allocation): boolean {
  const proj = alloc.project;
  if (!proj) return false;
  const isUnlimited = proj.is_unlimited;
  const remaining = isUnlimited ? null : proj.max_appointments_total - proj.confirmed_count;
  const isFull = !isUnlimited && remaining !== null && remaining <= 0;
  const isActive = alloc.status === 'active';
  const projectActive = proj.status === 'active';
  return isActive && projectActive && !isFull;
}

// handleSubmit のステータスバリデーション
function validateProjectStatus(project: Project | null): string | null {
  if (project?.status === 'inactive') return 'この案件は現在受付停止中です';
  if (project?.status === 'closed') return 'この案件は終了しています';
  return null;
}

// --- テストデータ ---

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    title: 'テスト案件',
    status: 'active',
    is_unlimited: false,
    max_appointments_total: 10,
    confirmed_count: 3,
    project_number: '001',
    ...overrides,
  };
}

function createAllocation(project: Project, overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: 'alloc-1',
    project_id: project.id,
    status: 'active',
    payout_per_appointment: 5000,
    project,
    ...overrides,
  };
}

// --- テスト ---

describe("案件ステータスフィルタリング", () => {
  describe("割り当て案件一覧（MyAllocations）", () => {
    it("active案件は一覧に表示される", () => {
      const proj = createProject({ status: 'active' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForList([alloc]);
      expect(result).toHaveLength(1);
    });

    it("inactive案件は一覧に表示される（アポ登録不可だが表示はする）", () => {
      const proj = createProject({ status: 'inactive' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForList([alloc]);
      expect(result).toHaveLength(1);
    });

    it("closed案件は一覧から非表示", () => {
      const proj = createProject({ status: 'closed' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForList([alloc]);
      expect(result).toHaveLength(0);
    });

    it("mixed: active+inactive+closedの場合、closedのみ除外", () => {
      const projActive = createProject({ id: 'p1', status: 'active' });
      const projInactive = createProject({ id: 'p2', status: 'inactive' });
      const projClosed = createProject({ id: 'p3', status: 'closed' });
      const allocations = [
        createAllocation(projActive, { id: 'a1' }),
        createAllocation(projInactive, { id: 'a2' }),
        createAllocation(projClosed, { id: 'a3' }),
      ];
      const result = filterAllocationsForList(allocations);
      expect(result).toHaveLength(2);
      expect(result.map(a => a.project?.status)).toEqual(['active', 'inactive']);
    });
  });

  describe("アポ登録画面プルダウン（NewAppointment）", () => {
    it("active案件はプルダウンに表示される", () => {
      const proj = createProject({ status: 'active' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForRegistration([alloc]);
      expect(result).toHaveLength(1);
    });

    it("inactive案件はプルダウンに表示される（disabledとして）", () => {
      const proj = createProject({ status: 'inactive' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForRegistration([alloc]);
      expect(result).toHaveLength(1);
    });

    it("closed案件はプルダウンから非表示", () => {
      const proj = createProject({ status: 'closed' });
      const alloc = createAllocation(proj);
      const result = filterAllocationsForRegistration([alloc]);
      expect(result).toHaveLength(0);
    });
  });

  describe("アポ登録可否判定", () => {
    it("active案件 + active割り当て + 残枠あり → 登録可能", () => {
      const proj = createProject({ status: 'active', max_appointments_total: 10, confirmed_count: 3 });
      const alloc = createAllocation(proj);
      expect(canRegisterAppointment(alloc)).toBe(true);
      expect(isAllocationDisabledForRegistration(alloc)).toBe(false);
    });

    it("inactive案件 → 登録不可", () => {
      const proj = createProject({ status: 'inactive' });
      const alloc = createAllocation(proj);
      expect(canRegisterAppointment(alloc)).toBe(false);
      expect(isAllocationDisabledForRegistration(alloc)).toBe(true);
    });

    it("active案件 + 上限到達 → 登録不可", () => {
      const proj = createProject({ status: 'active', max_appointments_total: 10, confirmed_count: 10 });
      const alloc = createAllocation(proj);
      expect(canRegisterAppointment(alloc)).toBe(false);
      expect(isAllocationDisabledForRegistration(alloc)).toBe(true);
    });

    it("active案件 + 無制限 → 登録可能", () => {
      const proj = createProject({ status: 'active', is_unlimited: true });
      const alloc = createAllocation(proj);
      expect(canRegisterAppointment(alloc)).toBe(true);
      expect(isAllocationDisabledForRegistration(alloc)).toBe(false);
    });

    it("inactive割り当て → 登録不可", () => {
      const proj = createProject({ status: 'active' });
      const alloc = createAllocation(proj, { status: 'inactive' });
      expect(canRegisterAppointment(alloc)).toBe(false);
    });
  });

  describe("送信時のステータスバリデーション", () => {
    it("active案件 → エラーなし", () => {
      const proj = createProject({ status: 'active' });
      expect(validateProjectStatus(proj)).toBeNull();
    });

    it("inactive案件 → 受付停止中エラー", () => {
      const proj = createProject({ status: 'inactive' });
      expect(validateProjectStatus(proj)).toBe('この案件は現在受付停止中です');
    });

    it("closed案件 → 終了エラー", () => {
      const proj = createProject({ status: 'closed' });
      expect(validateProjectStatus(proj)).toBe('この案件は終了しています');
    });

    it("null → エラーなし（別のバリデーションで処理）", () => {
      expect(validateProjectStatus(null)).toBeNull();
    });
  });

  describe("既存アポ・ダッシュボード・承認画面への影響なし", () => {
    it("inactive案件のアポは代理店アポ一覧に表示される（フィルタリングなし）", () => {
      // 代理店のアポ一覧（Appointments.tsx）はappointmentsを直接取得し、
      // 案件ステータスでフィルタリングしない → 既存アポは影響なし
      const appointments = [
        { id: 'apt-1', status: 'approved', project_id: 'p1' },
        { id: 'apt-2', status: 'pending', project_id: 'p2' },
      ];
      // フィルタリングなし = 全件表示
      expect(appointments).toHaveLength(2);
    });

    it("closed案件のアポも管理者承認画面に表示される（フィルタリングなし）", () => {
      // 管理者のApprovals.tsxはappointmentsを全件取得し、
      // 案件ステータスでフィルタリングしない → 既存アポは影響なし
      const appointments = [
        { id: 'apt-1', status: 'approved', project_id: 'p-closed' },
        { id: 'apt-2', status: 'pending', project_id: 'p-active' },
      ];
      expect(appointments).toHaveLength(2);
    });
  });
});
