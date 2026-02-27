import { useEffect, useState, useCallback } from 'react';
import { supabase, type AuditLog } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

const actionLabels: Record<string, string> = {
  INSERT: '作成',
  UPDATE: '更新',
  DELETE: '削除',
};

const entityLabels: Record<string, string> = {
  allocations: '割り当て',
  appointments: 'アポイント',
  projects: '案件',
  organizations: '企業',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*, actor:users!audit_logs_actor_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="監査ログ" description="主要操作の履歴を確認" />

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日時</TableHead>
                <TableHead>操作者</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>対象</TableHead>
                <TableHead>詳細</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const actor = (log as any).actor;
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-sm">{actor?.full_name || actor?.email || 'システム'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        log.action === 'INSERT' ? 'bg-blue-100 text-blue-800' :
                        log.action === 'UPDATE' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{entityLabels[log.entity_type] || log.entity_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {log.after_json ? JSON.stringify(log.after_json).substring(0, 80) + '...' : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">監査ログがまだありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
