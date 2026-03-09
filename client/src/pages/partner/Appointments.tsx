import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Appointment } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'wouter';
import { Plus, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';

export default function PartnerAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [requestingApproval, setRequestingApproval] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());

  const fetchAppointments = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('appointments')
        .select('*, project:projects(title)')
        .eq('org_id', user.org_id)
        .order('created_at', { ascending: false });
      setAppointments(data || []);
    } catch (e) {
      console.error('Appointments fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const getPartnerOrgName = useCallback(async (): Promise<string> => {
    if (!user?.org_id) return user?.full_name || 'パートナー';
    try {
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', user.org_id)
        .single();
      return data?.name || user?.full_name || 'パートナー';
    } catch {
      return user?.full_name || 'パートナー';
    }
  }, [user]);

  const handleRequestApproval = async (appt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    if (requestingApproval) return;

    setRequestingApproval(appt.id);
    try {
      const partnerName = await getPartnerOrgName();
      const projectTitle = (appt as any).project?.title || '案件';

      const response = await fetch('/api/email/approval-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerName,
          projectTitle,
          targetCompany: appt.target_company_name,
          contactPerson: appt.contact_person,
          meetingDatetime: appt.meeting_datetime,
          appointmentId: appt.id,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success('承認要求メールを送信しました');
      } else {
        toast.error('メール送信に失敗しました: ' + (result.error || '不明なエラー'));
      }
    } catch (error) {
      console.error('Approval request error:', error);
      toast.error('承認要求の送信に失敗しました');
    } finally {
      setRequestingApproval(null);
    }
  };

  // 月別フィルター: 商談日時(meeting_datetime)を基準に絞り込み
  const monthFiltered = useMemo(() => {
    return appointments.filter(a => {
      const meetingDate = new Date(a.meeting_datetime);
      return isSameMonth(meetingDate, selectedMonth);
    });
  }, [appointments, selectedMonth]);

  // ステータスフィルター: 月別フィルター後に適用
  const filtered = useMemo(() => {
    return monthFiltered.filter(a => tab === 'all' || a.status === tab);
  }, [monthFiltered, tab]);

  // 月別のステータス別件数
  const statusCounts = useMemo(() => ({
    all: monthFiltered.length,
    pending: monthFiltered.filter(a => a.status === 'pending').length,
    approved: monthFiltered.filter(a => a.status === 'approved').length,
    rejected: monthFiltered.filter(a => a.status === 'rejected').length,
  }), [monthFiltered]);

  const goToPrevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const goToCurrentMonth = () => setSelectedMonth(new Date());

  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const openDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowDetail(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="アポイント一覧"
        description="自社が登録したアポイントの一覧"
        action={
          <Link href="/appointments/new">
            <Button><Plus className="w-4 h-4 mr-2" />アポ登録</Button>
          </Link>
        }
      />

      {/* 月選択UI */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[140px] text-center">
            {format(selectedMonth, 'yyyy年M月', { locale: ja })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="text-xs ml-2" onClick={goToCurrentMonth}>
              今月に戻る
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {format(selectedMonth, 'M月', { locale: ja })}のアポ: <span className="font-semibold text-foreground">{statusCounts.all}件</span>
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">全て ({statusCounts.all})</TabsTrigger>
          <TabsTrigger value="pending">保留中 ({statusCounts.pending})</TabsTrigger>
          <TabsTrigger value="approved">承認済 ({statusCounts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">却下 ({statusCounts.rejected})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>先方企業名</TableHead>
                    <TableHead>案件</TableHead>
                    <TableHead>先方担当者名</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>登録日</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(a)}>
                      <TableCell className="font-medium">{a.target_company_name}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).project?.title}</TableCell>
                      <TableCell>{a.contact_person || '—'}</TableCell>
                      <TableCell className="text-sm">{format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm')}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(a.created_at), 'MM/dd HH:mm')}</TableCell>
                      <TableCell>
                        {a.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={requestingApproval === a.id}
                            onClick={(e) => handleRequestApproval(a, e)}
                          >
                            <Send className="w-3 h-3" />
                            {requestingApproval === a.id ? '送信中...' : '承認再要求'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {format(selectedMonth, 'yyyy年M月', { locale: ja })}のアポイントがありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>アポイント詳細</DialogTitle>
          </DialogHeader>
          {selectedAppt && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">先方企業名</p>
                  <p className="font-medium">{selectedAppt.target_company_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">先方担当者名</p>
                  <p className="font-medium">{selectedAppt.contact_person || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">案件</p>
                  <p className="font-medium">{(selectedAppt as any).project?.title}</p>
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
                <div className="text-sm">
                  <p className="text-muted-foreground">メモ</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedAppt.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">獲得日</p>
                  <p className="font-medium">{(selectedAppt as any).acquisition_date || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">獲得者名</p>
                  <p className="font-medium">{(selectedAppt as any).acquirer_name || '—'}</p>
                </div>
              </div>
              {selectedAppt.rejected_reason && (
                <div className="text-sm">
                  <p className="text-muted-foreground">却下/取消理由</p>
                  <p className="mt-1 text-red-700">{selectedAppt.rejected_reason}</p>
                </div>
              )}
              {selectedAppt.status === 'pending' && (
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={requestingApproval === selectedAppt.id}
                    onClick={(e) => handleRequestApproval(selectedAppt, e)}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {requestingApproval === selectedAppt.id ? '送信中...' : '承認再要求メールを送信'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
