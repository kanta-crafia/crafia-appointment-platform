import type { Express, Request, Response } from "express";
import { sendAppointmentNotification, verifyEmailConnection, type AppointmentEmailData } from "./email";

/**
 * メール通知用のExpressルートを登録する
 */
export function registerEmailRoutes(app: Express) {
  // アポ登録時のメール通知エンドポイント
  app.post("/api/email/appointment-notification", async (req: Request, res: Response) => {
    try {
      const data = req.body as AppointmentEmailData;

      // バリデーション
      if (!data.partnerName || !data.projectTitle || !data.targetCompany || !data.meetingDatetime) {
        res.status(400).json({
          success: false,
          error: "必須項目が不足しています（partnerName, projectTitle, targetCompany, meetingDatetime）",
        });
        return;
      }

      const success = await sendAppointmentNotification(data);

      if (success) {
        res.json({ success: true, message: "メール通知を送信しました" });
      } else {
        res.status(500).json({ success: false, error: "メール送信に失敗しました" });
      }
    } catch (error) {
      console.error("[EmailRoute] Error:", error);
      res.status(500).json({ success: false, error: "サーバーエラーが発生しました" });
    }
  });

  // メール接続テスト用エンドポイント
  app.get("/api/email/verify", async (_req: Request, res: Response) => {
    try {
      const connected = await verifyEmailConnection();
      res.json({ success: connected, message: connected ? "SMTP接続OK" : "SMTP接続失敗" });
    } catch (error) {
      res.status(500).json({ success: false, error: "接続テストに失敗しました" });
    }
  });
}
