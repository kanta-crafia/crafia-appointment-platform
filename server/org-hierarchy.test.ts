import { describe, expect, it } from "vitest";

/**
 * 組織階層表示・ユーザーと組織の整合性テスト
 * 
 * Organizations.tsxの階層表示ロジックと、
 * ユーザーのorg_idが正しい組織を指しているかの検証ロジックをテスト。
 */

// --- 組織階層表示ロジック（Organizations.tsxから抽出） ---

interface Organization {
  id: string;
  name: string;
  parent_org_id: string | null;
  status: string;
}

interface HierarchicalOrg {
  id: string;
  name: string;
  depth: number;
  parentName?: string;
}

function getHierarchicalOrgs(orgs: Organization[]): HierarchicalOrg[] {
  const topLevel = orgs.filter(o => !o.parent_org_id);
  const result: HierarchicalOrg[] = [];
  const addChildren = (parentId: string, depth: number) => {
    const children = orgs.filter(o => o.parent_org_id === parentId);
    for (const child of children) {
      const parent = orgs.find(o => o.id === parentId);
      result.push({ id: child.id, name: child.name, depth, parentName: parent?.name });
      addChildren(child.id, depth + 1);
    }
  };
  for (const top of topLevel) {
    result.push({ id: top.id, name: top.name, depth: 0 });
    addChildren(top.id, 1);
  }
  return result;
}

// --- ユーザーと組織の整合性検証ロジック ---

interface User {
  id: string;
  login_id: string;
  full_name: string;
  role: string;
  org_id: string;
}

interface Allocation {
  id: string;
  child_org_id: string;
  parent_org_id: string;
}

/**
 * ユーザーのorg_idが、そのユーザーに割り当てられた案件のchild_org_idと一致するか検証
 * 不一致の場合、案件が表示されない問題が発生する
 */
function validateUserOrgAlignment(
  user: User,
  allocations: Allocation[],
  orgs: Organization[]
): { valid: boolean; issue?: string } {
  // ユーザーのorg_idに対応する組織を取得
  const userOrg = orgs.find(o => o.id === user.org_id);
  if (!userOrg) {
    return { valid: false, issue: `ユーザー${user.login_id}のorg_id(${user.org_id})に対応する組織が見つかりません` };
  }

  // このユーザーの組織に割り当てがあるか確認
  const userAllocations = allocations.filter(a => a.child_org_id === user.org_id);
  
  // 割り当てがない場合、他の組織に割り当てがあるか確認（問題の検出）
  if (userAllocations.length === 0) {
    // ユーザー名と一致する組織名の組織があるか確認
    const matchingOrg = orgs.find(o => o.name === user.full_name && o.id !== user.org_id);
    if (matchingOrg) {
      const matchingAllocations = allocations.filter(a => a.child_org_id === matchingOrg.id);
      if (matchingAllocations.length > 0) {
        return {
          valid: false,
          issue: `ユーザー${user.login_id}のorg_id(${user.org_id}: ${userOrg.name})が、割り当て先組織(${matchingOrg.id}: ${matchingOrg.name})と不一致です`
        };
      }
    }
  }

  return { valid: true };
}

// --- テストデータ ---

const testOrgs: Organization[] = [
  { id: 'org-hq', name: 'Crafia本部', parent_org_id: null, status: 'active' },
  { id: 'org-useful', name: '株式会社useful', parent_org_id: 'org-hq', status: 'active' },
  { id: 'org-feelson', name: '株式会社フィールソン', parent_org_id: 'org-hq', status: 'active' },
  { id: 'org-okura', name: '大藏 一登', parent_org_id: 'org-useful', status: 'active' },
  { id: 'org-resta', name: '株式会社Resta', parent_org_id: 'org-useful', status: 'active' },
];

// --- テスト ---

describe("組織階層表示", () => {
  it("トップレベル組織はdepth=0で表示される", () => {
    const result = getHierarchicalOrgs(testOrgs);
    const hq = result.find(o => o.id === 'org-hq');
    expect(hq).toBeDefined();
    expect(hq!.depth).toBe(0);
    expect(hq!.parentName).toBeUndefined();
  });

  it("一次代理店はdepth=1で親企業名付きで表示される", () => {
    const result = getHierarchicalOrgs(testOrgs);
    const useful = result.find(o => o.id === 'org-useful');
    expect(useful).toBeDefined();
    expect(useful!.depth).toBe(1);
    expect(useful!.parentName).toBe('Crafia本部');
  });

  it("二次代理店はdepth=2で親企業名付きで表示される", () => {
    const result = getHierarchicalOrgs(testOrgs);
    const okura = result.find(o => o.id === 'org-okura');
    expect(okura).toBeDefined();
    expect(okura!.depth).toBe(2);
    expect(okura!.parentName).toBe('株式会社useful');
  });

  it("階層順に並ぶ（親→子→孫）", () => {
    const result = getHierarchicalOrgs(testOrgs);
    const names = result.map(o => o.name);
    // Crafia本部 → useful → 大藏一登 → Resta → フィールソン の順
    const hqIdx = names.indexOf('Crafia本部');
    const usefulIdx = names.indexOf('株式会社useful');
    const okuraIdx = names.indexOf('大藏 一登');
    const restaIdx = names.indexOf('株式会社Resta');
    const feelsonIdx = names.indexOf('株式会社フィールソン');
    
    expect(hqIdx).toBeLessThan(usefulIdx);
    expect(usefulIdx).toBeLessThan(okuraIdx);
    expect(usefulIdx).toBeLessThan(restaIdx);
    // フィールソンはCrafia本部の子なので、usefulの兄弟
    expect(hqIdx).toBeLessThan(feelsonIdx);
  });

  it("全組織が含まれる", () => {
    const result = getHierarchicalOrgs(testOrgs);
    expect(result).toHaveLength(5);
  });
});

describe("ユーザーと組織の整合性検証", () => {
  const testAllocations: Allocation[] = [
    { id: 'alloc-1', child_org_id: 'org-okura', parent_org_id: 'org-useful' },
    { id: 'alloc-2', child_org_id: 'org-resta', parent_org_id: 'org-useful' },
  ];

  it("正しいorg_idを持つユーザーは検証に通る", () => {
    const user: User = {
      id: 'u1', login_id: 'okura', full_name: '大藏 一登',
      role: 'sub_partner', org_id: 'org-okura'
    };
    const result = validateUserOrgAlignment(user, testAllocations, testOrgs);
    expect(result.valid).toBe(true);
  });

  it("間違ったorg_idを持つユーザーは検証に失敗する（今回のバグケース）", () => {
    const user: User = {
      id: 'u1', login_id: 'okura', full_name: '大藏 一登',
      role: 'sub_partner', org_id: 'org-hq' // 間違い：Crafia本部を指している
    };
    const result = validateUserOrgAlignment(user, testAllocations, testOrgs);
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('不一致');
  });

  it("割り当てがないユーザーでも、org_idが有効なら検証に通る", () => {
    const user: User = {
      id: 'u2', login_id: 'newuser', full_name: '新規ユーザー',
      role: 'partner', org_id: 'org-useful'
    };
    const result = validateUserOrgAlignment(user, testAllocations, testOrgs);
    expect(result.valid).toBe(true);
  });

  it("存在しないorg_idを持つユーザーは検証に失敗する", () => {
    const user: User = {
      id: 'u3', login_id: 'ghost', full_name: 'ゴースト',
      role: 'partner', org_id: 'org-nonexistent'
    };
    const result = validateUserOrgAlignment(user, testAllocations, testOrgs);
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('見つかりません');
  });
});
