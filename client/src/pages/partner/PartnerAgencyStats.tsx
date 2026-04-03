import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, type Appointment, type Organization } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, ChevronLeft, ChevronRight, ExternalLink, Eye, ChevronDown, ChevronUp, Building2, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';

interface OrgStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  excluded: number;
  appointments: Appointment[];
}

interface OrgTreeNode {
  org: Organization;
  stats: OrgStats;
  children: OrgTreeNode[];
  depth: number;
}

interface AgencyMonthlyData {
  org: Organization;
  own: OrgStats;
  descendantTree: OrgTreeNode[];
  combined: OrgStats;
}

function calcStats(appts: Appointment[]): OrgStats {
  // 非カウント = 承認済み＋非カウント案件のアポのみ（保留中・却下・取消は通常カウント）
  const excludedAppts = appts.filter(a => (a as any).project?.is_count_excluded === true && a.status === 'approved');
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

function buildOrgTree(
  parentId: string,
  allOrgs: Organization[],
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

function getDescendantOrgIds(allOrgs: Organization[], rootOrgId: string): string[] {
  const ids: string[] = [];
  const queue = [rootOrgId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const children = allOrgs.filter(o => o.parent_org_id === parentId && o.id !== rootOrgId);
    for (const child of children) {
      if (!ids.includes(child.id)) {
        ids.push(child.id);
        queue.push(child.id);
      }
    }
  }
  return ids;
}

export default function PartnerAgencyStats() {
  const { user } = useAuth();
  const userOrgId = user?.org_id;
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedAgency, setSelectedAgency] = useState<AgencyMonthlyData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showApptDetail, setShowApptDetail] = useState(false);
  const [filterOrg, setFilterOrg] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!userOrgId) return;
    setLoading(true);
    try {
      const monthStart = format(currentMonth, 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      // Get all orgs (RLS will limit visibility)
      const { data: orgData } = await supabase.from('organizations').select('*').order('name');
      const allOrgList = orgData || [];
      setOrgs(allOrgList);

      // Get descendant org IDs
      const descendantIds = getDescendantOrgIds(allOrgList, userOrgId);
      const allRelevantIds = [userOrgId, ...descendantIds];

      // Get appointments for self + all descendants
      const { data: apptData } = await supabase
        .from('appointments')
        .select('*, project:projects(title, project_number, company_name, unit_price, is_count_excluded), organization:organizations(name), creator:users!appointments_created_by_user_id_fkey(full_name, login_id)')
        .in('org_id', allRelevantIds)
        .gte('meeting_datetime', monthStart + 'T00:00:00')
        .lte('meeting_datetime', monthEnd + 'T23:59:59')
        .order('meeting_datetime', { ascending: false });

      setAppointments(apptData || []);
    } catch (e) {
      console.error('PartnerAgencyStats fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, userOrgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 直下の子企業を取得
  const directChildren = useMemo(() => {
    return orgs.filter(o => o.parent_org_id === userOrgId);
  }, [orgs, userOrgId]);

  const agencyData = useMemo(() => {
    const result: AgencyMonthlyData[] = [];
    const targetOrgs = filterOrg === 'all' ? directChildren : directChildren.filter(o => o.id === filterOrg);

    for (const org of targetOrgs) {
      const ownAppts = appointments.filter(a => a.org_id === org.id);
      const ownStats = calcStats(ownAppts);
      const descendantTree = buildOrgTree(org.id, orgs, appointments, 1);
      const allDescendantAppts = collectAllAppointments(descendantTree);
      const allAppts = [...ownAppts, ...allDescendantAppts];
      const combinedStats = calcStats(allAppts);

      if (combinedStats.total === 0 && filterOrg === 'all') continue;
      result.push({ org, own: ownStats, descendantTree, combined: combinedStats });
    }

    result.sort((a, b) => b.combined.total - a.combined.total);
    return result;
  }, [directChildren, orgs, appointments, filterOrg]);

  // 自社分のアポ統計
  const ownAppts = useMemo(() => appointments.filter(a => a.org_id === userOrgId), [appointments, userOrgId]);
  const ownStats = useMemo(() => calcStats(ownAppts), [ownAppts]);

  const totalStats = useMemo(() => {
    // 非カウント = 承認済み＋非カウント案件のアポのみ
    const excluded = appointments.filter(a => (a as any).project?.is_count_excluded === true && a.status === 'approved');
    const countable = appointments.filter(a => !excluded.includes(a));
    return {
      total: countable.length,
      approved: countable.filter(a => a.status === 'approved').length,
      pending: countable.filter(a => a.status === 'pending').length,
      rejected: countable.filter(a => a.status === 'rejected').length,
      cancelled: countable.filter(a => a.status === 'cancelled').length,
      excluded: excluded.length,
    };
  }, [appointments]);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const monthLabel = format(currentMonth, 'yyyy年M月', { locale: ja });

  const toggleExpand = (orgId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const openAgencyDetail = (agency: AgencyMonthlyData) => {
    setSelectedAgency(agency);
    setShowDetail(true);
  };

  const openApptDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowApptDetail(true);
  };

  // CSV download
  const handleCsvDownload = () => {
    if (appointments.length === 0) return;
    const statusLabel = (s: string) => {
      switch (s) {
        case 'approved': return '承認済';
        case 'pending': return '保留中';
        case 'rejected': return '却下';
        case 'cancelled': return '取消';
        default: return s;
      }
    };
    const headers = ['登録企業', '案件番号', '案件名', '先方企業名', '担当者', '獲得者名', '商談日時', 'ステータス', '登録日'];
    const rows = appointments.map(a => {
      return [
        (a as any).organization?.name || '',
        (a as any).project?.project_number || '',
        (a as any).project?.title || '',
        a.target_company_name,
        a.contact_person || '',
        a.acquirer_name || '',
        format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm'),
        statusLabel(a.status),
        format(new Date(a.created_at), 'yyyy/MM/dd'),
      ];
    });
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = `代理店別集計_${format(currentMonth, 'yyyyMM')}.csv`;
    el.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
  };

  const renderTreeRows = (nodes: OrgTreeNode[], parentExpanded: boolean): React.ReactNode[] => {
    if (!parentExpanded) return [];
    const rows: React.ReactNode[] = [];

    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedRows.has(node.org.id);
      const nodeRate = node.stats.total > 0
        ? Math.round((node.stats.approved / node.stats.total) * 100)
        : 0;

      const depthColors = ['', 'bg-blue-50/30', 'bg-purple-50/30', 'bg-teal-50/30', 'bg-orange-50/30'];
      const dotColors = ['', 'bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500'];
      const textColors = ['', 'text-blue-700', 'text-purple-700', 'text-teal-700', 'text-orange-700'];
      const tierLabels = ['', '二次代理店', '三次代理店', '四次代理店', '五次代理店'];

      const colorIdx = Math.min(node.depth, 4);
      const paddingLeft = 10 + (node.depth - 1) * 16;

      const descendantAppts = collectAllAppointments(node.children);
      const nodeTotal = node.stats.total + descendantAppts.length;

      rows.push(
        <TableRow key={node.org.id} className={depthColors[colorIdx]}>
          <TableCell>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${paddingLeft}px` }}>
              {hasChildren ? (
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0" onClick={() => toggleExpand(node.org.id)}>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              ) : (
                <div className="w-5 shrink-0" />
              )}
              <div className={`w-1.5 h-1.5 rounded-full ${dotColors[colorIdx]} shrink-0`} />
              <Building2 className={`w-3.5 h-3.5 ${textColors[colorIdx]} shrink-0`} />
              <span className={`text-sm ${textColors[colorIdx]} font-medium`}>{node.org.name}</span>
              <span className={`text-xs ${textColors[colorIdx]} opacity-60`}>（{tierLabels[colorIdx] || `${node.depth + 1}次代理店`}）</span>
              {hasChildren && (
                <span className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                  +{countDescendants(node.children)}社
                </span>
              )}
            </div>
          </TableCell>
          <TableCell className="text-center text-sm font-semibold">
            {hasChildren ? (
              <span title={`自社: ${node.stats.total} / 合計: ${nodeTotal}`}>
                {nodeTotal}
                {node.stats.total !== nodeTotal && (
                  <span className="text-xs text-muted-foreground ml-1">({node.stats.total})</span>
                )}
              </span>
            ) : (
              node.stats.total
            )}
          </TableCell>
          <TableCell className="text-center"><span className="text-xs text-emerald-600">{node.stats.approved}</span></TableCell>
          <TableCell className="text-center"><span className="text-xs text-amber-600">{node.stats.pending}</span></TableCell>
          <TableCell className="text-center"><span className="text-xs text-red-600">{node.stats.rejected}</span></TableCell>
          <TableCell className="text-center"><span className="text-xs text-gray-500">{node.stats.cancelled}</span></TableCell>
          <TableCell className="text-center"><span className="text-xs text-slate-500">{node.stats.excluded}</span></TableCell>
          <TableCell className="text-center">
            <span className="text-xs text-muted-foreground">{nodeRate}%</span>
          </TableCell>
          <TableCell />
        </TableRow>
      );

      if (hasChildren) {
        rows.push(...renderTreeRows(node.children, isExpanded));
      }
    }

    return rows;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="代理店別集計" description="傘下代理店の月次アポイント状況を確認" />

      {/* Month selector & filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} className="h-9 w-9">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-lg font-bold min-w-[140px] text-center">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={nextMonth} className="h-9 w-9">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {directChildren.length > 1 && (
            <>
              <span className="text-sm text-muted-foreground">企業フィルタ:</span>
              <Select value={filterOrg} onValueChange={setFilterOrg}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="全企業" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全企業</SelectItem>
                  {directChildren.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCsvDownload} disabled={appointments.length === 0}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">合計（全体）</p>
            <p className="text-2xl font-bold">{totalStats.total}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm border-l-4 border-l-emerald-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-emerald-600 font-medium mb-1">承認済</p>
            <p className="text-2xl font-bold text-emerald-700">{totalStats.approved}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm border-l-4 border-l-amber-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-amber-600 font-medium mb-1">保留中</p>
            <p className="text-2xl font-bold text-amber-700">{totalStats.pending}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm border-l-4 border-l-red-500">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-red-600 font-medium mb-1">却下</p>
            <p className="text-2xl font-bold text-red-700">{totalStats.rejected}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm border-l-4 border-l-gray-400">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 font-medium mb-1">取消</p>
            <p className="text-2xl font-bold text-gray-600">{totalStats.cancelled}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm border-l-4 border-l-slate-400">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500 font-medium mb-1">非カウント</p>
            <p className="text-2xl font-bold text-slate-600">{totalStats.excluded}</p>
          </CardContent>
        </Card>
      </div>

      {/* 自社分サマリー */}
      {ownStats.total > 0 && (
        <Card className="border shadow-sm mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">自社分</span>
              <div className="flex items-center gap-3 text-sm">
                <span>合計: <strong>{ownStats.total}</strong></span>
                <span className="text-emerald-600">承認: {ownStats.approved}</span>
                <span className="text-amber-600">保留: {ownStats.pending}</span>
                <span className="text-red-600">却下: {ownStats.rejected}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agency table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            傘下代理店別集計（{monthLabel}）
            <span className="text-xs font-normal text-muted-foreground ml-2">
              ※ 数値は全子孫企業分を含む合算値です
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代理店名</TableHead>
                <TableHead className="text-center">合計</TableHead>
                <TableHead className="text-center">承認済</TableHead>
                <TableHead className="text-center">保留中</TableHead>
                <TableHead className="text-center">却下</TableHead>
                <TableHead className="text-center">取消</TableHead>
                <TableHead className="text-center">非カウント</TableHead>
                <TableHead className="text-center">承認率</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencyData.map((agency) => {
                const approvalRate = agency.combined.total > 0
                  ? Math.round((agency.combined.approved / agency.combined.total) * 100)
                  : 0;
                const descendantCount = countDescendants(agency.descendantTree);
                const hasDescendants = descendantCount > 0;
                const isExpanded = expandedRows.has(agency.org.id);

                return (
                  <>
                    <TableRow key={agency.org.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {hasDescendants ? (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => toggleExpand(agency.org.id)}>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          ) : (
                            <div className="w-6 shrink-0" />
                          )}
                          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          <span className="font-medium">{agency.org.name}</span>
                          <StatusBadge status={agency.org.status} />
                          {hasDescendants && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              +{descendantCount}社
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-lg font-bold">{agency.combined.total}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{agency.combined.approved}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{agency.combined.pending}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{agency.combined.rejected}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{agency.combined.cancelled}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">{agency.combined.excluded}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${approvalRate}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{approvalRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openAgencyDetail(agency)}>
                          <Eye className="w-3.5 h-3.5 mr-1" /> 詳細
                        </Button>
                      </TableCell>
                    </TableRow>

                    {hasDescendants && isExpanded && (
                      <>
                        <TableRow key={`${agency.org.id}_own`} className="bg-blue-50/30">
                          <TableCell>
                            <div className="flex items-center gap-2 pl-10">
                              <div className="w-5 shrink-0" />
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span className="text-sm text-blue-700 font-medium">{agency.org.name}（自社分）</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm font-semibold">{agency.own.total}</TableCell>
                          <TableCell className="text-center"><span className="text-xs text-emerald-600">{agency.own.approved}</span></TableCell>
                          <TableCell className="text-center"><span className="text-xs text-amber-600">{agency.own.pending}</span></TableCell>
                          <TableCell className="text-center"><span className="text-xs text-red-600">{agency.own.rejected}</span></TableCell>
                          <TableCell className="text-center"><span className="text-xs text-gray-500">{agency.own.cancelled}</span></TableCell>
                          <TableCell className="text-center"><span className="text-xs text-slate-500">{agency.own.excluded}</span></TableCell>
                          <TableCell />
                          <TableCell />
                        </TableRow>
                        {renderTreeRows(agency.descendantTree, true)}
                      </>
                    )}
                  </>
                );
              })}
              {agencyData.length === 0 && (
                <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    {monthLabel}のアポイントデータがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Agency Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {selectedAgency?.org.name} — {monthLabel}のアポイント一覧
            </DialogTitle>
          </DialogHeader>
          {selectedAgency && (
            <div>
              <div className="grid grid-cols-6 gap-2 mb-4">
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">合計（合算）</p>
                  <p className="text-lg font-bold">{selectedAgency.combined.total}</p>
                </div>
                <div className="text-center p-2 bg-emerald-50 rounded-md">
                  <p className="text-xs text-emerald-600">承認済</p>
                  <p className="text-lg font-bold text-emerald-700">{selectedAgency.combined.approved}</p>
                </div>
                <div className="text-center p-2 bg-amber-50 rounded-md">
                  <p className="text-xs text-amber-600">保留中</p>
                  <p className="text-lg font-bold text-amber-700">{selectedAgency.combined.pending}</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-md">
                  <p className="text-xs text-red-600">却下</p>
                  <p className="text-lg font-bold text-red-700">{selectedAgency.combined.rejected}</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-500">取消</p>
                  <p className="text-lg font-bold text-gray-600">{selectedAgency.combined.cancelled}</p>
                </div>
                <div className="text-center p-2 bg-slate-50 rounded-md">
                  <p className="text-xs text-slate-500">非カウント</p>
                  <p className="text-lg font-bold text-slate-600">{selectedAgency.combined.excluded}</p>
                </div>
              </div>

              {selectedAgency.descendantTree.length > 0 && (
                <DetailBreakdown agency={selectedAgency} />
              )}

              <DetailTabs agency={selectedAgency} orgs={orgs} onDetail={openApptDetail} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Appointment Detail Dialog */}
      <Dialog open={showApptDetail} onOpenChange={setShowApptDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>アポイント詳細</DialogTitle>
          </DialogHeader>
          {selectedAppt && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">対象企業</p>
                  <p className="font-medium">{selectedAppt.target_company_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">担当者</p>
                  <p className="font-medium">{selectedAppt.contact_person || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">案件</p>
                  <p className="font-medium">{(selectedAppt as any).project?.title || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">案件番号</p>
                  <p className="font-medium">{(selectedAppt as any).project?.project_number || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">登録企業</p>
                  <p className="font-medium">{(selectedAppt as any).organization?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">登録者</p>
                  <p className="font-medium">{(selectedAppt as any).creator?.full_name || (selectedAppt as any).creator?.login_id || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">商談日時</p>
                  <p className="font-medium">{format(new Date(selectedAppt.meeting_datetime), 'yyyy/MM/dd HH:mm')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ステータス</p>
                  <StatusBadge status={selectedAppt.status} />
                </div>
                <div>
                  <p className="text-muted-foreground">登録日</p>
                  <p className="font-medium">{format(new Date(selectedAppt.created_at), 'yyyy/MM/dd HH:mm')}</p>
                </div>
              </div>
              {selectedAppt.notes && (
                <div className="text-sm border-t pt-3">
                  <p className="text-muted-foreground mb-1">メモ</p>
                  <p className="whitespace-pre-wrap bg-muted/30 rounded-md p-3">{selectedAppt.notes}</p>
                </div>
              )}
              {selectedAppt.evidence_url && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">証跡URL</p>
                  <a href={selectedAppt.evidence_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                    {selectedAppt.evidence_url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {selectedAppt.rejected_reason && (
                <div className="text-sm border-t pt-3">
                  <p className="text-muted-foreground mb-1">却下/取消理由</p>
                  <p className="text-red-700 bg-red-50 rounded-md p-3">{selectedAppt.rejected_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailBreakdown({ agency }: { agency: AgencyMonthlyData }) {
  const flattenTree = (nodes: OrgTreeNode[]): { org: Organization; stats: OrgStats; depth: number }[] => {
    const result: { org: Organization; stats: OrgStats; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ org: node.org, stats: node.stats, depth: node.depth });
      result.push(...flattenTree(node.children));
    }
    return result;
  };

  const flatDescendants = flattenTree(agency.descendantTree);
  const tierLabels = ['', '二次代理店', '三次代理店', '四次代理店', '五次代理店'];
  const dotColors = ['', 'bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500'];

  return (
    <div className="mb-4 p-3 bg-muted/30 rounded-lg border">
      <p className="text-xs font-semibold text-muted-foreground mb-2">内訳</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="font-medium">{agency.org.name}（自社分）</span>
          </div>
          <span className="font-bold">{agency.own.total}件</span>
        </div>
        {flatDescendants.map(item => {
          const colorIdx = Math.min(item.depth, 4);
          return (
            <div key={item.org.id} className="flex items-center justify-between text-sm" style={{ paddingLeft: `${(item.depth - 1) * 12}px` }}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${dotColors[colorIdx]}`} />
                <span className="font-medium">{item.org.name}</span>
                <span className="text-xs text-muted-foreground">（{tierLabels[colorIdx] || `${item.depth + 1}次代理店`}）</span>
              </div>
              <span className="font-bold">{item.stats.total}件</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailTabs({ agency, orgs, onDetail }: { agency: AgencyMonthlyData; orgs: Organization[]; onDetail: (a: Appointment) => void }) {
  const flattenTree = (nodes: OrgTreeNode[]): { org: Organization; stats: OrgStats; depth: number }[] => {
    const result: { org: Organization; stats: OrgStats; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ org: node.org, stats: node.stats, depth: node.depth });
      result.push(...flattenTree(node.children));
    }
    return result;
  };

  const flatDescendants = flattenTree(agency.descendantTree);

  return (
    <Tabs defaultValue="all">
      <TabsList className="mb-3 flex-wrap h-auto gap-1">
        <TabsTrigger value="all">全て ({agency.combined.total})</TabsTrigger>
        <TabsTrigger value="own">{agency.org.name} ({agency.own.total})</TabsTrigger>
        {flatDescendants.map(item => (
          <TabsTrigger key={item.org.id} value={item.org.id}>
            {item.org.name} ({item.stats.total})
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="all">
        <AppointmentTable appointments={agency.combined.appointments} orgs={orgs} onDetail={onDetail} />
      </TabsContent>
      <TabsContent value="own">
        <AppointmentTable appointments={agency.own.appointments} orgs={orgs} onDetail={onDetail} />
      </TabsContent>
      {flatDescendants.map(item => (
        <TabsContent key={item.org.id} value={item.org.id}>
          <AppointmentTable appointments={item.stats.appointments} orgs={orgs} onDetail={onDetail} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function AppointmentTable({ appointments, orgs, onDetail }: { appointments: Appointment[]; orgs: Organization[]; onDetail: (a: Appointment) => void }) {
  const getOrgName = (orgId: string) => orgs.find(o => o.id === orgId)?.name || '—';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>対象企業</TableHead>
          <TableHead>案件</TableHead>
          <TableHead>登録企業</TableHead>
          <TableHead>登録者</TableHead>
          <TableHead>商談日時</TableHead>
          <TableHead>ステータス</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appt) => (
          <TableRow key={appt.id} className="hover:bg-muted/30">
            <TableCell className="font-medium">{appt.target_company_name}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {(appt as any).project?.title || '—'}
            </TableCell>
            <TableCell className="text-sm">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-muted">
                {(appt as any).organization?.name || getOrgName(appt.org_id)}
              </span>
            </TableCell>
            <TableCell className="text-sm">
              {(appt as any).creator?.full_name || (appt as any).creator?.login_id || '—'}
            </TableCell>
            <TableCell className="text-sm">
              {format(new Date(appt.meeting_datetime), 'MM/dd HH:mm')}
            </TableCell>
            <TableCell><StatusBadge status={appt.status} /></TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onDetail(appt)}>
                詳細
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {appointments.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              アポイントがありません
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
