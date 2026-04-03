import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { CheckCircle, XCircle, Ban, Pencil, Download, AlertTriangle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, addMonths, subMonths, isSameMonth, isToday, isTomorrow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { getChannelLabel, getCompanyTypeLabel } from '@/lib/channelLabels';

export default function Approvals() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [showDetail, setShowDetail] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [editTargetCompany, setEditTargetCompany] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editMeetingDatetime, setEditMeetingDatetime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('appointments')
        .select('*, project:projects(title, project_number, is_count_excluded), organization:organizations(name), creator:users!appointments_created_by_user_id_fkey(full_name, email)')
        .order('meeting_datetime', { ascending: false });
      setAppointments(data || []);
    } catch (e) {
      console.error('Approvals fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // 月別フィルター: 商談日時(meeting_datetime)を基準に絞り込み
  const monthFiltered = useMemo(() => {
    return appointments.filter(a => {
      const meetingDate = new Date(a.meeting_datetime);
      return isSameMonth(meetingDate, selectedMonth);
    });
  }, [appointments, selectedMonth]);

  // ステータスフィルター: 月別フィルター後に適用
  const filtered = useMemo(() => {
    if (tab === 'all') return monthFiltered;
    if (tab === 'excluded') return monthFiltered.filter(a => (a as any).project?.is_count_excluded === true);
    return monthFiltered.filter(a => a.status === tab);
  }, [monthFiltered, tab]);

  // 月別のステータス別件数（非カウント案件を除外）
  const countable = useMemo(() => monthFiltered.filter(a => !(a as any).project?.is_count_excluded), [monthFiltered]);
  const excludedCount = useMemo(() => monthFiltered.filter(a => (a as any).project?.is_count_excluded === true).length, [monthFiltered]);
  const statusCounts = useMemo(() => ({
    all: monthFiltered.length,
    pending: countable.filter(a => a.status === 'pending').length,
    approved: countable.filter(a => a.status === 'approved').length,
    rejected: countable.filter(a => a.status === 'rejected').length,
    cancelled: countable.filter(a => a.status === 'cancelled').length,
    excluded: excludedCount,
  }), [monthFiltered, countable, excludedCount]);

  const goToPrevMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const goToCurrentMonth = () => setSelectedMonth(new Date());
  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

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
    const headers = [
      '案件番号', '案件名', '先方企業名', '先方担当者名',
      '登録企業', '獲得日', '獲得者名', '獲得時の名乗り会社', '獲得チャネル',
      '商談日時', 'ステータス',
      '承認日時', '却下理由',
      'メモ', '登録日',
    ];
    const rows = filtered.map(a => [
      (a as any).project?.project_number || '',
      (a as any).project?.title || '',
      a.target_company_name,
      a.contact_person || '',
      (a as any).organization?.name || '',
      a.acquisition_date || '',
      a.acquirer_name || '',
      getCompanyTypeLabel((a as any).acquisition_company_type),
      getChannelLabel((a as any).acquisition_channel, (a as any).acquisition_channel_note),
      format(new Date(a.meeting_datetime), 'yyyy/MM/dd HH:mm'),
      statusLabel(a.status),
      a.approved_at ? format(new Date(a.approved_at), 'yyyy/MM/dd HH:mm') : '',
      a.rejected_reason || '',
      (a.notes || '').replace(/\n/g, ' '),
      format(new Date(a.created_at), 'yyyy/MM/dd HH:mm'),
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const monthStr = format(selectedMonth, 'yyyyMM');
    const tabLabel = tab === 'all' ? '全て' : statusLabel(tab);
    a.download = `アポイント一覧_${tabLabel}_${monthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVをダウンロードしました');
  };

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

  // 編集ダイアログを開く
  const openEditDialog = (appt: Appointment) => {
    setEditAppt(appt);
    setEditTargetCompany(appt.target_company_name);
    setEditContactPerson(appt.contact_person || '');
    setEditMeetingDatetime(toLocalDatetimeString(appt.meeting_datetime));
    setEditNotes(appt.notes || '');
    setShowEdit(true);
  };

  // datetime-local用のローカル形式に変換
  function toLocalDatetimeString(utcString: string): string {
    const d = new Date(utcString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

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

      if (changes.length === 0) {
        toast.info('変更はありません');
        setSaving(false);
        return;
      }

      // datetime-localの値をISO文字列に変換（TZ考慮）
      const meetingDateISO = new Date(editMeetingDatetime).toISOString();

      const { error } = await supabase
        .from('appointments')
        .update({
          target_company_name: editTargetCompany,
          contact_person: editContactPerson,
          meeting_datetime: meetingDateISO,
          notes: editNotes || null,
        })
        .eq('id', editAppt.id);

      if (error) {
        toast.error('更新に失敗しました', { description: error.message });
        return;
      }

      // メール通知を送信
      try {
        const projectTitle = (editAppt as any).project?.title || '案件';
        const orgName = (editAppt as any).organization?.name || 'パートナー';
        await fetch('/api/email/appointment-edit-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerName: orgName,
            projectTitle,
            targetCompany: editTargetCompany,
            contactPerson: editContactPerson,
            meetingDatetime: meetingDateISO,
            notes: editNotes,
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

  const openDetail = (appt: Appointment) => {
    setSelectedAppt(appt);
    setReason('');
    setShowDetail(true);
  };

  // 当日・翌日のアポ（全アポから抽出、月に関係なく表示）
  const todayAppointments = useMemo(() => {
    return appointments.filter(a => {
      const meetingDate = new Date(a.meeting_datetime);
      return isToday(meetingDate) && a.status !== 'cancelled' && a.status !== 'rejected';
    }).sort((a, b) => new Date(a.meeting_datetime).getTime() - new Date(b.meeting_datetime).getTime());
  }, [appointments]);

  const tomorrowAppointments = useMemo(() => {
    return appointments.filter(a => {
      const meetingDate = new Date(a.meeting_datetime);
      return isTomorrow(meetingDate) && a.status !== 'cancelled' && a.status !== 'rejected';
    }).sort((a, b) => new Date(a.meeting_datetime).getTime() - new Date(b.meeting_datetime).getTime());
  }, [appointments]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <PageHeader title="アポ一覧" description="アポイントの確認・承認・却下・取消" />
      </div>

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

      {/* 当日・翌日アポリマインド */}
      {(todayAppointments.length > 0 || tomorrowAppointments.length > 0) && (
        <div className="mb-4 space-y-3">
          {/* 当日のアポ */}
          {todayAppointments.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
                  本日のアポイント ({todayAppointments.length}件)
                </h3>
              </div>
              <div className="space-y-1.5">
                {todayAppointments.map(a => (
                  <div
                    key={`today-${a.id}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/70 dark:bg-red-950/30 cursor-pointer hover:bg-white dark:hover:bg-red-950/50 transition-colors"
                    onClick={() => openDetail(a)}
                  >
                    <span className="text-sm font-bold text-red-700 dark:text-red-400 min-w-[52px]">
                      {format(new Date(a.meeting_datetime), 'HH:mm')}
                    </span>
                    <span className="text-sm font-medium text-red-900 dark:text-red-300">
                      {(a as any).project?.project_number ? `[${(a as any).project.project_number}] ` : ''}{(a as any).project?.title || '—'}
                    </span>
                    <span className="text-sm text-red-800 dark:text-red-300/80">
                      {a.target_company_name}
                    </span>
                    <span className="text-xs text-red-600 dark:text-red-400/70">
                      {(a as any).organization?.name || ''}
                    </span>
                    {a.contact_person && (
                      <span className="text-xs text-red-600 dark:text-red-400/70">
                        ({a.contact_person})
                      </span>
                    )}
                    <span className="ml-auto">
                      <StatusBadge status={a.status} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 翌日のアポ */}
          {tomorrowAppointments.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                  明日のアポイント ({tomorrowAppointments.length}件)
                </h3>
              </div>
              <div className="space-y-1.5">
                {tomorrowAppointments.map(a => (
                  <div
                    key={`tomorrow-${a.id}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-md bg-white/70 dark:bg-yellow-950/30 cursor-pointer hover:bg-white dark:hover:bg-yellow-950/50 transition-colors"
                    onClick={() => openDetail(a)}
                  >
                    <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400 min-w-[52px]">
                      {format(new Date(a.meeting_datetime), 'HH:mm')}
                    </span>
                    <span className="text-sm font-medium text-yellow-900 dark:text-yellow-300">
                      {(a as any).project?.project_number ? `[${(a as any).project.project_number}] ` : ''}{(a as any).project?.title || '—'}
                    </span>
                    <span className="text-sm text-yellow-800 dark:text-yellow-300/80">
                      {a.target_company_name}
                    </span>
                    <span className="text-xs text-yellow-600 dark:text-yellow-400/70">
                      {(a as any).organization?.name || ''}
                    </span>
                    {a.contact_person && (
                      <span className="text-xs text-yellow-600 dark:text-yellow-400/70">
                        ({a.contact_person})
                      </span>
                    )}
                    <span className="ml-auto">
                      <StatusBadge status={a.status} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            保留中 ({statusCounts.pending})
          </TabsTrigger>
          <TabsTrigger value="approved">承認済 ({statusCounts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">却下 ({statusCounts.rejected})</TabsTrigger>
          <TabsTrigger value="cancelled">取消 ({statusCounts.cancelled})</TabsTrigger>
          <TabsTrigger value="excluded">非カウント ({statusCounts.excluded})</TabsTrigger>
          <TabsTrigger value="all">全て ({statusCounts.all})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>案件</TableHead>
                    <TableHead>先方企業名</TableHead>
                    <TableHead>登録企業</TableHead>
                    <TableHead>獲得者名</TableHead>
                    <TableHead>名乗り会社</TableHead>
                    <TableHead>獲得チャネル</TableHead>
                    <TableHead>商談日時</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>登録日</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(a)}>
                      <TableCell className="font-medium">{(a as any).project?.project_number ? `[${(a as any).project.project_number}] ` : ''}{(a as any).project?.title || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{a.target_company_name}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).organization?.name}</TableCell>
                      <TableCell className="text-muted-foreground">{(a as any).acquirer_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{getCompanyTypeLabel((a as any).acquisition_company_type)}</TableCell>
                      <TableCell className="text-muted-foreground">{getChannelLabel((a as any).acquisition_channel, (a as any).acquisition_channel_note)}</TableCell>
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
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {format(selectedMonth, 'yyyy年M月', { locale: ja })}の該当するアポイントがありません
                    </TableCell></TableRow>
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
                <div>
                  <p className="text-muted-foreground">名乗り会社</p>
                  <p className="font-medium">{getCompanyTypeLabel((selectedAppt as any).acquisition_company_type)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">獲得チャネル</p>
                  <p className="font-medium">{getChannelLabel((selectedAppt as any).acquisition_channel, (selectedAppt as any).acquisition_channel_note)}</p>
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
                <Button variant="outline" onClick={() => handleCancel(selectedAppt)} disabled={processing} className="text-gray-600">
                  <Ban className="w-4 h-4 mr-1" /> キャンセル
                </Button>
                <Button variant="outline" onClick={() => handleReject(selectedAppt)} disabled={processing} className="text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1" /> 却下
                </Button>
                <Button onClick={() => handleApprove(selectedAppt)} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle className="w-4 h-4 mr-1" /> 承認
                </Button>
              </>
            )}
            {selectedAppt?.status === 'approved' && user?.org_id === 'crafia' && (
              <>
                <Button variant="outline" onClick={() => openEditDialog(selectedAppt)} disabled={processing} className="gap-1.5">
                  <Pencil className="w-4 h-4" /> 編集
                </Button>
                <Button variant="outline" onClick={() => handleCancel(selectedAppt)} disabled={processing} className="text-gray-600">
                  <Ban className="w-4 h-4 mr-1" /> 取消
                </Button>
              </>
            )}
            {selectedAppt?.status === 'approved' && user?.org_id !== 'crafia' && (
              <Button variant="outline" onClick={() => handleCancel(selectedAppt)} disabled={processing} className="text-gray-600">
                <Ban className="w-4 h-4 mr-1" /> 取消
              </Button>
            )}
            {selectedAppt?.status === 'cancelled' && (
              <Button onClick={() => handleApprove(selectedAppt)} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="w-4 h-4 mr-1" /> 再承認
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
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
              <div className="space-y-2">
                <Label>メモ</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="メモを入力..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
