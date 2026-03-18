import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, type Appointment } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Link } from 'wouter';
import { Plus, Send, ChevronLeft, ChevronRight, Pencil, Trash2, Download } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format, addMonths, subMonths, isSameMonth } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toast } from 'sonner';

// UTCのtimestamp文字列をdatetime-local用のローカル形式に変換
function toLocalDatetimeString(utcString: string): string {
  const d = new Date(utcString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function PartnerAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Stabilize dependency: use primitive values instead of user object
  const userId = user?.id;
  const userOrgId = user?.org_id;
  const [tab, setTab] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [requestingApproval, setRequestingApproval] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());

  // 編集用state
  const [showEdit, setShowEdit] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [editTargetCompany, setEditTargetCompany] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editMeetingDatetime, setEditMeetingDatetime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAcquisitionDate, setEditAcquisitionDate] = useState('');
  const [editAcquirerName, setEditAcquirerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [childOrgNames, setChildOrgNames] = useState<Record<string, string>>({});

  const fetchAppointments = useCallback(async () => {
    if (!userId || !userOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 自組織の子組織（二次代理店）を取得
      const { data: childOrgs } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('parent_org_id', userOrgId);

      const childOrgIds = (childOrgs || []).map(o => o.id);
      const orgNameMap: Record<string, string> = {};
      (childOrgs || []).forEach(o => { orgNameMap[o.id] = o.name; });
      setChildOrgNames(orgNameMap);

      // 自組織 + 子組織のアポを取得
      const allOrgIds = [userOrgId, ...childOrgIds];
      const { data } = await supabase
        .from('appointments')
        .select('*, project:projects(title, project_number), organization:organizations(name)')
        .in('org_id', allOrgIds)
        .order('created_at', { ascending: false });
      setAppointments(data || []);
    } catch (e) {
      console.error('Appointments fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, userOrgId]);

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

  // 編集ダイアログを開く
  const openEditDialog = (appt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditAppt(appt);
    setEditTargetCompany(appt.target_company_name);
    setEditContactPerson(appt.contact_person || '');
    setEditMeetingDatetime(toLocalDatetimeString(appt.meeting_datetime));
    setEditNotes(appt.notes || '');
    setEditAcquisitionDate((appt as any).acquisition_date || '');
    setEditAcquirerName((appt as any).acquirer_name || '');
    setShowEdit(true);
  };

  // 編集を保存
  const handleSaveEdit = async () => {
    if (!editAppt) return;
    if (!editTargetCompany || !editContactPerson || !editMeetingDatetime) {
      toast.error('必須項目を入力してください');
      return;
    }

    setSaving(true);
    try {
      // 変更内容を検出
      const changes: string[] = [];
      if (editTargetCompany !== editAppt.target_company_name) changes.push(`先方企業名: ${editAppt.target_company_name} → ${editTargetCompany}`);
      if (editContactPerson !== (editAppt.contact_person || '')) changes.push(`先方担当者名: ${editAppt.contact_person || '—'} → ${editContactPerson}`);
      const origLocal = toLocalDatetimeString(editAppt.meeting_datetime);
      if (editMeetingDatetime !== origLocal) changes.push(`商談日時: ${format(new Date(editAppt.meeting_datetime), 'yyyy/MM/dd HH:mm')} → ${format(new Date(editMeetingDatetime), 'yyyy/MM/dd HH:mm')}`);
      if (editNotes !== (editAppt.notes || '')) changes.push('メモを変更');
      if (editAcquisitionDate !== ((editAppt as any).acquisition_date || '')) changes.push(`獲得日を変更`);
      if (editAcquirerName !== ((editAppt as any).acquirer_name || '')) changes.push(`獲得者名: ${(editAppt as any).acquirer_name || '—'} → ${editAcquirerName}`);

      if (changes.length === 0) {
        toast.info('変更はありません');
        setSaving(false);
        return;
      }

      // datetime-localの値をISO文字列に変換（TZ考慮）
      const meetingDateISO = new Date(editMeetingDatetime).toISOString();

      // キャンセル済みアポの場合、ステータスを保留中に戻す
      const updateData: any = {
        target_company_name: editTargetCompany,
        contact_person: editContactPerson,
        meeting_datetime: meetingDateISO,
        notes: editNotes || null,
        acquisition_date: editAcquisitionDate || null,
        acquirer_name: editAcquirerName || null,
      };
      if (editAppt.status === 'cancelled') {
        updateData.status = 'pending';
        changes.push('ステータスを保留中に戻しました（再承認が必要です）');
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', editAppt.id);

      if (error) {
        toast.error('更新に失敗しました', { description: error.message });
        return;
      }

      // メール通知を送信
      try {
        const partnerName = await getPartnerOrgName();
        const projectTitle = (editAppt as any).project?.title || '案件';
        await fetch('/api/email/appointment-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerName,
            projectTitle,
            targetCompany: editTargetCompany,
            contactPerson: editContactPerson,
            meetingDatetime: meetingDateISO,
            notes: editNotes,
            acquisitionDate: editAcquisitionDate,
            acquirerName: editAcquirerName,
            appointmentId: editAppt.id,
            changes: changes.join('、'),
          }),
        });
      } catch (emailErr) {
        console.warn('Edit notification email failed:', emailErr);
      }

      toast.success('アポイントを更新しました');
      setShowEdit(false);
      setShowDetail(false);
      await fetchAppointments();
    } catch (e) {
      console.error('Edit error:', e);
      toast.error('更新中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  // アポイントを削除
  const handleDeleteAppt = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!editAppt) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', editAppt.id);

      if (error) {
        toast.error('削除に失敗しました', { description: error.message });
        return;
      }

      toast.success('アポイントを削除しました');
      setShowDeleteConfirm(false);
      setShowEdit(false);
      setShowDetail(false);
      await fetchAppointments();
    } catch (e) {
      console.error('Delete error:', e);
      toast.error('削除中にエラーが発生しました');
    } finally {
      setDeleting(false);
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
    cancelled: monthFiltered.filter(a => a.status === 'cancelled').length,
  }), [monthFiltered]);

  const goToPrevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const goToCurrentMonth = () => setSelectedMonth(new Date());

  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  const openDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setShowDetail(true);
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return '保留中';
      case 'approved': return '承認済';
      case 'rejected': return '却下';
      case 'cancelled': return '取消';
      default: return s;
    }
  };

  const handleCsvDownload = () => {
    const headers = ['案件番号', '案件名', '先方企業名', '先方担当者名', '獲得者名', '商談日時', 'ステータス', 'メモ', '登録日'];
    const rows = filtered.map(a => [
      (a as any).project?.project_number || '',
      (a as any).project?.title || '',
      a.target_company_name,
      a.contact_person || '',
      (a as any).acquirer_name || '',
      format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm'),
      statusLabel(a.status),
      (a.notes || '').replace(/\n/g, ' '),
      format(new Date(a.created_at), 'yyyy/MM/dd HH:mm'),
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const monthStr = format(selectedMonth, 'yyyyMM');
    a.download = `アポイント一覧_${monthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
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
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {format(selectedMonth, 'M月', { locale: ja })}のアポ: <span className="font-semibold text-foreground">{statusCounts.all}件</span>
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCsvDownload} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" />
            CSV
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">全て ({statusCounts.all})</TabsTrigger>
          <TabsTrigger value="pending">保留中 ({statusCounts.pending})</TabsTrigger>
          <TabsTrigger value="approved">承認済 ({statusCounts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">却下 ({statusCounts.rejected})</TabsTrigger>
          <TabsTrigger value="cancelled">取消 ({statusCounts.cancelled})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>案件</TableHead>
                    <TableHead>先方企業名</TableHead>
                    <TableHead>先方担当者名</TableHead>
                    <TableHead>獲得者名</TableHead>
                    <TableHead>登録企業</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>登録日</TableHead>
                    <TableHead className="w-[140px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(a)}>
                      <TableCell className="font-medium">{(a as any).project?.project_number ? `[${(a as any).project.project_number}] ` : ''}{(a as any).project?.title || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{a.target_company_name}</TableCell>
                      <TableCell>{a.contact_person || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).acquirer_name || '—'}</TableCell>
                      <TableCell>
                        {a.org_id !== user?.org_id ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                            {(a as any).organization?.name || childOrgNames[a.org_id] || '二次代理店'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">自社</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm')}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(a.created_at), 'MM/dd HH:mm')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {a.status === 'pending' && a.org_id === user?.org_id && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={(e) => openEditDialog(a, e)}
                              >
                                <Pencil className="w-3 h-3" />
                                編集
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                disabled={requestingApproval === a.id}
                                onClick={(e) => handleRequestApproval(a, e)}
                              >
                                <Send className="w-3 h-3" />
                                {requestingApproval === a.id ? '送信中' : '再要求'}
                              </Button>
                            </>
                          )}
                          {a.status === 'approved' && user?.org_id === 'crafia' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => openEditDialog(a, e)}
                            >
                              <Pencil className="w-3 h-3" />
                              編集
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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

      {/* 詳細ダイアログ */}
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
                <div className="pt-2 border-t flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => openEditDialog(selectedAppt, e)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    編集
                  </Button>
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
              {selectedAppt.status === 'approved' && user?.org_id === 'crafia' && (
                <div className="pt-2 border-t flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => openEditDialog(selectedAppt, e)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    編集
                  </Button>
                </div>
              )}
              {selectedAppt.status === 'cancelled' && (
                <div className="pt-2 border-t flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => openEditDialog(selectedAppt, e)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    日程修正して再承認を申請
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>アポイント編集</DialogTitle>
          </DialogHeader>
          {editAppt && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>先方企業名 <span className="text-destructive">*</span></Label>
                <Input value={editTargetCompany} onChange={(e) => setEditTargetCompany(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>先方担当者名 <span className="text-destructive">*</span></Label>
                <Input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>商談日時 <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={editMeetingDatetime} onChange={(e) => setEditMeetingDatetime(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>獲得日</Label>
                  <Input type="date" value={editAcquisitionDate} onChange={(e) => setEditAcquisitionDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>獲得者名</Label>
                  <Input value={editAcquirerName} onChange={(e) => setEditAcquirerName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>メモ</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving || deleting}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              削除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving || deleting}>キャンセル</Button>
              <Button onClick={handleSaveEdit} disabled={saving || deleting}>
                {saving ? '保存中...' : '保存する'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アポイントを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {editAppt && (
                <>
                  「{editAppt.target_company_name}」のアポイントを削除します。この操作は取り消せません。
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAppt}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
