import { useEffect, useState, useCallback } from 'react';
import { supabase, type Project, type Appointment } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, ClipboardCheck, Building2, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalAppointments: number;
  pendingAppointments: number;
  approvedAppointments: number;
  totalOrgs: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0, activeProjects: 0,
    totalAppointments: 0, pendingAppointments: 0, approvedAppointments: 0,
    totalOrgs: 0,
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentAppts, setRecentAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvedCounts, setApprovedCounts] = useState<Record<string, number>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projRes, apptRes, orgRes, pendingRes, approvedRes, recentRes] = await Promise.all([
        supabase.from('projects').select('*'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('appointments').select('*, project:projects(title, project_number), organization:organizations(name)').order('meeting_datetime', { ascending: false }).limit(5),
      ]);

      const projData = projRes.data || [];
      setProjects(projData);
      setRecentAppts(recentRes.data || []);

      // 各案件の承認済みアポ数を集計
      if (projData.length > 0) {
        const projectIds = projData.map(p => p.id);
        const { data: appts } = await supabase
          .from('appointments')
          .select('project_id')
          .in('project_id', projectIds)
          .eq('status', 'approved');
        const counts: Record<string, number> = {};
        (appts || []).forEach(a => {
          counts[a.project_id] = (counts[a.project_id] || 0) + 1;
        });
        setApprovedCounts(counts);
      }

      setStats({
        totalProjects: projRes.data?.length || 0,
        activeProjects: projRes.data?.filter(p => p.status === 'active').length || 0,
        totalAppointments: apptRes.count || 0,
        pendingAppointments: pendingRes.count || 0,
        approvedAppointments: approvedRes.count || 0,
        totalOrgs: orgRes.count || 0,
      });
    } catch (e) {
      console.error('Admin dashboard data fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statCards = [
    { label: '案件数', value: stats.totalProjects, sub: `有効: ${stats.activeProjects}`, icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
    { label: 'アポイント', value: stats.totalAppointments, sub: `承認済: ${stats.approvedAppointments}`, icon: ClipboardCheck, color: 'text-emerald-600 bg-emerald-50' },
    { label: '承認待ち', value: stats.pendingAppointments, sub: '要対応', icon: Clock, color: 'text-amber-600 bg-amber-50' },
    { label: '企業数', value: stats.totalOrgs, sub: '登録済み', icon: Building2, color: 'text-violet-600 bg-violet-50' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="ダッシュボード" description="案件とアポイントの概況" />

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project summary */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">案件別サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">案件がまだありません</p>
            ) : (
              <div className="space-y-3">
                {projects.map((p) => {
                  const isUnlimited = p.is_unlimited;
                  const confirmed = approvedCounts[p.id] || 0;
                  const remaining = isUnlimited ? null : p.max_appointments_total - confirmed;
                  const pct = !isUnlimited && p.max_appointments_total > 0 ? (confirmed / p.max_appointments_total) * 100 : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {!isUnlimited ? (
                            <>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {confirmed}/{p.max_appointments_total}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">確定: {confirmed}（無制限）</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{isUnlimited ? '' : `残${remaining}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent appointments */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">直近のアポイント（商談日時順）</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAppts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">アポイントがまだありません</p>
            ) : (
              <div className="space-y-3">
                {recentAppts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.target_company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(a as any).project?.project_number ? `[${(a as any).project.project_number}] ` : ''}{(a as any).project?.title} · {(a as any).organization?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        商談: {format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm')}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      a.status === 'pending' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                      a.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                      a.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                      'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                      {a.status === 'pending' ? '保留中' : a.status === 'approved' ? '承認済' : a.status === 'rejected' ? '却下' : '取消'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
