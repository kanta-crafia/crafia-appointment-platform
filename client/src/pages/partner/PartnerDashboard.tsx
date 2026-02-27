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

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [allocRes, apptRes] = await Promise.all([
      supabase.from('allocations').select('*, project:projects(title, status)').eq('child_org_id', user.org_id).eq('status', 'active'),
      supabase.from('appointments').select('*').eq('org_id', user.org_id),
    ]);
    setAllocations(allocRes.data || []);
    setAppointments(apptRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingCount = appointments.filter(a => a.status === 'pending').length;
  const approvedCount = appointments.filter(a => a.status === 'approved').length;
  const totalAllocMax = allocations.reduce((sum, a) => sum + a.max_appointments_for_child, 0);
  const totalConfirmed = allocations.reduce((sum, a) => sum + a.confirmed_count, 0);

  const statCards = [
    { label: '割り当て案件', value: allocations.length, sub: '有効な案件数', icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
    { label: '承認済アポ', value: approvedCount, sub: `上限: ${totalAllocMax}`, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
    { label: '承認待ち', value: pendingCount, sub: '確認中', icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: '残りアポ枠', value: totalAllocMax - totalConfirmed, sub: `確定: ${totalConfirmed}`, icon: ClipboardCheck, color: 'text-violet-600 bg-violet-50' },
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
          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">割り当てられた案件がありません</p>
          ) : (
            <div className="space-y-4">
              {allocations.map((a) => {
                const remaining = a.max_appointments_for_child - a.confirmed_count;
                const pct = a.max_appointments_for_child > 0 ? (a.confirmed_count / a.max_appointments_for_child) * 100 : 0;
                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{(a as any).project?.title || '案件'}</p>
                      <span className="text-xs text-muted-foreground">
                        {a.confirmed_count}/{a.max_appointments_for_child} (残{remaining})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">単価: ¥{Number(a.payout_per_appointment).toLocaleString()}/アポ</p>
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
