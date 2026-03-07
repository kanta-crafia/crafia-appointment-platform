import { useEffect, useState, useCallback } from 'react';
import { supabase, type Appointment } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Approvals() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('appointments')
        .select('*, project:projects(title), organization:organizations(name), creator:users!appointments_created_by_user_id_fkey(full_name, email)')
        .order('created_at', { ascending: false });
      setAppointments(data || []);
    } catch (e) {
      console.error('Approvals fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  const filtered = appointments.filter(a => {
    if (tab === 'all') return true;
    return a.status === tab;
  });

  const handleApprove = async (appt: Appointment) => {
    setProcessing(true);
    const { error } = await supabase.rpc('approve_appointment', {
      p_appointment_id: appt.id,
      p_approver_id: user?.id,
    });
    setProcessing(false);
    if (error) {
      toast.error('承認に失敗しました', { description: error.message });
    } else {
      toast.success('アポイントを承認しました');
      setShowDetail(false);
      fetchAppointments();
    }
  };

  const handleReject = async (appt: Appointment) => {
    if (!reason.trim()) { toast.error('却下理由を入力してください'); return; }
    setProcessing(true);
    const { error } = await supabase.rpc('reject_appointment', {
      p_appointment_id: appt.id,
      p_approver_id: user?.id,
      p_reason: reason,
    });
    setProcessing(false);
    if (error) {
      toast.error('却下に失敗しました', { description: error.message });
    } else {
      toast.success('アポイントを却下しました');
      setShowDetail(false);
      fetchAppointments();
    }
  };

  const handleCancel = async (appt: Appointment) => {
    if (!reason.trim()) { toast.error('取消理由を入力してください'); return; }
    setProcessing(true);
    const { error } = await supabase.rpc('cancel_appointment', {
      p_appointment_id: appt.id,
      p_reason: reason,
    });
    setProcessing(false);
    if (error) {
      toast.error('取消に失敗しました', { description: error.message });
    } else {
      toast.success('アポイントを取消しました');
      setShowDetail(false);
      fetchAppointments();
    }
  };

  const openDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setReason('');
    setShowDetail(true);
  };

  const pendingCount = appointments.filter(a => a.status === 'pending').length;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="アポイント承認" description="アポイントの確認・承認・却下・取消" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            保留中 {pendingCount > 0 && <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">承認済</TabsTrigger>
          <TabsTrigger value="rejected">却下</TabsTrigger>
          <TabsTrigger value="cancelled">取消</TabsTrigger>
          <TabsTrigger value="all">全て</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>先方企業名</TableHead>
                    <TableHead>案件</TableHead>
                    <TableHead>登録企業</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>登録日</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(a)}>
                      <TableCell className="font-medium">{a.target_company_name}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).project?.title}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).organization?.name}</TableCell>
                      <TableCell className="text-sm">{format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm')}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(a.created_at), 'MM/dd HH:mm')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(a); }}>
                          詳細
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">該当するアポイントがありません</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
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
                  <p className="text-muted-foreground">登録企業</p>
                  <p className="font-medium">{(selectedAppt as any).organization?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">商談日時</p>
                  <p className="font-medium">{format(new Date(selectedAppt.meeting_datetime), 'yyyy/MM/dd HH:mm')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">ステータス</p>
                  <StatusBadge status={selectedAppt.status} />
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

              {(selectedAppt.status === 'pending' || selectedAppt.status === 'approved') && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>理由（却下/取消時は必須）</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由を入力..." rows={2} />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2">
            {selectedAppt?.status === 'pending' && (
              <>
                <Button variant="outline" onClick={() => handleReject(selectedAppt)} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1" /> 却下
                </Button>
                <Button onClick={() => handleApprove(selectedAppt)} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-1" /> 承認
                </Button>
              </>
            )}
            {selectedAppt?.status === 'approved' && (
              <Button variant="outline" onClick={() => handleCancel(selectedAppt)} disabled={processing} className="text-gray-600">
                <Ban className="w-4 h-4 mr-1" /> 取消
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
