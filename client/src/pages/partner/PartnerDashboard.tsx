import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation, type Appointment } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, ClipboardCheck, Clock, TrendingUp } from 'lucide-react';

export default function PartnerDashboard() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvedCounts, setApprovedCounts] = useState<Record<string, number>>({});

  // Stabilize dependency: use primitive values instead of user object
  const userId = user?.id;
  const userOrgId = user?.org_id;
  const userRole = user?.role;

  const fetchData = useCallback(async () => {
    if (!userId || !userOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 自分の組織情報を取得
      const { data: myOrg } = await supabase
        .from('organizations')
        .select('id, parent_org_id')
        .eq('id', userOrgId)
        .single();

      // 1. 自分の組織に直接割り当てられた案件
      const { data: directAllocs } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('child_org_id', userOrgId)
        .eq('status', 'active');
      const directAllocations = directAllocs || [];

      let allAllocs = [...directAllocations];

      // 2. 祖先チェーンを再帰的にたどり、アロケーションを継承する
      const directProjectIds = new Set(directAllocations.map(a => a.project_id));
      const collectedProjectIds = new Set(directProjectIds);

      if (myOrg?.parent_org_id) {
        const ancestorOrgIds: string[] = [];
        let currentParentId: string | null = myOrg.parent_org_id;
        const maxDepth = 10;
        let depth = 0;
        while (currentParentId && depth < maxDepth) {
          const { data: ancestorOrg } = await supabase
            .from('organizations')
            .select('id, parent_org_id')
            .eq('id', currentParentId)
            .single();
          if (!ancestorOrg) break;
          if (ancestorOrg.parent_org_id) {
            ancestorOrgIds.push(ancestorOrg.id);
          }
          currentParentId = ancestorOrg.parent_org_id;
          depth++;
        }

        for (const ancestorId of ancestorOrgIds) {
          const { data: ancestorAllocData } = await supabase
            .from('allocations')
            .select('*, project:projects(*)')
            .eq('child_org_id', ancestorId)
            .eq('status', 'active');

          const newAllocations = (ancestorAllocData || []).filter(
            a => !collectedProjectIds.has(a.project_id)
          );
          allAllocs = [...allAllocs, ...newAllocations];
          newAllocations.forEach(a => collectedProjectIds.add(a.project_id));
        }
      }

      const { data: apptData } = await supabase
        .from('appointments')
        .select('*')
        .eq('org_id', userOrgId)
        .order('meeting_datetime', { ascending: false });

      setAllocations(allAllocs);
      setAppointments(apptData || []);

      // 各案件の承認済みアポ数を集計
      const projectIds = Array.from(new Set(allAllocs.map((a: Allocation) => a.project_id).filter(Boolean)));
      if (projectIds.length > 0) {
        const { data: approvedAppts } = await supabase
          .from('appointments')
          .select('project_id')
          .in('project_id', projectIds)
          .eq('status', 'approved');
        const counts: Record<string, number> = {};
        (approvedAppts || []).forEach((a: any) => {
          counts[a.project_id] = (counts[a.project_id] || 0) + 1;
        });
        setApprovedCounts(counts);
      }
    } catch (e) {
      console.error('Dashboard data fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, userOrgId, userRole]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingCount = appointments.filter(a => a.status === 'pending').length;
  const approvedCount = appointments.filter(a => a.status === 'approved').length;
  // 「終了」案件を除いた有効な割り当て数
  const activeAllocations = allocations.filter(a => {
    const proj = (a as any).project;
    return proj?.status !== 'closed';
  });

  const statCards = [
    { label: '割り当て案件', value: activeAllocations.length, sub: '有効な案件数', icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
    { label: '承認済アポ', value: approvedCount, sub: '自社獲得分', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
    { label: '承認待ち', value: pendingCount, sub: '確認中', icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: '合計登録数', value: appointments.length, sub: '全ステータス', icon: ClipboardCheck, color: 'text-violet-600 bg-violet-50' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="ダッシュボード" description="自社の案件進捗とアポイント状況" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <Card key={s.label} className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">{s.label}</p>
                  <p className="text-3xl font-bold mt-1 tracking-tight">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </div>
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Allocation progress */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">案件別進捗</CardTitle>
        </CardHeader>
        <CardContent>
          {activeAllocations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">割り当てられた案件がありません</p>
          ) : (
            <div className="space-y-4">
              {activeAllocations.map((a) => {
                const proj = (a as any).project;
                const isUnlimited = proj?.is_unlimited;
                const maxTotal = proj?.max_appointments_total || 0;
                const confirmed = proj ? (approvedCounts[proj.id] || 0) : 0;
                const pct = !isUnlimited && maxTotal > 0 ? (confirmed / maxTotal) * 100 : 0;
                const myAppts = appointments.filter(ap => ap.project_id === a.project_id);
                const myApproved = myAppts.filter(ap => ap.status === 'approved').length;
                const myPending = myAppts.filter(ap => ap.status === 'pending').length;
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{proj?.title || '案件'}</p>
                      <span className="text-xs text-muted-foreground">
                        {isUnlimited ? `確定: ${confirmed}（無制限）` : `${confirmed}/${maxTotal}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        自社: 承認{myApproved}件 / 待ち{myPending}件
                      </span>
                    </div>
                    {!isUnlimited && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
