import type { Express, Request, Response } from "express";
import { sendAppointmentNotification, sendApprovalRequestNotification, sendAppointmentEditNotification, verifyEmailConnection, type AppointmentEmailData, type ApprovalRequestEmailData, type AppointmentEditEmailData } from "./email";

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

  // 承認再要求メール通知エンドポイント
  app.post("/api/email/approval-request", async (req: Request, res: Response) => {
    try {
      const data = req.body as ApprovalRequestEmailData;

      // バリデーション
      if (!data.partnerName || !data.projectTitle || !data.targetCompany || !data.meetingDatetime || !data.appointmentId) {
        res.status(400).json({
          success: false,
          error: "必須項目が不足しています（partnerName, projectTitle, targetCompany, meetingDatetime, appointmentId）",
        });
        return;
      }

      const success = await sendApprovalRequestNotification(data);

      if (success) {
        res.json({ success: true, message: "承認要求メールを送信しました" });
      } else {
        res.status(500).json({ success: false, error: "メール送信に失敗しました" });
      }
    } catch (error) {
      console.error("[EmailRoute] Approval request error:", error);
      res.status(500).json({ success: false, error: "サーバーエラーが発生しました" });
    }
  });

  // アポ編集時のメール通知エンドポイント
  app.post("/api/email/appointment-edit", async (req: Request, res: Response) => {
    try {
      const data = req.body as AppointmentEditEmailData;

      // バリデーション
      if (!data.partnerName || !data.projectTitle || !data.targetCompany || !data.appointmentId) {
        res.status(400).json({
          success: false,
          error: "必須項目が不足しています",
        });
        return;
      }

      const success = await sendAppointmentEditNotification(data);

      if (success) {
        res.json({ success: true, message: "編集通知メールを送信しました" });
      } else {
        res.status(500).json({ success: false, error: "メール送信に失敗しました" });
      }
    } catch (error) {
      console.error("[EmailRoute] Appointment edit error:", error);
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
