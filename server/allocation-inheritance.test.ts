import { describe, it, expect } from 'vitest';

/**
 * 割り当て案件の自動継承システムのテスト
 * 
 * フロントエンドのロジックをユニットテストとして検証する。
 * 実際のSupabaseクエリはモックせず、ロジック部分のみテスト。
 */

// --- Helper functions extracted from frontend logic ---

interface Allocation {
  id: string;
  child_org_id: string;
  project_id: string;
  payout_per_appointment: string;
  status: string;
  project?: { title: string; status: string; is_unlimited: boolean; max_appointments_total: number; confirmed_count: number };
}

interface SubAllocationPrice {
  id: string;
  allocation_id: string;
  sub_org_id: string;
  payout_per_appointment: number;
}

interface AllocationWithPrice extends Allocation {
  effectivePayoutPerAppointment: number;
}

/**
 * Compute effective allocations for a sub_partner by inheriting from parent
 */
function computeInheritedAllocations(
  directAllocations: Allocation[],
  parentAllocations: Allocation[],
  subPrices: SubAllocationPrice[],
  subOrgId: string
): AllocationWithPrice[] {
  // Direct allocations with their own payout
  const directWithPrice: AllocationWithPrice[] = directAllocations.map(a => ({
    ...a,
    effectivePayoutPerAppointment: Number(a.payout_per_appointment),
  }));

  // Filter out parent allocations that already exist as direct
  const directProjectIds = new Set(directAllocations.map(a => a.project_id));
  const inherited = parentAllocations.filter(a => !directProjectIds.has(a.project_id));

  // Build price map from sub_allocation_prices
  const priceMap = new Map<string, number>();
  subPrices
    .filter(p => p.sub_org_id === subOrgId)
    .forEach(p => priceMap.set(p.allocation_id, Number(p.payout_per_appointment)));

  // Inherited allocations with custom or parent payout
  const inheritedWithPrice: AllocationWithPrice[] = inherited.map(a => ({
    ...a,
    effectivePayoutPerAppointment: priceMap.get(a.id) ?? Number(a.payout_per_appointment),
  }));

  return [...directWithPrice, ...inheritedWithPrice];
}

/**
 * Filter allocations: exclude closed projects, mark inactive as non-registerable
 */
function filterVisibleAllocations(allocations: AllocationWithPrice[]): AllocationWithPrice[] {
  return allocations.filter(a => a.project?.status !== 'closed');
}

function canRegisterAppointment(alloc: AllocationWithPrice): boolean {
  const project = alloc.project;
  if (!project) return false;
  if (project.status === 'inactive') return false;
  if (project.status === 'closed') return false;
  if (alloc.status !== 'active') return false;
  if (!project.is_unlimited) {
    const remaining = project.max_appointments_total - project.confirmed_count;
    if (remaining <= 0) return false;
  }
  return true;
}

// --- Tests ---

describe('割り当て案件の自動継承システム', () => {
  const parentAllocations: Allocation[] = [
    {
      id: 'parent-alloc-1',
      child_org_id: 'parent-org',
      project_id: 'proj-1',
      payout_per_appointment: '10000',
      status: 'active',
      project: { title: 'AIマネージャー', status: 'active', is_unlimited: false, max_appointments_total: 100, confirmed_count: 10 },
    },
    {
      id: 'parent-alloc-2',
      child_org_id: 'parent-org',
      project_id: 'proj-2',
      payout_per_appointment: '10000',
      status: 'active',
      project: { title: 'SNSマーケ', status: 'active', is_unlimited: true, max_appointments_total: 0, confirmed_count: 5 },
    },
    {
      id: 'parent-alloc-3',
      child_org_id: 'parent-org',
      project_id: 'proj-3',
      payout_per_appointment: '10000',
      status: 'active',
      project: { title: '終了案件', status: 'closed', is_unlimited: false, max_appointments_total: 50, confirmed_count: 50 },
    },
    {
      id: 'parent-alloc-4',
      child_org_id: 'parent-org',
      project_id: 'proj-4',
      payout_per_appointment: '10000',
      status: 'active',
      project: { title: '無効案件', status: 'inactive', is_unlimited: false, max_appointments_total: 100, confirmed_count: 20 },
    },
  ];

  const subOrgId = 'sub-org-1';

  describe('継承ロジック', () => {
    it('直接割り当てがない場合、親の全案件を継承する', () => {
      const result = computeInheritedAllocations([], parentAllocations, [], subOrgId);
      expect(result).toHaveLength(4);
    });

    it('sub_allocation_pricesがある場合、カスタム卸単価を使用する', () => {
      const prices: SubAllocationPrice[] = [
        { id: 'price-1', allocation_id: 'parent-alloc-1', sub_org_id: subOrgId, payout_per_appointment: 8000 },
        { id: 'price-2', allocation_id: 'parent-alloc-2', sub_org_id: subOrgId, payout_per_appointment: 7000 },
      ];
      const result = computeInheritedAllocations([], parentAllocations, prices, subOrgId);
      
      const alloc1 = result.find(a => a.id === 'parent-alloc-1');
      const alloc2 = result.find(a => a.id === 'parent-alloc-2');
      const alloc3 = result.find(a => a.id === 'parent-alloc-3');
      
      expect(alloc1?.effectivePayoutPerAppointment).toBe(8000);
      expect(alloc2?.effectivePayoutPerAppointment).toBe(7000);
      // No custom price → use parent payout
      expect(alloc3?.effectivePayoutPerAppointment).toBe(10000);
    });

    it('他のsub_orgの価格は適用されない', () => {
      const prices: SubAllocationPrice[] = [
        { id: 'price-1', allocation_id: 'parent-alloc-1', sub_org_id: 'other-sub-org', payout_per_appointment: 5000 },
      ];
      const result = computeInheritedAllocations([], parentAllocations, prices, subOrgId);
      const alloc1 = result.find(a => a.id === 'parent-alloc-1');
      expect(alloc1?.effectivePayoutPerAppointment).toBe(10000); // parent payout, not other org's price
    });

    it('直接割り当てがある場合、同じproject_idの親割り当ては除外される', () => {
      const directAllocs: Allocation[] = [
        {
          id: 'direct-alloc-1',
          child_org_id: subOrgId,
          project_id: 'proj-1', // Same as parent-alloc-1
          payout_per_appointment: '9000',
          status: 'active',
          project: { title: 'AIマネージャー', status: 'active', is_unlimited: false, max_appointments_total: 100, confirmed_count: 10 },
        },
      ];
      const result = computeInheritedAllocations(directAllocs, parentAllocations, [], subOrgId);
      
      // 1 direct + 3 inherited (proj-2, proj-3, proj-4; proj-1 excluded from parent)
      expect(result).toHaveLength(4);
      const proj1Allocs = result.filter(a => a.project_id === 'proj-1');
      expect(proj1Allocs).toHaveLength(1);
      expect(proj1Allocs[0].id).toBe('direct-alloc-1');
      expect(proj1Allocs[0].effectivePayoutPerAppointment).toBe(9000);
    });
  });

  describe('表示フィルタリング', () => {
    it('終了(closed)案件は一覧から除外される', () => {
      const allAllocs = computeInheritedAllocations([], parentAllocations, [], subOrgId);
      const visible = filterVisibleAllocations(allAllocs);
      expect(visible).toHaveLength(3); // proj-3 (closed) excluded
      expect(visible.find(a => a.project?.status === 'closed')).toBeUndefined();
    });

    it('無効(inactive)案件は一覧に表示される', () => {
      const allAllocs = computeInheritedAllocations([], parentAllocations, [], subOrgId);
      const visible = filterVisibleAllocations(allAllocs);
      expect(visible.find(a => a.project?.status === 'inactive')).toBeDefined();
    });
  });

  describe('アポ登録可否判定', () => {
    it('active案件はアポ登録可能', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'active',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'active', is_unlimited: false, max_appointments_total: 100, confirmed_count: 10 },
      };
      expect(canRegisterAppointment(alloc)).toBe(true);
    });

    it('inactive案件はアポ登録不可', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'active',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'inactive', is_unlimited: false, max_appointments_total: 100, confirmed_count: 10 },
      };
      expect(canRegisterAppointment(alloc)).toBe(false);
    });

    it('closed案件はアポ登録不可', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'active',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'closed', is_unlimited: false, max_appointments_total: 50, confirmed_count: 50 },
      };
      expect(canRegisterAppointment(alloc)).toBe(false);
    });

    it('上限到達案件はアポ登録不可', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'active',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'active', is_unlimited: false, max_appointments_total: 50, confirmed_count: 50 },
      };
      expect(canRegisterAppointment(alloc)).toBe(false);
    });

    it('無制限案件はアポ登録可能', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'active',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'active', is_unlimited: true, max_appointments_total: 0, confirmed_count: 100 },
      };
      expect(canRegisterAppointment(alloc)).toBe(true);
    });

    it('allocation自体がinactiveならアポ登録不可', () => {
      const alloc: AllocationWithPrice = {
        id: 'a1', child_org_id: 'org', project_id: 'p1', payout_per_appointment: '10000', status: 'inactive',
        effectivePayoutPerAppointment: 10000,
        project: { title: 'Test', status: 'active', is_unlimited: false, max_appointments_total: 100, confirmed_count: 10 },
      };
      expect(canRegisterAppointment(alloc)).toBe(false);
    });
  });

  describe('二次代理店判定（組織階層ベース）', () => {
    // 組織階層で二次代理店を判定するロジック
    interface Org {
      id: string;
      name: string;
      parent_org_id: string | null;
    }

    function isSecondTierOrg(org: Org, allOrgs: Org[]): boolean {
      if (!org.parent_org_id) return false;
      const parent = allOrgs.find(o => o.id === org.parent_org_id);
      return !!parent?.parent_org_id;
    }

    const orgs: Org[] = [
      { id: 'crafia-hq', name: 'Crafia本部', parent_org_id: null },
      { id: 'useful', name: '株式会社useful', parent_org_id: 'crafia-hq' },
      { id: 'useful-direct', name: 'useful（直採）', parent_org_id: 'useful' },
      { id: 'resta', name: '株式会社Resta', parent_org_id: 'useful' },
    ];

    it('Crafia本部は二次代理店ではない', () => {
      const crafia = orgs.find(o => o.id === 'crafia-hq')!;
      expect(isSecondTierOrg(crafia, orgs)).toBe(false);
    });

    it('一次代理店（useful）は二次代理店ではない（親がCrafia本部）', () => {
      const useful = orgs.find(o => o.id === 'useful')!;
      expect(isSecondTierOrg(useful, orgs)).toBe(false);
    });

    it('二次代理店（useful直採）は二次代理店と判定される（親の親が存在）', () => {
      const usefulDirect = orgs.find(o => o.id === 'useful-direct')!;
      expect(isSecondTierOrg(usefulDirect, orgs)).toBe(true);
    });

    it('二次代理店（Resta）は二次代理店と判定される', () => {
      const resta = orgs.find(o => o.id === 'resta')!;
      expect(isSecondTierOrg(resta, orgs)).toBe(true);
    });

    it('roleに依存せず、組織階層で判定する（partnerロールでも二次代理店なら継承する）', () => {
      // roleが'partner'でも、組織階層が二次代理店なら継承すべき
      const usefulDirect = orgs.find(o => o.id === 'useful-direct')!;
      const isSecondTier = isSecondTierOrg(usefulDirect, orgs);
      expect(isSecondTier).toBe(true);
      // 二次代理店なら親のアロケーションを継承
      if (isSecondTier) {
        const result = computeInheritedAllocations([], parentAllocations, [], usefulDirect.id);
        expect(result).toHaveLength(4);
      }
    });
  });

  describe('卸単価の設定', () => {
    it('カスタム卸単価が設定されていない場合、親の卸単価が使われる', () => {
      const result = computeInheritedAllocations([], parentAllocations, [], subOrgId);
      result.forEach(a => {
        expect(a.effectivePayoutPerAppointment).toBe(10000);
      });
    });

    it('一部の案件のみカスタム卸単価を設定できる', () => {
      const prices: SubAllocationPrice[] = [
        { id: 'p1', allocation_id: 'parent-alloc-1', sub_org_id: subOrgId, payout_per_appointment: 8000 },
      ];
      const result = computeInheritedAllocations([], parentAllocations, prices, subOrgId);
      
      const alloc1 = result.find(a => a.id === 'parent-alloc-1');
      const alloc2 = result.find(a => a.id === 'parent-alloc-2');
      
      expect(alloc1?.effectivePayoutPerAppointment).toBe(8000);
      expect(alloc2?.effectivePayoutPerAppointment).toBe(10000);
    });

    it('卸単価0円も有効な設定として扱う', () => {
      const prices: SubAllocationPrice[] = [
        { id: 'p1', allocation_id: 'parent-alloc-1', sub_org_id: subOrgId, payout_per_appointment: 0 },
      ];
      const result = computeInheritedAllocations([], parentAllocations, prices, subOrgId);
      const alloc1 = result.find(a => a.id === 'parent-alloc-1');
      expect(alloc1?.effectivePayoutPerAppointment).toBe(0);
    });
  });
});
