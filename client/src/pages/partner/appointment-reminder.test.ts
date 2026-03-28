import { describe, it, expect } from 'vitest';
import { isToday, isTomorrow } from 'date-fns';

/**
 * アポ一覧の当日・翌日リマインド表示のフィルタリングロジックをテスト
 */

interface MockAppointment {
  id: string;
  meeting_datetime: string;
  status: string;
  target_company_name: string;
  contact_person: string | null;
}

// リマインドフィルタリングロジック（コンポーネントと同じ）
function filterTodayAppointments(appointments: MockAppointment[]): MockAppointment[] {
  return appointments.filter(a => {
    const meetingDate = new Date(a.meeting_datetime);
    return isToday(meetingDate) && a.status !== 'cancelled' && a.status !== 'rejected';
  }).sort((a, b) => new Date(a.meeting_datetime).getTime() - new Date(b.meeting_datetime).getTime());
}

function filterTomorrowAppointments(appointments: MockAppointment[]): MockAppointment[] {
  return appointments.filter(a => {
    const meetingDate = new Date(a.meeting_datetime);
    return isTomorrow(meetingDate) && a.status !== 'cancelled' && a.status !== 'rejected';
  }).sort((a, b) => new Date(a.meeting_datetime).getTime() - new Date(b.meeting_datetime).getTime());
}

describe('appointment-reminder', () => {
  const now = new Date();
  const today10am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const today14pm = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
  const tomorrow9am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
  const tomorrow15pm = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0, 0);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0, 0);
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 10, 0, 0);

  const mockAppointments: MockAppointment[] = [
    { id: '1', meeting_datetime: today10am.toISOString(), status: 'pending', target_company_name: 'A社', contact_person: '田中' },
    { id: '2', meeting_datetime: today14pm.toISOString(), status: 'approved', target_company_name: 'B社', contact_person: '鈴木' },
    { id: '3', meeting_datetime: today10am.toISOString(), status: 'cancelled', target_company_name: 'C社', contact_person: null },
    { id: '4', meeting_datetime: today14pm.toISOString(), status: 'rejected', target_company_name: 'D社', contact_person: '佐藤' },
    { id: '5', meeting_datetime: tomorrow9am.toISOString(), status: 'pending', target_company_name: 'E社', contact_person: '高橋' },
    { id: '6', meeting_datetime: tomorrow15pm.toISOString(), status: 'approved', target_company_name: 'F社', contact_person: null },
    { id: '7', meeting_datetime: tomorrow9am.toISOString(), status: 'cancelled', target_company_name: 'G社', contact_person: '伊藤' },
    { id: '8', meeting_datetime: yesterday.toISOString(), status: 'pending', target_company_name: 'H社', contact_person: '山田' },
    { id: '9', meeting_datetime: nextWeek.toISOString(), status: 'approved', target_company_name: 'I社', contact_person: '中村' },
  ];

  it('当日のアポのみ抽出される（cancelled/rejectedは除外）', () => {
    const result = filterTodayAppointments(mockAppointments);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toEqual(['1', '2']);
  });

  it('当日のアポは時間順にソートされる', () => {
    const result = filterTodayAppointments(mockAppointments);
    expect(result[0].id).toBe('1'); // 10:00
    expect(result[1].id).toBe('2'); // 14:00
  });

  it('翌日のアポのみ抽出される（cancelled/rejectedは除外）', () => {
    const result = filterTomorrowAppointments(mockAppointments);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toEqual(['5', '6']);
  });

  it('翌日のアポは時間順にソートされる', () => {
    const result = filterTomorrowAppointments(mockAppointments);
    expect(result[0].id).toBe('5'); // 9:00
    expect(result[1].id).toBe('6'); // 15:00
  });

  it('昨日や来週のアポは当日・翌日に含まれない', () => {
    const todayResult = filterTodayAppointments(mockAppointments);
    const tomorrowResult = filterTomorrowAppointments(mockAppointments);
    const allReminderIds = [...todayResult, ...tomorrowResult].map(a => a.id);
    expect(allReminderIds).not.toContain('8'); // 昨日
    expect(allReminderIds).not.toContain('9'); // 来週
  });

  it('アポが空の場合は空配列を返す', () => {
    expect(filterTodayAppointments([])).toEqual([]);
    expect(filterTomorrowAppointments([])).toEqual([]);
  });

  it('当日のcancelledアポは除外される', () => {
    const result = filterTodayAppointments(mockAppointments);
    expect(result.find(a => a.id === '3')).toBeUndefined();
  });

  it('当日のrejectedアポは除外される', () => {
    const result = filterTodayAppointments(mockAppointments);
    expect(result.find(a => a.id === '4')).toBeUndefined();
  });
});
