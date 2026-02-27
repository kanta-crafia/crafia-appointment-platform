# 変更タスク TODO

## DB変更
- [ ] projectsテーブルにカラム追加: project_number, company_name, service_name, service_overview, project_detail, acquisition_conditions, scheduling_url, priority, monthly_limit(null=無限)
- [ ] allocationsテーブルからmax_appointments, conditionsを削除（シンプル化）

## フロントエンド
- [ ] 案件管理画面: 入力項目を拡張
- [ ] 割り当て管理画面: パートナーごとの上限・条件を削除
- [ ] ユーザー一覧: 削除ボタンが表示されるよう修正

## メール通知
- [ ] アポ獲得時にCrafia本部へメール通知を送信
