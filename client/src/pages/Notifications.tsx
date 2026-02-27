import { useEffect, useState, useCallback } from 'react';
import { supabase, type Notification } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Circle } from 'lucide-react';
import { format } from 'date-fns';

const typeLabels: Record<string, string> = {
  appointment_created: 'アポイント新規登録',
  appointment_approved: 'アポイント承認',
  appointment_rejected: 'アポイント却下',
  appointment_cancelled: 'アポイント取消',
};

const typeColors: Record<string, string> = {
  appointment_created: 'bg-blue-500',
  appointment_approved: 'bg-emerald-500',
  appointment_rejected: 'bg-red-500',
  appointment_cancelled: 'bg-gray-500',
};

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="通知"
        description={`${unreadCount}件の未読通知`}
        action={unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />全て既読にする
          </Button>
        ) : undefined}
      />

      <Card className="border shadow-sm">
        <CardContent className="p-0 divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">通知はまだありません</p>
            </div>
          ) : (
            notifications.map((n) => {
              const payload = n.payload_json || {};
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''} hover:bg-muted/30 cursor-pointer`}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                >
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${typeColors[n.type] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{typeLabels[n.type] || n.type}</p>
                      {!n.is_read && <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(payload as any).target_company && `対象: ${(payload as any).target_company}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(n.created_at), 'yyyy/MM/dd HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
