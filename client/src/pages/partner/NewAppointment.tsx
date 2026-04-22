import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation, type SubAllocationPrice, type SalesStaff } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useSearch } from 'wouter';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'wouter';

interface AllocationWithPrice extends Allocation {
  effectivePayoutPerAppointment: number | null;
}

export default function NewAppointment() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const preselectedAllocationId = params.get('allocation_id') || '';

  const [allocations, setAllocations] = useState<AllocationWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Form
  const [allocationId, setAllocationId] = useState(preselectedAllocationId);
  const [targetCompany, setTargetCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [meetingDatetime, setMeetingDatetime] = useState('');
  const [notes, setNotes] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [acquirerName, setAcquirerName] = useState('');
  const [acquiredCompanyName, setAcquiredCompanyName] = useState('client');
  const [acquisitionChannel, setAcquisitionChannel] = useState('');
  const [acquisitionChannelNote, setAcquisitionChannelNote] = useState('');
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [salesStaff, setSalesStaff] = useState<SalesStaff[]>([]);
  const [approvedCounts, setApprovedCounts] = useState<Record<string, number>>({});

  // Stabilize dependency: use user.id + user.org_id instead of user object
  const userId = user?.id;
  const userOrgId = user?.org_id;
  const userRole = user?.role;

  const fetchAllocations = useCallback(async () => {
    if (!userId || !userOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 自分の組織情報を取得
      const { data: myOrg } = await supabase
        .from('organizations')
        .select('id, parent_org_id')
        .eq('id', userOrgId)
        .single();

      let allAllocs: AllocationWithPrice[] = [];

      // 1. 自分の組織に直接割り当てられた案件
      const { data: directData } = await supabase
        .from('allocations')
        .select('*, project:projects(*)')
        .eq('child_org_id', userOrgId)
        .eq('status', 'active');
      const directAllocations = directData || [];

      // 2. 祖先チェーンを再帰的にたどり、アロケーションを継承する
      const directProjectIds = new Set(directAllocations.map(a => a.project_id));
      const collectedProjectIds = new Set(directProjectIds);

      if (myOrg?.parent_org_id) {
        // 祖先チェーンを構築（Crafia本部まで遡る）
        const ancestorOrgIds: string[] = [];
        let currentParentId: string | null = myOrg.parent_org_id;
        const maxDepth = 10;
        let depth = 0;
        while (currentParentId && depth < maxDepth) {
          const { data: ancestorOrg } = await supabase
            .from('organizations')
            .select('id, parent_org_id')
            .eq('id', currentParentId)
            .single();
          if (!ancestorOrg) break;
          if (ancestorOrg.parent_org_id) {
            ancestorOrgIds.push(ancestorOrg.id);
          }
          currentParentId = ancestorOrg.parent_org_id;
          depth++;
        }

        for (const ancestorId of ancestorOrgIds) {
          const { data: ancestorAllocData } = await supabase
            .from('allocations')
            .select('*, project:projects(*)')
            .eq('child_org_id', ancestorId)
            .eq('status', 'active');

          const newAllocations = (ancestorAllocData || []).filter(
            a => !collectedProjectIds.has(a.project_id)
          );

          if (newAllocations.length > 0) {
            const allocIds = newAllocations.map(a => a.id);
            const { data: priceData } = await supabase
              .from('sub_allocation_prices')
              .select('*')
              .in('allocation_id', allocIds)
              .eq('sub_org_id', userOrgId);

            const priceMap = new Map<string, number>();
            (priceData || []).forEach((p: SubAllocationPrice) => {
              priceMap.set(p.allocation_id, Number(p.payout_per_appointment));
            });

            const inherited: AllocationWithPrice[] = newAllocations.map(a => ({
              ...a,
              effectivePayoutPerAppointment: priceMap.has(a.id) ? priceMap.get(a.id)! : null,
            }));
            allAllocs = [...allAllocs, ...inherited];
            newAllocations.forEach(a => collectedProjectIds.add(a.project_id));
          }
        }
      }

      // 直接割り当て
      const directWithPrice: AllocationWithPrice[] = directAllocations.map(a => ({
        ...a,
        effectivePayoutPerAppointment: Number(a.payout_per_appointment),
      }));
      allAllocs = [...directWithPrice, ...allAllocs];

      setAllocations(allAllocs);

      // 各案件の承認済みアポ数を集計
      const projectIds = Array.from(new Set(allAllocs.map(a => a.project_id).filter(Boolean)));
      if (projectIds.length > 0) {
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
    } catch (e) {
      console.error('Allocations fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, userOrgId, userRole]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  // 営業担当者リストを取得
  useEffect(() => {
    if (!userOrgId) return;
    const fetchStaff = async () => {
      const { data } = await supabase
        .from('sales_staff')
        .select('*')
        .eq('org_id', userOrgId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      setSalesStaff(data || []);
    };
    fetchStaff();
  }, [userOrgId]);

  // ユーザー名を獲得者名のデフォルトに設定（営業担当者が未登録の場合のみ）
  useEffect(() => {
    if (user?.full_name && !acquirerName && salesStaff.length === 0) {
      setAcquirerName(user.full_name);
    }
  }, [user, salesStaff]);

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

  // 実際のINSERT処理（重複確認後も呼ばれる）
  const doInsert = async () => {
    setSaving(true);
    // datetime-localの値をDateオブジェクト経由でISO文字列に変換（ブラウザの TZを考慮）
    const meetingDateISO = new Date(meetingDatetime).toISOString();
    const { error } = await supabase.from('appointments').insert({
      project_id: selectedAlloc!.project_id,
      allocation_id: allocationId,
      created_by_user_id: user?.id,
      org_id: user?.org_id,
      target_company_name: targetCompany,
      contact_person: contactPerson,
      meeting_datetime: meetingDateISO,
      notes: notes,
      acquisition_date: acquisitionDate,
      acquirer_name: acquirerName,
      acquisition_company_type: acquiredCompanyName,
      acquisition_channel: acquisitionChannel || null,
      acquisition_channel_note: acquisitionChannel === 'other' ? (acquisitionChannelNote || null) : null,
      status: 'pending',
    });

    if (error) {
      setSaving(false);
      toast.error('登録に失敗しました', { description: error.message });
    } else {
      // アポ登録成功 → 即座にページ遷移（メール送信は非同期で行い、ユーザーを待たせない）
      const projectTitle = selectedProject?.title || '不明な案件';
      sendEmailNotification(projectTitle).catch(e => console.warn('[Email] Background send failed:', e));

      setSaving(false);
      toast.success('アポイントを登録しました', { description: '承認待ちの状態です' });
      navigate('/appointments');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocationId || !targetCompany || !contactPerson || !meetingDatetime || !acquisitionDate || !acquirerName || !acquisitionChannel || !notes) {
      toast.error('必須項目を入力してください');
      return;
    }
    if (!selectedAlloc) {
      toast.error('割り当てを選択してください');
      return;
    }

    // Check project status
    if (selectedProject?.status === 'inactive') {
      toast.error('この案件は現在受付停止中です');
      return;
    }
    if (selectedProject?.status === 'closed') {
      toast.error('この案件は終了しています');
      return;
    }

    // Check project limit
    if (selectedProject && !selectedProject.is_unlimited) {
      const approvedCount = approvedCounts[selectedProject.id] || 0;
      const remaining = selectedProject.max_appointments_total - approvedCount;
      if (remaining <= 0) {
        toast.error('この案件の上限に達しています');
        return;
      }
    }

    // Check for duplicate target company in the same project (confirmation only, not blocking)
    try {
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('id')
        .eq('project_id', selectedAlloc.project_id)
        .eq('target_company_name', targetCompany)
        .neq('status', 'rejected')
        .neq('status', 'cancelled');
      
      if (existingAppts && existingAppts.length > 0) {
        // 重複がある場合は確認ダイアログを表示（登録はブロックしない）
        setShowDuplicateDialog(true);
        return;
      }
    } catch (checkError) {
      console.error('Duplicate check error:', checkError);
      // 重複チェックでエラーが出ても登録自体はブロックしない
    }

    // 重複なし → そのまま登録
    await doInsert();
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
                  {allocations
                    .filter(a => {
                      // 「終了」案件はプルダウンから完全に非表示
                      const proj = (a as any).project;
                      return proj?.status !== 'closed';
                    })
                    .map(a => {
                    const proj = (a as any).project;
                    const isUnlimited = proj?.is_unlimited;
                    const remaining = isUnlimited ? null : (proj?.max_appointments_total || 0) - (approvedCounts[proj?.id] || 0);
                    const isFull = !isUnlimited && remaining !== null && remaining <= 0;
                    const projectInactive = proj?.status === 'inactive';
                    const projectNumber = proj?.project_number ? `[${proj.project_number}] ` : '';
                    // 「無効」案件または上限到達の場合は選択不可
                    const isDisabled = isFull || projectInactive;
                    return (
                      <SelectItem key={a.id} value={a.id} disabled={isDisabled}>
                        {projectNumber}{proj?.title}{isUnlimited ? '' : ` (残${remaining}件)`}{isFull ? ' — 上限到達' : ''}{projectInactive ? ' — 受付停止中' : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedAlloc && selectedProject && (
                <p className="text-xs text-muted-foreground">
                  {selectedProject.is_unlimited
                    ? '上限: 無制限'
                    : `残枠: ${selectedProject.max_appointments_total - (approvedCounts[selectedProject.id] || 0)}件`
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
                {salesStaff.length > 0 ? (
                  <Select value={acquirerName} onValueChange={setAcquirerName}>
                    <SelectTrigger><SelectValue placeholder="担当者を選択" /></SelectTrigger>
                    <SelectContent>
                      {salesStaff.map(s => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={acquirerName} onChange={(e) => setAcquirerName(e.target.value)} placeholder="獲得者の名前" required />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>獲得時の名乗り会社 <span className="text-destructive">*</span></Label>
              <Select value={acquiredCompanyName} onValueChange={setAcquiredCompanyName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">クライアント名</SelectItem>
                  <SelectItem value="crafia">Crafia名乗り</SelectItem>
                  <SelectItem value="self">自己着座</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">※着座いただく方が認識をされている会社名の入力をお願いします。</p>
              <p className="text-xs text-muted-foreground">※自己着座の場合、株式会社Crafia名乗りでアポ取得された形となります。</p>
            </div>

            <div className="space-y-2">
              <Label>獲得チャネル <span className="text-destructive">*</span></Label>
              <Select value={acquisitionChannel} onValueChange={setAcquisitionChannel}>
                <SelectTrigger><SelectValue placeholder="チャネルを選択" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sns">SNS</SelectItem>
                  <SelectItem value="referral">紹介</SelectItem>
                  <SelectItem value="self_seating">自己着座</SelectItem>
                  <SelectItem value="phone">電話</SelectItem>
                  <SelectItem value="other">その他</SelectItem>
                </SelectContent>
              </Select>
              {acquisitionChannel === 'other' && (
                <Input
                  value={acquisitionChannelNote}
                  onChange={(e) => setAcquisitionChannelNote(e.target.value)}
                  placeholder="その他のチャネルを入力"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>メモ <span className="text-destructive">*</span></Label>
              {selectedProject?.project_detail && (
                <div className="mb-1">
                  <button
                    type="button"
                    onClick={() => setShowProjectDetail(!showProjectDetail)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    案件詳細を{showProjectDetail ? '閉じる' : '表示'}
                    {showProjectDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showProjectDetail && (
                    <div className="mt-2 p-3 bg-muted/40 border border-border rounded-lg text-sm whitespace-pre-wrap text-foreground/80">
                      {selectedProject.project_detail}
                    </div>
                  )}
                </div>
              )}
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"\u88dc\u8db3\u60c5\u5831\u3092\u8a18\u5165\n\u30fb\u5148\u65b9\u30cb\u30fc\u30ba/\u8ab2\u984c\n\u30fb\u53d6\u5f97\u30c1\u30e3\u30cd\u30eb\n\u30fb\u6e29\u5ea6\u611f\u3000\u306a\u3069\u30fb\u30fb\u30fb"} rows={5} required />
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

      {/* 重複確認ダイアログ */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>先方企業名が重複しています</AlertDialogTitle>
            <AlertDialogDescription>
              この案件に「{targetCompany}」と同じ先方企業名のアポイントが既に登録されています。このまま登録してもよろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setShowDuplicateDialog(false);
              await doInsert();
            }}>
              登録する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
