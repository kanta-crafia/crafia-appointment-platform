import { describe, it, expect } from 'vitest';

/**
 * 代理店別集計の再帰ツリー構築・子孫集計ロジックのテスト
 * AgencyStats.tsxのbuildOrgTree, collectAllAppointments, countDescendantsを検証
 */

// --- Types ---

interface Org {
  id: string;
  name: string;
  parent_org_id: string | null;
  status: string;
}

interface Appointment {
  id: string;
  org_id: string;
  status: string;
}

interface OrgStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  appointments: Appointment[];
}

interface OrgTreeNode {
  org: Org;
  stats: OrgStats;
  children: OrgTreeNode[];
  depth: number;
}

// --- Helper functions (mirroring AgencyStats.tsx) ---

function calcStats(appts: Appointment[]): OrgStats {
  return {
    total: appts.length,
    approved: appts.filter(a => a.status === 'approved').length,
    pending: appts.filter(a => a.status === 'pending').length,
    rejected: appts.filter(a => a.status === 'rejected').length,
    cancelled: appts.filter(a => a.status === 'cancelled').length,
    appointments: appts,
  };
}

function buildOrgTree(
  parentId: string,
  allOrgs: Org[],
  appointments: Appointment[],
  depth: number,
): OrgTreeNode[] {
  const children = allOrgs.filter(o => o.parent_org_id === parentId);
  return children.map(child => {
    const childAppts = appointments.filter(a => a.org_id === child.id);
    const grandchildren = buildOrgTree(child.id, allOrgs, appointments, depth + 1);
    return {
      org: child,
      stats: calcStats(childAppts),
      children: grandchildren,
      depth,
    };
  });
}

function collectAllAppointments(nodes: OrgTreeNode[]): Appointment[] {
  let result: Appointment[] = [];
  for (const node of nodes) {
    result = [...result, ...node.stats.appointments];
    result = [...result, ...collectAllAppointments(node.children)];
  }
  return result;
}

function countDescendants(nodes: OrgTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    count += countDescendants(node.children);
  }
  return count;
}

// --- Test data ---

const orgs: Org[] = [
  { id: 'crafia-hq', name: 'Crafia本部', parent_org_id: null, status: 'active' },
  { id: 'tier1-useful', name: '1次:useful', parent_org_id: 'crafia-hq', status: 'active' },
  { id: 'tier2-resta', name: '2次:Resta', parent_org_id: 'tier1-useful', status: 'active' },
  { id: 'tier2-direct', name: '2次:直採', parent_org_id: 'tier1-useful', status: 'active' },
  { id: 'tier3-abc', name: '3次:ABC', parent_org_id: 'tier2-resta', status: 'active' },
  { id: 'tier4-xyz', name: '4次:XYZ', parent_org_id: 'tier3-abc', status: 'active' },
  { id: 'tier1-other', name: '1次:Other', parent_org_id: 'crafia-hq', status: 'active' },
];

const appointments: Appointment[] = [
  // tier1-useful: 2件
  { id: 'a1', org_id: 'tier1-useful', status: 'approved' },
  { id: 'a2', org_id: 'tier1-useful', status: 'pending' },
  // tier2-resta: 3件
  { id: 'a3', org_id: 'tier2-resta', status: 'approved' },
  { id: 'a4', org_id: 'tier2-resta', status: 'rejected' },
  { id: 'a5', org_id: 'tier2-resta', status: 'approved' },
  // tier2-direct: 1件
  { id: 'a6', org_id: 'tier2-direct', status: 'cancelled' },
  // tier3-abc: 2件
  { id: 'a7', org_id: 'tier3-abc', status: 'approved' },
  { id: 'a8', org_id: 'tier3-abc', status: 'pending' },
  // tier4-xyz: 1件
  { id: 'a9', org_id: 'tier4-xyz', status: 'approved' },
  // tier1-other: 1件
  { id: 'a10', org_id: 'tier1-other', status: 'pending' },
];

// --- Tests ---

describe('代理店別集計の再帰ツリー構築', () => {
  describe('buildOrgTree', () => {
    it('一次代理店の直下の子孫企業ツリーを構築できる', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      expect(tree).toHaveLength(2); // tier2-resta, tier2-direct
      expect(tree.map(n => n.org.id).sort()).toEqual(['tier2-direct', 'tier2-resta']);
    });

    it('再帰的に全階層のツリーを構築できる', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const resta = tree.find(n => n.org.id === 'tier2-resta')!;
      expect(resta.children).toHaveLength(1); // tier3-abc
      expect(resta.children[0].org.id).toBe('tier3-abc');
      expect(resta.children[0].children).toHaveLength(1); // tier4-xyz
      expect(resta.children[0].children[0].org.id).toBe('tier4-xyz');
    });

    it('各ノードに正しいdepthが設定される', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const resta = tree.find(n => n.org.id === 'tier2-resta')!;
      expect(resta.depth).toBe(1);
      expect(resta.children[0].depth).toBe(2); // tier3-abc
      expect(resta.children[0].children[0].depth).toBe(3); // tier4-xyz
    });

    it('各ノードに正しいstatsが設定される', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const resta = tree.find(n => n.org.id === 'tier2-resta')!;
      expect(resta.stats.total).toBe(3);
      expect(resta.stats.approved).toBe(2);
      expect(resta.stats.rejected).toBe(1);

      const direct = tree.find(n => n.org.id === 'tier2-direct')!;
      expect(direct.stats.total).toBe(1);
      expect(direct.stats.cancelled).toBe(1);
    });

    it('子孫がない組織は空のchildrenを持つ', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const direct = tree.find(n => n.org.id === 'tier2-direct')!;
      expect(direct.children).toHaveLength(0);
    });

    it('別の一次代理店のツリーは独立している', () => {
      const tree = buildOrgTree('tier1-other', orgs, appointments, 1);
      expect(tree).toHaveLength(0); // tier1-otherには子がない
    });
  });

  describe('collectAllAppointments', () => {
    it('全子孫のアポを再帰的に収集できる', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const allAppts = collectAllAppointments(tree);
      // tier2-resta(3) + tier2-direct(1) + tier3-abc(2) + tier4-xyz(1) = 7
      expect(allAppts).toHaveLength(7);
    });

    it('空のツリーからは空の配列を返す', () => {
      const result = collectAllAppointments([]);
      expect(result).toHaveLength(0);
    });

    it('一部のノードにのみアポがある場合も正しく収集する', () => {
      const tree = buildOrgTree('tier2-resta', orgs, appointments, 1);
      const allAppts = collectAllAppointments(tree);
      // tier3-abc(2) + tier4-xyz(1) = 3
      expect(allAppts).toHaveLength(3);
    });
  });

  describe('countDescendants', () => {
    it('全子孫企業数を正しくカウントする', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      // tier2-resta, tier2-direct, tier3-abc, tier4-xyz = 4
      expect(countDescendants(tree)).toBe(4);
    });

    it('子孫がない場合は0を返す', () => {
      expect(countDescendants([])).toBe(0);
    });

    it('特定のサブツリーの子孫数をカウントできる', () => {
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const resta = tree.find(n => n.org.id === 'tier2-resta')!;
      // tier3-abc, tier4-xyz = 2
      expect(countDescendants(resta.children)).toBe(2);
    });
  });

  describe('合算値の計算', () => {
    it('一次代理店の合算値は自社 + 全子孫の合計', () => {
      const ownAppts = appointments.filter(a => a.org_id === 'tier1-useful');
      const tree = buildOrgTree('tier1-useful', orgs, appointments, 1);
      const descendantAppts = collectAllAppointments(tree);
      const allAppts = [...ownAppts, ...descendantAppts];
      const combined = calcStats(allAppts);
      // useful(2) + resta(3) + direct(1) + abc(2) + xyz(1) = 9
      expect(combined.total).toBe(9);
      // approved: useful(1) + resta(2) + abc(1) + xyz(1) = 5
      expect(combined.approved).toBe(5);
    });

    it('子孫がない一次代理店の合算値は自社のみ', () => {
      const ownAppts = appointments.filter(a => a.org_id === 'tier1-other');
      const tree = buildOrgTree('tier1-other', orgs, appointments, 1);
      const descendantAppts = collectAllAppointments(tree);
      const allAppts = [...ownAppts, ...descendantAppts];
      const combined = calcStats(allAppts);
      expect(combined.total).toBe(1);
      expect(combined.pending).toBe(1);
    });
  });
});
