import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ClipboardCheck, Infinity } from 'lucide-react';

export default function MyAllocations() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllocations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('allocations')
      .select('*, project:projects(*)')
      .eq('child_org_id', user.org_id)
      .order('created_at', { ascending: false });
    setAllocations(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

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
              {allocations.map((a) => {
                const project = (a as any).project;
                const isUnlimited = project?.is_unlimited;
                const maxTotal = project?.max_appointments_total || 0;
                const confirmed = project?.confirmed_count || 0;
                const remaining = isUnlimited ? null : maxTotal - confirmed;
                const isFull = !isUnlimited && remaining !== null && remaining <= 0;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{project?.title || '—'}</p>
                        {project?.service_name && <p className="text-xs text-muted-foreground mt-0.5">{project.service_name}</p>}
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
                      {a.status === 'active' && !isFull && (
                        <Link href={`/appointments/new?allocation_id=${a.id}`}>
                          <Button size="sm" variant="outline">
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> アポ登録
                          </Button>
                        </Link>
                      )}
                      {isFull && (
                        <span className="text-xs text-muted-foreground">上限到達</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {allocations.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">割り当てられた案件がありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
