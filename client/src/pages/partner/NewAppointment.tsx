import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useSearch } from 'wouter';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link } from 'wouter';

export default function NewAppointment() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedAllocationId = params.get('allocation_id') || '';

  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form
  const [allocationId, setAllocationId] = useState(preselectedAllocationId);
  const [targetCompany, setTargetCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [meetingDatetime, setMeetingDatetime] = useState('');
  const [notes, setNotes] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [acquirerName, setAcquirerName] = useState('');

  const fetchAllocations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('child_org_id', user.org_id)
        .eq('status', 'active');
      setAllocations(data || []);
    } catch (e) {
      console.error('Allocations fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  // ユーザー名を獲得者名のデフォルトに設定
  useEffect(() => {
    if (user?.full_name && !acquirerName) {
      setAcquirerName(user.full_name);
    }
  }, [user]);

  const selectedAlloc = allocations.find(a => a.id === allocationId);
  const selectedProject = selectedAlloc ? (selectedAlloc as any).project : null;

  // パートナー組織名を取得する
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

  // Supabase Edge Function経由でメール通知を送信する
  const sendEmailNotification = async (projectTitle: string) => {
    try {
      const partnerName = await getPartnerOrgName();
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-appointment-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnerName,
          projectTitle,
          targetCompany,
          contactPerson,
          meetingDatetime,
          notes,
          acquisitionDate,
          acquirerName,
          subject: `【代理店/アポ獲得】${partnerName}`,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        console.warn('[Email] 通知送信失敗:', result.error);
      }
    } catch (error) {
      // メール送信失敗はアポ登録自体には影響させない
      console.warn('[Email] 通知送信エラー:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocationId || !targetCompany || !contactPerson || !meetingDatetime || !acquisitionDate || !acquirerName || !notes) {
      toast.error('必須項目を入力してください');
      return;
    }
    if (!selectedAlloc) {
      toast.error('割り当てを選択してください');
      return;
    }

    // Check project limit
    if (selectedProject && !selectedProject.is_unlimited) {
      const remaining = selectedProject.max_appointments_total - selectedProject.confirmed_count;
      if (remaining <= 0) {
        toast.error('この案件の上限に達しています');
        return;
      }
    }

    setSaving(true);
    // datetime-localの値をDateオブジェクト経由でISO文字列に変換（ブラウザのTZを考慮）
    const meetingDateISO = new Date(meetingDatetime).toISOString();
    const { error } = await supabase.from('appointments').insert({
      project_id: selectedAlloc.project_id,
      allocation_id: allocationId,
      created_by_user_id: user?.id,
      org_id: user?.org_id,
      target_company_name: targetCompany,
      contact_person: contactPerson,
      meeting_datetime: meetingDateISO,
      notes: notes,
      acquisition_date: acquisitionDate,
      acquirer_name: acquirerName,
      status: 'pending',
    });

    if (error) {
      setSaving(false);
      toast.error('登録に失敗しました', { description: error.message });
    } else {
      // アポ登録成功後にメール通知を送信（ページ遷移前に完了を待つ）
      const projectTitle = selectedProject?.title || '不明な案件';
      await sendEmailNotification(projectTitle);

      setSaving(false);
      toast.success('アポイントを登録しました', { description: '承認待ちの状態です' });
      navigate('/appointments');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/appointments">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> 戻る
          </Button>
        </Link>
      </div>

      <PageHeader title="アポイント登録" description="新しいアポイントを登録します" />

      <Card className="border shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>割り当て案件 <span className="text-destructive">*</span></Label>
              <Select value={allocationId} onValueChange={setAllocationId}>
                <SelectTrigger><SelectValue placeholder="案件を選択" /></SelectTrigger>
                <SelectContent>
                  {allocations.map(a => {
                    const proj = (a as any).project;
                    const isUnlimited = proj?.is_unlimited;
                    const remaining = isUnlimited ? null : (proj?.max_appointments_total || 0) - (proj?.confirmed_count || 0);
                    const isFull = !isUnlimited && remaining !== null && remaining <= 0;
                    const projectNumber = proj?.project_number ? `[${proj.project_number}] ` : '';
                    return (
                      <SelectItem key={a.id} value={a.id} disabled={isFull}>
                        {projectNumber}{proj?.title}{isUnlimited ? '' : ` (残${remaining}件)`}{isFull ? ' — 上限到達' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedAlloc && selectedProject && (
                <p className="text-xs text-muted-foreground">
                  {selectedProject.is_unlimited
                    ? '上限: 無制限'
                    : `残枠: ${selectedProject.max_appointments_total - selectedProject.confirmed_count}件`
                  }
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>先方企業名 <span className="text-destructive">*</span></Label>
              <Input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder="株式会社〇〇" required />
            </div>

            <div className="space-y-2">
              <Label>先方担当者名 <span className="text-destructive">*</span></Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="山田 太郎" required />
            </div>

            <div className="space-y-2">
              <Label>商談日時 <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={meetingDatetime} onChange={(e) => setMeetingDatetime(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>獲得日 <span className="text-destructive">*</span></Label>
                <Input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>獲得者名 <span className="text-destructive">*</span></Label>
                <Input value={acquirerName} onChange={(e) => setAcquirerName(e.target.value)} placeholder="獲得者の名前" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>メモ <span className="text-destructive">*</span></Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="補足情報を記入" rows={3} required />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                登録する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
