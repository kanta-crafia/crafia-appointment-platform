import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useSearch } from 'wouter';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [evidenceUrl, setEvidenceUrl] = useState('');

  const fetchAllocations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('allocations')
      .select('*, project:projects(title)')
      .eq('child_org_id', user.org_id)
      .eq('status', 'active');
    setAllocations(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const selectedAlloc = allocations.find(a => a.id === allocationId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocationId || !targetCompany || !meetingDatetime) {
      toast.error('必須項目を入力してください');
      return;
    }
    if (!selectedAlloc) {
      toast.error('割り当てを選択してください');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('appointments').insert({
      project_id: selectedAlloc.project_id,
      allocation_id: allocationId,
      created_by_user_id: user?.id,
      org_id: user?.org_id,
      target_company_name: targetCompany,
      contact_person: contactPerson || null,
      meeting_datetime: meetingDatetime,
      notes: notes || null,
      evidence_url: evidenceUrl || null,
      status: 'pending',
    });
    setSaving(false);

    if (error) {
      toast.error('登録に失敗しました', { description: error.message });
    } else {
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
              <Label>割り当て案件 *</Label>
              <Select value={allocationId} onValueChange={setAllocationId}>
                <SelectTrigger><SelectValue placeholder="案件を選択" /></SelectTrigger>
                <SelectContent>
                  {allocations.map(a => {
                    const remaining = a.max_appointments_for_child - a.confirmed_count;
                    return (
                      <SelectItem key={a.id} value={a.id} disabled={remaining <= 0}>
                        {(a as any).project?.title} (残{remaining}件)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedAlloc && (
                <p className="text-xs text-muted-foreground">
                  単価: ¥{Number(selectedAlloc.payout_per_appointment).toLocaleString()} / 残枠: {selectedAlloc.max_appointments_for_child - selectedAlloc.confirmed_count}件
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>対象企業名 *</Label>
              <Input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} placeholder="株式会社〇〇" required />
            </div>

            <div className="space-y-2">
              <Label>担当者名</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="山田 太郎" />
            </div>

            <div className="space-y-2">
              <Label>商談日時 *</Label>
              <Input type="datetime-local" value={meetingDatetime} onChange={(e) => setMeetingDatetime(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>メモ</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="補足情報があれば記入" rows={3} />
            </div>

            <div className="space-y-2">
              <Label>証跡URL</Label>
              <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="https://..." />
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
