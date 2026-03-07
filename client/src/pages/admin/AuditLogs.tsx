import { useEffect, useState, useCallback } from 'react';
import { supabase, type AuditLog } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, FileText, Building2, Briefcase, GitBranch,
  ClipboardCheck, ChevronLeft, ChevronRight, Eye, RefreshCw, Filter
} from 'lucide-react';
import { format } from 'date-fns';

const actionConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  INSERT: { label: '作成', icon: Plus, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  UPDATE: { label: '更新', icon: Pencil, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  DELETE: { label: '削除', icon: Trash2, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
};

const entityConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  allocations: { label: '割り当て', icon: GitBranch, color: 'text-violet-600' },
  appointments: { label: 'アポイント', icon: ClipboardCheck, color: 'text-emerald-600' },
  projects: { label: '案件', icon: Briefcase, color: 'text-blue-600' },
  organizations: { label: '企業', icon: Building2, color: 'text-orange-600' },
};

const PAGE_SIZE = 20;

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterAction, setFilterAction] = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*, actor:users!audit_logs_actor_user_id_fkey(full_name, login_id, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction !== 'all') query = query.eq('action', filterAction);
      if (filterEntity !== 'all') query = query.eq('entity_type', filterEntity);

      const { data, count } = await query;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (e) {
      console.error('AuditLogs fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterEntity]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const openDetail = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetail(true);
  };

  const resetFilters = () => {
    setFilterAction('all');
    setFilterEntity('all');
    setPage(0);
  };

  const formatJsonForDisplay = (json: Record<string, unknown> | null): { key: string; value: string }[] => {
    if (!json) return [];
    return Object.entries(json).map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—'),
    }));
  };

  const getSummary = (log: AuditLog): string => {
    const entity = entityConfig[log.entity_type]?.label || log.entity_type;
    const action = actionConfig[log.action]?.label || log.action;
    const data = log.after_json || log.before_json;

    let target = '';
    if (data) {
      if ('title' in data) target = ` "${data.title}"`;
      else if ('name' in data) target = ` "${data.name}"`;
      else if ('target_company_name' in data) target = ` "${data.target_company_name}"`;
      else if ('login_id' in data) target = ` "${data.login_id}"`;
    }

    return `${entity}${target}を${action}`;
  };

  return (
    <div>
      <PageHeader title="監査ログ" description="システム上の主要操作の履歴を確認できます" />

      {/* Filters */}
      <Card className="border shadow-sm mb-4">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              フィルタ:
            </div>
            <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="操作種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全ての操作</SelectItem>
                <SelectItem value="INSERT">作成</SelectItem>
                <SelectItem value="UPDATE">更新</SelectItem>
                <SelectItem value="DELETE">削除</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={(v) => { setFilterEntity(v); setPage(0); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="対象種別" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全ての対象</SelectItem>
                <SelectItem value="projects">案件</SelectItem>
                <SelectItem value="organizations">企業</SelectItem>
                <SelectItem value="allocations">割り当て</SelectItem>
                <SelectItem value="appointments">アポイント</SelectItem>
              </SelectContent>
            </Select>
            {(filterAction !== 'all' || filterEntity !== 'all') && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> リセット
              </Button>
            )}
            <div className="ml-auto text-sm text-muted-foreground">
              {totalCount}件の記録
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">日時</TableHead>
                    <TableHead className="w-[120px]">操作者</TableHead>
                    <TableHead className="w-[90px]">操作</TableHead>
                    <TableHead className="w-[110px]">対象</TableHead>
                    <TableHead>概要</TableHead>
                    <TableHead className="w-[60px] text-right">詳細</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const actor = (log as any).actor;
                    const ac = actionConfig[log.action] || { label: log.action, icon: FileText, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };
                    const ec = entityConfig[log.entity_type] || { label: log.entity_type, icon: FileText, color: 'text-gray-600' };
                    const ActionIcon = ac.icon;
                    const EntityIcon = ec.icon;

                    return (
                      <TableRow key={log.id} className="hover:bg-muted/30 group">
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap font-mono">
                          {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                              {(actor?.full_name || actor?.login_id || 'S')[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-medium truncate max-w-[80px]">
                              {actor?.full_name || actor?.login_id || 'システム'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${ac.bg} ${ac.color} border gap-1`}>
                            <ActionIcon className="w-3 h-3" />
                            {ac.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm ${ec.color}`}>
                            <EntityIcon className="w-3.5 h-3.5" />
                            <span className="font-medium">{ec.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getSummary(log)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(log)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        監査ログがまだありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}〜{Math.min((page + 1) * PAGE_SIZE, totalCount)}件 / 全{totalCount}件
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm px-2">{page + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              監査ログ詳細
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (() => {
            const actor = (selectedLog as any).actor;
            const ac = actionConfig[selectedLog.action] || { label: selectedLog.action, icon: FileText, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };
            const ec = entityConfig[selectedLog.entity_type] || { label: selectedLog.entity_type, icon: FileText, color: 'text-gray-600' };

            return (
              <div className="space-y-5 py-2">
                {/* Meta info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">日時</p>
                    <p className="font-mono font-medium">{format(new Date(selectedLog.created_at), 'yyyy/MM/dd HH:mm:ss')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">操作者</p>
                    <p className="font-medium">{actor?.full_name || actor?.login_id || 'システム'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">操作</p>
                    <Badge variant="outline" className={`${ac.bg} ${ac.color} border`}>{ac.label}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">対象</p>
                    <p className={`font-medium ${ec.color}`}>{ec.label}</p>
                  </div>
                  {selectedLog.entity_id && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground mb-1">対象ID</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{selectedLog.entity_id}</code>
                    </div>
                  )}
                </div>

                {/* Before data */}
                {selectedLog.before_json && Object.keys(selectedLog.before_json).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2 text-red-600 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" /> 変更前のデータ
                    </p>
                    <div className="bg-red-50/50 border border-red-100 rounded-lg overflow-hidden">
                      <Table>
                        <TableBody>
                          {formatJsonForDisplay(selectedLog.before_json).map(({ key, value }) => (
                            <TableRow key={key}>
                              <TableCell className="text-xs font-mono text-muted-foreground w-[140px] py-1.5 px-3">{key}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3 break-all">{value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* After data */}
                {selectedLog.after_json && Object.keys(selectedLog.after_json).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2 text-blue-600 flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> {selectedLog.action === 'INSERT' ? '作成されたデータ' : '変更後のデータ'}
                    </p>
                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg overflow-hidden">
                      <Table>
                        <TableBody>
                          {formatJsonForDisplay(selectedLog.after_json).map(({ key, value }) => (
                            <TableRow key={key}>
                              <TableCell className="text-xs font-mono text-muted-foreground w-[140px] py-1.5 px-3">{key}</TableCell>
                              <TableCell className="text-xs py-1.5 px-3 break-all">{value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
