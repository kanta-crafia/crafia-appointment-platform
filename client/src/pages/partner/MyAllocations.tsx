import { useEffect, useState, useCallback } from 'react';
import { supabase, type Allocation } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { ClipboardCheck } from 'lucide-react';

export default function MyAllocations() {
  const { user } = useAuth();
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllocations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('allocations')
      .select('*, project:projects(title, description, start_date, end_date, status)')
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
                <TableHead className="text-right">単価</TableHead>
                <TableHead className="text-center">上限</TableHead>
                <TableHead className="text-center">確定</TableHead>
                <TableHead className="text-center">残</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((a) => {
                const project = (a as any).project;
                const remaining = a.max_appointments_for_child - a.confirmed_count;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{project?.title || '—'}</p>
                        {project?.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {project?.start_date || '—'} ~ {project?.end_date || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">¥{Number(a.payout_per_appointment).toLocaleString()}</TableCell>
                    <TableCell className="text-center">{a.max_appointments_for_child}</TableCell>
                    <TableCell className="text-center font-semibold text-emerald-700">{a.confirmed_count}</TableCell>
                    <TableCell className="text-center">{remaining}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right">
                      {a.status === 'active' && remaining > 0 && (
                        <Link href={`/appointments/new?allocation_id=${a.id}`}>
                          <Button size="sm" variant="outline">
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> アポ登録
                          </Button>
                        </Link>
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
