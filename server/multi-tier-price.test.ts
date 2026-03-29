import { describe, it, expect } from 'vitest';

/**
 * 多階層代理店の卸単価設定テスト
 * 
 * 1次→2次、2次→3次、3次→4次の各階層で卸単価を設定できることを検証する。
 * SubPartnerManagement.tsxの修正ロジック（祖先チェーンからの継承allocations取得）をテスト。
 */

// --- Types ---

interface Org {
  id: string;
  name: string;
  parent_org_id: string | null;
}

interface Allocation {
  id: string;
  child_org_id: string;
  project_id: string;
  payout_per_appointment: string;
  status: string;
  project?: { title: string; status: string; project_number: string };
}

interface SubAllocationPrice {
  id: string;
  allocation_id: string;
  sub_org_id: string;
  payout_per_appointment: number;
}

// --- Helper functions mirroring SubPartnerManagement.tsx logic ---

function getDescendantOrgs(allOrgs: Org[], rootOrgId: string): Org[] {
  const descendants: Org[] = [];
  const queue = [rootOrgId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = allOrgs.filter(o => o.parent_org_id === parentId && o.id !== rootOrgId);
    for (const child of children) {
      if (!descendants.some(d => d.id === child.id)) {
        descendants.push(child);
        queue.push(child.id);
      }
    }
  }
  return descendants;
}

/**
 * Simulates the updated fetchData logic in SubPartnerManagement.tsx
 * Returns all visible allocations for the given org (direct + inherited from ancestors)
 */
function getVisibleAllocations(
  userOrgId: string,
  allOrgs: Org[],
  allAllocations: Allocation[],
  allSubPrices: SubAllocationPrice[],
): (Allocation & { _effectivePayout: number | null })[] {
  // 1. Direct allocations
  const directAllocs = allAllocations.filter(a => a.child_org_id === userOrgId);
  const result: (Allocation & { _effectivePayout: number | null })[] = directAllocs.map(a => ({
    ...a,
    _effectivePayout: Number(a.payout_per_appointment),
  }));
  const collectedProjectIds = new Set(directAllocs.map(a => a.project_id));

  // 2. Build ancestor chain
  const myOrg = allOrgs.find(o => o.id === userOrgId);
  if (!myOrg?.parent_org_id) return result;

  const ancestorOrgIds: string[] = [];
  let currentParentId: string | null = myOrg.parent_org_id;
  const maxDepth = 10;
  let depth = 0;
  while (currentParentId && depth < maxDepth) {
    const ancestorOrg = allOrgs.find(o => o.id === currentParentId);
    if (!ancestorOrg) break;
    if (ancestorOrg.parent_org_id) {
      ancestorOrgIds.push(ancestorOrg.id);
    }
    currentParentId = ancestorOrg.parent_org_id;
    depth++;
  }

  // 3. Inherit from ancestors
  for (const ancestorId of ancestorOrgIds) {
    const ancestorAllocs = allAllocations.filter(a => a.child_org_id === ancestorId);
    const newAllocs = ancestorAllocs.filter(a => !collectedProjectIds.has(a.project_id));

    if (newAllocs.length > 0) {
      const myPriceMap = new Map<string, number>();
      allSubPrices
        .filter(p => p.sub_org_id === userOrgId && newAllocs.some(a => a.id === p.allocation_id))
        .forEach(p => myPriceMap.set(p.allocation_id, Number(p.payout_per_appointment)));

      const inherited = newAllocs.map(a => ({
        ...a,
        _effectivePayout: myPriceMap.has(a.id) ? myPriceMap.get(a.id)! : null,
      }));
      result.push(...inherited);
      newAllocs.forEach(a => collectedProjectIds.add(a.project_id));
    }
  }

  return result;
}

/**
 * Simulates openPriceEdit logic: build price entries for a child org
 */
function buildPriceEntries(
  parentAllocations: (Allocation & { _effectivePayout: number | null })[],
  childOrgId: string,
  userOrgId: string,
  subPrices: SubAllocationPrice[],
) {
  const activeAllocs = parentAllocations.filter(a => a.project?.status !== 'closed');
  return activeAllocs.map(a => {
    const existing = subPrices.find(p => p.allocation_id === a.id && p.sub_org_id === childOrgId);
    const isInherited = a.child_org_id !== userOrgId;
    const myPayout = isInherited ? a._effectivePayout : Number(a.payout_per_appointment);
    return {
      allocationId: a.id,
      projectTitle: a.project?.title || '—',
      projectNumber: a.project?.project_number || '',
      parentPayout: myPayout,
      subPrice: existing ? Number(existing.payout_per_appointment) : null,
      subPriceId: existing?.id || null,
    };
  });
}

// --- Test data ---

const orgs: Org[] = [
  { id: 'crafia-hq', name: 'Crafia本部', parent_org_id: null },
  { id: 'tier1-useful', name: '1次:useful', parent_org_id: 'crafia-hq' },
  { id: 'tier2-resta', name: '2次:Resta', parent_org_id: 'tier1-useful' },
  { id: 'tier3-abc', name: '3次:ABC', parent_org_id: 'tier2-resta' },
  { id: 'tier4-xyz', name: '4次:XYZ', parent_org_id: 'tier3-abc' },
];

const allocations: Allocation[] = [
  {
    id: 'alloc-1',
    child_org_id: 'tier1-useful',
    project_id: 'proj-1',
    payout_per_appointment: '10000',
    status: 'active',
    project: { title: 'AIマネージャー', status: 'active', project_number: 'P001' },
  },
  {
    id: 'alloc-2',
    child_org_id: 'tier1-useful',
    project_id: 'proj-2',
    payout_per_appointment: '15000',
    status: 'active',
    project: { title: 'SNSマーケ', status: 'active', project_number: 'P002' },
  },
  {
    id: 'alloc-3',
    child_org_id: 'tier1-useful',
    project_id: 'proj-3',
    payout_per_appointment: '8000',
    status: 'active',
    project: { title: '終了案件', status: 'closed', project_number: 'P003' },
  },
];

// --- Tests ---

describe('多階層代理店の卸単価設定', () => {
  describe('1次代理店（useful）の視点', () => {
    it('直接割り当てられた案件が見える', () => {
      const visible = getVisibleAllocations('tier1-useful', orgs, allocations, []);
      expect(visible).toHaveLength(3);
      expect(visible.every(a => a._effectivePayout !== null)).toBe(true);
    });

    it('2次代理店（Resta）への卸単価を設定できる', () => {
      const visible = getVisibleAllocations('tier1-useful', orgs, allocations, []);
      const descendants = getDescendantOrgs(orgs, 'tier1-useful');
      expect(descendants.some(d => d.id === 'tier2-resta')).toBe(true);

      const entries = buildPriceEntries(visible, 'tier2-resta', 'tier1-useful', []);
      // closed案件は除外
      expect(entries).toHaveLength(2);
      expect(entries[0].parentPayout).toBe(10000);
      expect(entries[1].parentPayout).toBe(15000);
    });
  });

  describe('2次代理店（Resta）の視点', () => {
    it('祖先チェーンから案件を継承できる', () => {
      const visible = getVisibleAllocations('tier2-resta', orgs, allocations, []);
      // 直接割り当てはないが、1次代理店の案件を継承
      expect(visible).toHaveLength(3);
    });

    it('1次代理店が卸単価を設定した場合、その単価が自社の卸単価として表示される', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-1', allocation_id: 'alloc-1', sub_org_id: 'tier2-resta', payout_per_appointment: 8000 },
        { id: 'sp-2', allocation_id: 'alloc-2', sub_org_id: 'tier2-resta', payout_per_appointment: 12000 },
      ];
      const visible = getVisibleAllocations('tier2-resta', orgs, allocations, subPrices);
      
      const alloc1 = visible.find(a => a.id === 'alloc-1');
      const alloc2 = visible.find(a => a.id === 'alloc-2');
      expect(alloc1?._effectivePayout).toBe(8000);
      expect(alloc2?._effectivePayout).toBe(12000);
    });

    it('3次代理店（ABC）への卸単価を設定できる', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-1', allocation_id: 'alloc-1', sub_org_id: 'tier2-resta', payout_per_appointment: 8000 },
        { id: 'sp-2', allocation_id: 'alloc-2', sub_org_id: 'tier2-resta', payout_per_appointment: 12000 },
      ];
      const visible = getVisibleAllocations('tier2-resta', orgs, allocations, subPrices);
      const descendants = getDescendantOrgs(orgs, 'tier2-resta');
      expect(descendants.some(d => d.id === 'tier3-abc')).toBe(true);

      const entries = buildPriceEntries(visible, 'tier3-abc', 'tier2-resta', []);
      // closed案件は除外
      expect(entries).toHaveLength(2);
      // 自社への卸単価が表示される
      expect(entries[0].parentPayout).toBe(8000);
      expect(entries[1].parentPayout).toBe(12000);
    });

    it('卸単価が未設定の場合、parentPayoutはnullになる', () => {
      // 1次代理店がRestaへの卸単価を設定していない場合
      const visible = getVisibleAllocations('tier2-resta', orgs, allocations, []);
      const entries = buildPriceEntries(visible, 'tier3-abc', 'tier2-resta', []);
      // 継承案件で卸単価未設定 → parentPayoutはnull
      expect(entries[0].parentPayout).toBeNull();
      expect(entries[1].parentPayout).toBeNull();
    });
  });

  describe('3次代理店（ABC）の視点', () => {
    it('祖先チェーンから案件を継承できる', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-1', allocation_id: 'alloc-1', sub_org_id: 'tier3-abc', payout_per_appointment: 6000 },
        { id: 'sp-2', allocation_id: 'alloc-2', sub_org_id: 'tier3-abc', payout_per_appointment: 10000 },
      ];
      const visible = getVisibleAllocations('tier3-abc', orgs, allocations, subPrices);
      expect(visible).toHaveLength(3);
      
      const alloc1 = visible.find(a => a.id === 'alloc-1');
      expect(alloc1?._effectivePayout).toBe(6000);
    });

    it('4次代理店（XYZ）への卸単価を設定できる', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-abc-1', allocation_id: 'alloc-1', sub_org_id: 'tier3-abc', payout_per_appointment: 6000 },
        { id: 'sp-abc-2', allocation_id: 'alloc-2', sub_org_id: 'tier3-abc', payout_per_appointment: 10000 },
      ];
      const visible = getVisibleAllocations('tier3-abc', orgs, allocations, subPrices);
      const descendants = getDescendantOrgs(orgs, 'tier3-abc');
      expect(descendants.some(d => d.id === 'tier4-xyz')).toBe(true);

      const entries = buildPriceEntries(visible, 'tier4-xyz', 'tier3-abc', []);
      expect(entries).toHaveLength(2);
      expect(entries[0].parentPayout).toBe(6000);
      expect(entries[1].parentPayout).toBe(10000);
    });

    it('既存の4次代理店への卸単価が正しく表示される', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-abc-1', allocation_id: 'alloc-1', sub_org_id: 'tier3-abc', payout_per_appointment: 6000 },
        { id: 'sp-abc-2', allocation_id: 'alloc-2', sub_org_id: 'tier3-abc', payout_per_appointment: 10000 },
        { id: 'sp-xyz-1', allocation_id: 'alloc-1', sub_org_id: 'tier4-xyz', payout_per_appointment: 4000 },
      ];
      const visible = getVisibleAllocations('tier3-abc', orgs, allocations, subPrices);
      const xyzPrices = subPrices.filter(p => p.sub_org_id === 'tier4-xyz');
      const entries = buildPriceEntries(visible, 'tier4-xyz', 'tier3-abc', xyzPrices);
      
      const entry1 = entries.find(e => e.allocationId === 'alloc-1');
      const entry2 = entries.find(e => e.allocationId === 'alloc-2');
      expect(entry1?.subPrice).toBe(4000);
      expect(entry1?.parentPayout).toBe(6000);
      expect(entry2?.subPrice).toBeNull();
      expect(entry2?.parentPayout).toBe(10000);
    });
  });

  describe('4次代理店（XYZ）の視点', () => {
    it('祖先チェーンから案件を継承できる', () => {
      const subPrices: SubAllocationPrice[] = [
        { id: 'sp-xyz-1', allocation_id: 'alloc-1', sub_org_id: 'tier4-xyz', payout_per_appointment: 4000 },
      ];
      const visible = getVisibleAllocations('tier4-xyz', orgs, allocations, subPrices);
      expect(visible).toHaveLength(3);
      
      const alloc1 = visible.find(a => a.id === 'alloc-1');
      expect(alloc1?._effectivePayout).toBe(4000);
    });

    it('傘下代理店がない場合、卸単価設定タブは空になる', () => {
      const descendants = getDescendantOrgs(orgs, 'tier4-xyz');
      expect(descendants).toHaveLength(0);
    });
  });

  describe('エッジケース', () => {
    it('直接割り当てと継承が混在する場合、直接割り当てが優先される', () => {
      const extraAllocs: Allocation[] = [
        ...allocations,
        {
          id: 'direct-alloc-resta',
          child_org_id: 'tier2-resta',
          project_id: 'proj-1', // Same project as alloc-1
          payout_per_appointment: '9000',
          status: 'active',
          project: { title: 'AIマネージャー', status: 'active', project_number: 'P001' },
        },
      ];
      const visible = getVisibleAllocations('tier2-resta', orgs, extraAllocs, []);
      // proj-1 should come from direct allocation, not inherited
      const proj1 = visible.find(a => a.project_id === 'proj-1');
      expect(proj1?.id).toBe('direct-alloc-resta');
      expect(proj1?._effectivePayout).toBe(9000);
    });

    it('Crafia本部のallocationsは継承対象外（parent_org_idがnull）', () => {
      // Crafia本部に直接割り当てがあっても、祖先チェーンでスキップされる
      const extraAllocs: Allocation[] = [
        ...allocations,
        {
          id: 'alloc-hq',
          child_org_id: 'crafia-hq',
          project_id: 'proj-hq',
          payout_per_appointment: '20000',
          status: 'active',
          project: { title: 'HQ案件', status: 'active', project_number: 'P999' },
        },
      ];
      const visible = getVisibleAllocations('tier2-resta', orgs, extraAllocs, []);
      // HQ allocation should NOT be inherited (Crafia HQ is skipped in ancestor chain)
      expect(visible.find(a => a.project_id === 'proj-hq')).toBeUndefined();
    });
  });
});
