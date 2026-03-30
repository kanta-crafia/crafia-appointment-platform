import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '保留中', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved: { label: '承認済', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected: { label: '却下', className: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: '取消', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  active: { label: '有効', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  inactive: { label: '無効', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  closed: { label: '終了', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  available: { label: '空き', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  assigned: { label: '割り振り済', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  suspended: { label: '停止中', className: 'bg-orange-100 text-orange-800 border-orange-200' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
      config.className,
      className
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'pending' && 'bg-amber-500 animate-pulse',
        status === 'approved' && 'bg-emerald-500',
        status === 'rejected' && 'bg-red-500',
        status === 'cancelled' && 'bg-gray-500',
        status === 'active' && 'bg-emerald-500',
        status === 'inactive' && 'bg-gray-400',
        status === 'closed' && 'bg-slate-500',
        status === 'available' && 'bg-blue-500',
        status === 'assigned' && 'bg-purple-500',
        status === 'suspended' && 'bg-orange-500',
      )} />
      {config.label}
    </span>
  );
}
