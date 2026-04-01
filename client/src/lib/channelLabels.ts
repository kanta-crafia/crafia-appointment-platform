/** 獲得チャネルのラベル変換 */
export const CHANNEL_LABELS: Record<string, string> = {
  sns: 'SNS',
  referral: '紹介',
  self_seating: '自己着座',
  phone: '電話',
  other: 'その他',
};

export function getChannelLabel(channel: string | null, note?: string | null): string {
  if (!channel) return '—';
  if (channel === 'other' && note) return `その他（${note}）`;
  return CHANNEL_LABELS[channel] || channel;
}

/** 獲得時の名乗り会社のラベル変換 */
export const COMPANY_TYPE_LABELS: Record<string, string> = {
  client: 'クライアント名',
  crafia: 'Crafia名乗り',
  self: '自己着座',
};

export function getCompanyTypeLabel(type: string | null): string {
  if (!type) return '—';
  return COMPANY_TYPE_LABELS[type] || type;
}
