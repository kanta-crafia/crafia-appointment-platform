import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Appointment, type Organization } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, ChevronLeft, ChevronRight, ExternalLink, Eye } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { ja } from 'date-fns/locale';

interface AgencyMonthlyData {
  org: Organization;
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  cancelled: number;
  appointments: Appointment[];
}

export default function AgencyStats() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedAgency, setSelectedAgency] = useState<AgencyMonthlyData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showApptDetail, setShowApptDetail] = useState(false);
  const [filterOrg, setFilterOrg] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = format(currentMonth, 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      const [orgRes, apptRes] = await Promise.all([
        supabase.from('organizations').select('*').order('name'),
        supabase
          .from('appointments')
          .select('*, project:projects(title, project_number, company_name, unit_price), organization:organizations(name), creator:users!appointments_created_by_user_id_fkey(full_name, login_id)')
          .gte('meeting_datetime', monthStart + 'T00:00:00')
          .lte('meeting_datetime', monthEnd + 'T23:59:59')
          .order('meeting_datetime', { ascending: false }),
      ]);

      setOrgs(orgRes.data || []);
      setAppointments(apptRes.data || []);
    } catch (e) {
      console.error('AgencyStats fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const agencyData = useMemo(() => {
    const result: AgencyMonthlyData[] = [];
    const targetOrgs = filterOrg === 'all' ? orgs : orgs.filter(o => o.id === filterOrg);

    for (const org of targetOrgs) {
      const orgAppts = appointments.filter(a => a.org_id === org.id);
      if (orgAppts.length === 0 && filterOrg === 'all') continue; // Show only orgs with data when showing all
      result.push({
        org,
        total: orgAppts.length,
        approved: orgAppts.filter(a => a.status === 'approved').length,
        pending: orgAppts.filter(a => a.status === 'pending').length,
        rejected: orgAppts.filter(a => a.status === 'rejected').length,
        cancelled: orgAppts.filter(a => a.status === 'cancelled').length,
        appointments: orgAppts,
      });
    }

    // Sort by total descending
    result.sort((a, b) => b.total - a.total);
    return result;
  }, [orgs, appointments, filterOrg]);

  const totalStats = useMemo(() => ({
    total: appointments.length,
    approved: appointments.filter(a => a.status === 'approved').length,
    pending: appointments.filter(a => a.status === 'pending').length,
    rejected: appointments.filter(a => a.status === 'rejected').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  }), [appointments]);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const monthLabel = format(currentMonth, 'yyyy年M月', { locale: ja });

  const openAgencyDetail = (agency: AgencyMonthlyData) => {
    setSelectedAgency(agency);
    setShowDetail(true);
  };

  const openApptDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowApptDetail(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="代理店別アポ集計" description="商談日時ベースで代理店ごとの月次アポイント状況を確認" />

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
          <span className="text-sm text-muted-foreground">企業フィルタ:</span>
          <Select value={filterOrg} onValueChange={setFilterOrg}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="全企業" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全企業</SelectItem>
              {orgs.map(o => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Card className="border shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">合計</p>
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
      </div>

      {/* Agency table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            代理店別集計（{monthLabel}）
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
                <TableHead className="text-center">承認率</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencyData.map((agency) => {
                const approvalRate = agency.total > 0
                  ? Math.round((agency.approved / agency.total) * 100)
                  : 0;
                return (
                  <TableRow key={agency.org.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <span className="font-medium">{agency.org.name}</span>
                        <StatusBadge status={agency.org.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-lg font-bold">{agency.total}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{agency.approved}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{agency.pending}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{agency.rejected}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{agency.cancelled}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${approvalRate}%` }}
                          />
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
                );
              })}
              {agencyData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              {selectedAgency?.org.name} — {monthLabel}のアポイント一覧
            </DialogTitle>
          </DialogHeader>
          {selectedAgency && (
            <div>
              {/* Mini stats */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                <div className="text-center p-2 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground">合計</p>
                  <p className="text-lg font-bold">{selectedAgency.total}</p>
                </div>
                <div className="text-center p-2 bg-emerald-50 rounded-md">
                  <p className="text-xs text-emerald-600">承認済</p>
                  <p className="text-lg font-bold text-emerald-700">{selectedAgency.approved}</p>
                </div>
                <div className="text-center p-2 bg-amber-50 rounded-md">
                  <p className="text-xs text-amber-600">保留中</p>
                  <p className="text-lg font-bold text-amber-700">{selectedAgency.pending}</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-md">
                  <p className="text-xs text-red-600">却下</p>
                  <p className="text-lg font-bold text-red-700">{selectedAgency.rejected}</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-500">取消</p>
                  <p className="text-lg font-bold text-gray-600">{selectedAgency.cancelled}</p>
                </div>
              </div>

              {/* Appointments table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>対象企業</TableHead>
                    <TableHead>案件</TableHead>
                    <TableHead>登録者</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedAgency.appointments.map((appt) => (
                    <TableRow key={appt.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{appt.target_company_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(appt as any).project?.title || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(appt as any).creator?.full_name || (appt as any).creator?.login_id || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(appt.meeting_datetime), 'MM/dd HH:mm')}
                      </TableCell>
                      <TableCell><StatusBadge status={appt.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openApptDetail(appt)}>
                          詳細
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {selectedAgency.appointments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        アポイントがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
                {(selectedAppt as any).project?.unit_price && (
                  <div>
                    <p className="text-muted-foreground">案件単価</p>
                    <p className="font-medium">¥{Number((selectedAppt as any).project.unit_price).toLocaleString()}</p>
                  </div>
                )}
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
