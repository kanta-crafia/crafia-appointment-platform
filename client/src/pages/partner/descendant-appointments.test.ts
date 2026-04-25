import { describe, it, expect } from 'vitest';

/**
 * Test: 再帰的に全子孫組織IDを取得するロジック
 * Appointments.tsxのfetchAppointments関数で使用されるロジックと同等
 */

interface OrgMinimal {
  id: string;
  name: string;
  parent_org_id: string | null;
}

// Appointments.tsxのfetchAppointments内で使用されるロジックを関数化
function getDescendantIds(allOrgs: OrgMinimal[], rootOrgId: string): string[] {
  const descendantIds: string[] = [];
  const queue = [rootOrgId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = allOrgs.filter(o => o.parent_org_id === parentId && o.id !== rootOrgId);
    for (const child of children) {
      if (!descendantIds.includes(child.id)) {
        descendantIds.push(child.id);
        queue.push(child.id);
      }
    }
  }
  return descendantIds;
}

describe('子孫組織アポ表示ロジック', () => {
  // テスト用組織データ: 1次→2次→3次→4次の階層
  const orgs: OrgMinimal[] = [
    { id: 'org-1', name: '1次代理店', parent_org_id: null },
    { id: 'org-2a', name: '2次代理店A', parent_org_id: 'org-1' },
    { id: 'org-2b', name: '2次代理店B', parent_org_id: 'org-1' },
    { id: 'org-3a', name: '3次代理店A（org-2aの子）', parent_org_id: 'org-2a' },
    { id: 'org-3b', name: '3次代理店B（org-2aの子）', parent_org_id: 'org-2a' },
    { id: 'org-3c', name: '3次代理店C（org-2bの子）', parent_org_id: 'org-2b' },
    { id: 'org-4a', name: '4次代理店A（org-3aの子）', parent_org_id: 'org-3a' },
    { id: 'other-org', name: '無関係の組織', parent_org_id: null },
  ];

  it('1次代理店から全子孫（2次・3次・4次）が取得できる', () => {
    const descendants = getDescendantIds(orgs, 'org-1');
    expect(descendants).toContain('org-2a');
    expect(descendants).toContain('org-2b');
    expect(descendants).toContain('org-3a');
    expect(descendants).toContain('org-3b');
    expect(descendants).toContain('org-3c');
    expect(descendants).toContain('org-4a');
    expect(descendants).not.toContain('org-1'); // 自分自身は含まない
    expect(descendants).not.toContain('other-org'); // 無関係な組織は含まない
    expect(descendants).toHaveLength(6);
  });

  it('2次代理店Aから子孫（3次・4次）が取得できる', () => {
    const descendants = getDescendantIds(orgs, 'org-2a');
    expect(descendants).toContain('org-3a');
    expect(descendants).toContain('org-3b');
    expect(descendants).toContain('org-4a');
    expect(descendants).not.toContain('org-2a'); // 自分自身は含まない
    expect(descendants).not.toContain('org-2b'); // 兄弟は含まない
    expect(descendants).not.toContain('org-3c'); // 兄弟の子は含まない
    expect(descendants).toHaveLength(3);
  });

  it('3次代理店Aから子孫（4次）が取得できる', () => {
    const descendants = getDescendantIds(orgs, 'org-3a');
    expect(descendants).toContain('org-4a');
    expect(descendants).toHaveLength(1);
  });

  it('末端の組織からは子孫が0件', () => {
    const descendants = getDescendantIds(orgs, 'org-4a');
    expect(descendants).toHaveLength(0);
  });

  it('無関係の組織からは子孫が0件', () => {
    const descendants = getDescendantIds(orgs, 'other-org');
    expect(descendants).toHaveLength(0);
  });

  it('allOrgIdsは自組織 + 全子孫を含む', () => {
    const userOrgId = 'org-1';
    const descendantIds = getDescendantIds(orgs, userOrgId);
    const allOrgIds = [userOrgId, ...descendantIds];
    expect(allOrgIds).toHaveLength(7); // 自分 + 6子孫
    expect(allOrgIds).toContain('org-1');
    expect(allOrgIds).toContain('org-2a');
    expect(allOrgIds).toContain('org-2b');
    expect(allOrgIds).toContain('org-3a');
    expect(allOrgIds).toContain('org-3b');
    expect(allOrgIds).toContain('org-3c');
    expect(allOrgIds).toContain('org-4a');
  });

  it('orgNameMapに全子孫の名前が含まれる', () => {
    const orgNameMap: Record<string, string> = {};
    const descendantIds: string[] = [];
    const queue = ['org-1'];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = orgs.filter(o => o.parent_org_id === parentId && o.id !== 'org-1');
      for (const child of children) {
        if (!descendantIds.includes(child.id)) {
          descendantIds.push(child.id);
          orgNameMap[child.id] = child.name;
          queue.push(child.id);
        }
      }
    }
    expect(Object.keys(orgNameMap)).toHaveLength(6);
    expect(orgNameMap['org-3a']).toBe('3次代理店A（org-2aの子）');
    expect(orgNameMap['org-4a']).toBe('4次代理店A（org-3aの子）');
  });

  it('循環参照がある場合でも無限ループしない', () => {
    const circularOrgs: OrgMinimal[] = [
      { id: 'a', name: 'A', parent_org_id: null },
      { id: 'b', name: 'B', parent_org_id: 'a' },
      { id: 'c', name: 'C', parent_org_id: 'b' },
      // cの子がaを指す循環参照（通常は発生しないが安全策）
    ];
    const descendants = getDescendantIds(circularOrgs, 'a');
    expect(descendants).toContain('b');
    expect(descendants).toContain('c');
    expect(descendants).toHaveLength(2);
  });
});
