import { useEffect, useState, useCallback } from 'react';
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
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

export default function PartnerAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

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

  const filtered = appointments.filter(a => tab === 'all' || a.status === tab);

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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">全て ({appointments.length})</TabsTrigger>
          <TabsTrigger value="pending">保留中 ({appointments.filter(a => a.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved">承認済 ({appointments.filter(a => a.status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="rejected">却下 ({appointments.filter(a => a.status === 'rejected').length})</TabsTrigger>
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
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">アポイントがありません</TableCell></TableRow>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
