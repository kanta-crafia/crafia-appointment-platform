import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation, type Project } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Link } from 'wouter';
import { ClipboardCheck, Infinity, Eye, ExternalLink, Calendar, FileText, Target, Info } from 'lucide-react';

export default function MyAllocations() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [showDetail, setShowDetail] = useState(false);

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
        .order('created_at', { ascending: false });
      setAllocations(data || []);
    } catch (e) {
      console.error('Allocations fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const openDetail = (project: Project) => {
    setDetailProject(project);
    setShowDetail(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="割り当て案件" description="自社に割り当てられた案件の一覧" />

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>案件名</TableHead>
                <TableHead>期間</TableHead>
                <TableHead className="text-right">卸単価</TableHead>
                <TableHead className="text-center">案件上限</TableHead>
                <TableHead className="text-center">確定数</TableHead>
                <TableHead className="text-center">残数</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations
                .filter((a) => {
                  // 「終了」案件は一覧から完全に非表示
                  const project = (a as any).project as Project | undefined;
                  return project?.status !== 'closed';
                })
                .map((a) => {
                const project = (a as any).project as Project | undefined;
                const isUnlimited = project?.is_unlimited;
                const maxTotal = project?.max_appointments_total || 0;
                const confirmed = project?.confirmed_count || 0;
                const remaining = isUnlimited ? null : maxTotal - confirmed;
                const isFull = !isUnlimited && remaining !== null && remaining <= 0;
                const isActive = a.status === 'active';
                const projectActive = project?.status === 'active';
                const projectInactive = project?.status === 'inactive';
                // 「無効」案件はアポ登録不可（上限到達と同じ扱い）
                const canRegister = isActive && projectActive && !isFull;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{project?.title || '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project?.start_date || '—'} ~ {project?.end_date || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">¥{Number(a.payout_per_appointment).toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      {isUnlimited
                        ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Infinity className="w-4 h-4" /></span>
                        : maxTotal
                      }
                    </TableCell>
                    <TableCell className="text-center font-semibold text-emerald-700">{confirmed}</TableCell>
                    <TableCell className="text-center">{isUnlimited ? '—' : remaining}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {project && (
                          <Button size="sm" variant="ghost" onClick={() => openDetail(project)} title="案件詳細">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canRegister ? (
                          <Link href={`/appointments/new?allocation_id=${a.id}`}>
                            <Button size="sm" variant="outline">
                              <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> アポ登録
                            </Button>
                          </Link>
                        ) : (
                          <>
                            {isFull && !projectInactive && <span className="text-xs text-muted-foreground">上限到達</span>}
                            {projectInactive && <span className="text-xs text-muted-foreground">受付停止中</span>}
                            {!isActive && !projectInactive && <span className="text-xs text-muted-foreground">無効</span>}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {allocations.filter((a) => {
                const project = (a as any).project as Project | undefined;
                return project?.status !== 'closed';
              }).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">割り当てられた案件がありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* === 案件詳細ダイアログ === */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {detailProject?.title || '案件詳細'}
            </DialogTitle>
            <DialogDescription>案件の詳細情報</DialogDescription>
          </DialogHeader>
          {detailProject && (
            <div className="space-y-5 py-2">
              {/* 基本情報 */}
              <div className="grid grid-cols-2 gap-4">
                {detailProject.project_number && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">案件番号</p>
                    <p className="text-sm font-mono">{detailProject.project_number}</p>
                  </div>
                )}
                {detailProject.company_name && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">企業名</p>
                    <p className="text-sm">{detailProject.company_name}</p>
                  </div>
                )}
              </div>

              {/* 期間 */}
              {(detailProject.start_date || detailProject.end_date) && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{detailProject.start_date || '—'} ~ {detailProject.end_date || '—'}</span>
                </div>
              )}

              {/* 上限 */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">上限</p>
                    <p className="text-sm font-semibold">
                      {detailProject?.is_unlimited ? '無制限' : `${detailProject?.max_appointments_total}件`}
                    </p>
                  </div>
                </div>
              </div>

              {/* サービス概要 */}
              {detailProject.service_overview && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Info className="w-3 h-3" />サービス概要</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{detailProject.service_overview}</p>
                </div>
              )}

              {/* 案件詳細 */}
              {detailProject.project_detail && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><FileText className="w-3 h-3" />案件詳細</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{detailProject.project_detail}</p>
                </div>
              )}

              {/* 獲得条件 */}
              {detailProject.acquisition_conditions && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Target className="w-3 h-3" />獲得条件</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{detailProject.acquisition_conditions}</p>
                </div>
              )}

              {/* 日程調整URL */}
              {detailProject.scheduling_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">日程調整URL</p>
                  <a
                    href={detailProject.scheduling_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {detailProject.scheduling_url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* アプローチ禁止リスト */}
              {(detailProject as any).prohibited_list_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Target className="w-3 h-3" />アプローチ禁止リスト</p>
                  <a
                    href={(detailProject as any).prohibited_list_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Googleシートを表示
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-1">アプローチ禁止対象の企業一覧を確認してからアポイントを登録してください</p>
                </div>
              )}

              {/* ステータス */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground">ステータス:</span>
                <StatusBadge status={detailProject.status} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
