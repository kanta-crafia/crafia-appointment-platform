import { useEffect, useState, useCallback } from 'react';
import { supabase, type Notification } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Circle, ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { format, startOfDay, endOfDay, addDays, subDays, isToday } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const dayStart = startOfDay(selectedDate).toISOString();
      const dayEnd = endOfDay(selectedDate).toISOString();

      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: false });
      setNotifications(data || []);
    } catch (e) {
      console.error('Notifications fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, selectedDate]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!user) return;
    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (ids.length === 0) return;
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1));
  const goToNextDay = () => {
    const next = addDays(selectedDate, 1);
    if (next <= new Date()) setSelectedDate(next);
  };
  const goToToday = () => setSelectedDate(new Date());

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const isTodaySelected = isToday(selectedDate);
  const canGoNext = addDays(selectedDate, 1) <= new Date();

  return (
    <div>
      <PageHeader
        title="通知"
        description={`${format(selectedDate, 'yyyy年M月d日 (E)', { locale: ja })}の通知`}
        action={unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-2" />全て既読にする
          </Button>
        ) : undefined}
      />

      {/* 日付ナビゲーション */}
      <div className="flex items-center justify-between mb-4 bg-card border rounded-lg px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={goToPreviousDay}>
          <ChevronLeft className="w-4 h-4 mr-1" />前日
        </Button>

        <div className="flex items-center gap-2">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(selectedDate, 'yyyy/MM/dd (E)', { locale: ja })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {!isTodaySelected && (
            <Button variant="outline" size="sm" onClick={goToToday}>
              今日
            </Button>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={goToNextDay} disabled={!canGoNext}>
          翌日<ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* 通知リスト */}
      <Card className="border shadow-sm">
        <CardContent className="p-0 divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">
                {isTodaySelected ? '今日の通知はまだありません' : 'この日の通知はありません'}
              </p>
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
                      {(payload as any).target_company && `先方: ${(payload as any).target_company}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(n.created_at), 'HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 件数サマリー */}
      {!loading && notifications.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          {notifications.length}件の通知 / {unreadCount}件未読
        </p>
      )}
    </div>
  );
}
