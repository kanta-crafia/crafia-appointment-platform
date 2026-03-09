import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export type AppointmentEmailData = {
  partnerName: string;
  projectTitle: string;
  targetCompany: string;
  contactPerson: string | null;
  meetingDatetime: string;
  notes: string | null;
  evidenceUrl: string | null;
};

/**
 * アポ登録時に管理者へメール通知を送信する
 */
export async function sendAppointmentNotification(
  data: AppointmentEmailData
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const gmailUser = process.env.GMAIL_USER;

  if (!adminEmail || !gmailUser) {
    console.warn("[Email] ADMIN_EMAIL or GMAIL_USER is not configured");
    return false;
  }

  const meetingDate = new Date(data.meetingDatetime);
  const formattedDate = meetingDate.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  const subject = `【Crafia】新規アポ登録: ${data.targetCompany} - ${data.projectTitle}`;

  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">📋 新規アポイント登録通知</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; margin-top: 0;">パートナーから新しいアポイントが登録されました。</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600; width: 140px;">パートナー</td>
            <td style="padding: 12px 8px; color: #111827;">${data.partnerName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">案件名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.projectTitle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">対象企業</td>
            <td style="padding: 12px 8px; color: #111827; font-weight: 600;">${data.targetCompany}</td>
          </tr>
          ${data.contactPerson ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">担当者名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.contactPerson}</td>
          </tr>
          ` : ""}
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">商談日時</td>
            <td style="padding: 12px 8px; color: #111827;">${formattedDate}</td>
          </tr>
          ${data.notes ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">メモ</td>
            <td style="padding: 12px 8px; color: #111827;">${data.notes}</td>
          </tr>
          ` : ""}
          ${data.evidenceUrl ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">証跡URL</td>
            <td style="padding: 12px 8px;"><a href="${data.evidenceUrl}" style="color: #16a34a;">${data.evidenceUrl}</a></td>
          </tr>
          ` : ""}
        </table>

        <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
          ※ このメールはCrafia アポ管理システムから自動送信されています。
        </p>
      </div>
    </div>
  `;

  const textBody = `
【Crafia】新規アポイント登録通知

パートナーから新しいアポイントが登録されました。

■ パートナー: ${data.partnerName}
■ 案件名: ${data.projectTitle}
■ 対象企業: ${data.targetCompany}
${data.contactPerson ? `■ 担当者名: ${data.contactPerson}\n` : ""}■ 商談日時: ${formattedDate}
${data.notes ? `■ メモ: ${data.notes}\n` : ""}${data.evidenceUrl ? `■ 証跡URL: ${data.evidenceUrl}\n` : ""}
※ このメールはCrafia アポ管理システムから自動送信されています。
  `.trim();

  try {
    await transporter.sendMail({
      from: `"Crafia アポ管理" <${gmailUser}>`,
      to: adminEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`[Email] Appointment notification sent to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send appointment notification:", error);
    return false;
  }
}

export type ApprovalRequestEmailData = {
  partnerName: string;
  projectTitle: string;
  targetCompany: string;
  contactPerson: string | null;
  meetingDatetime: string;
  appointmentId: string;
};

/**
 * 承認再要求メールを管理者に送信する
 */
export async function sendApprovalRequestNotification(
  data: ApprovalRequestEmailData
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const gmailUser = process.env.GMAIL_USER;

  if (!adminEmail || !gmailUser) {
    console.warn("[Email] ADMIN_EMAIL or GMAIL_USER is not configured");
    return false;
  }

  const meetingDate = new Date(data.meetingDatetime);
  const formattedDate = meetingDate.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  const subject = `【Crafia】承認要求: ${data.targetCompany} - ${data.projectTitle}`;

  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">⏰ アポイント承認要求</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; margin-top: 0;">パートナーからアポイントの承認が要求されています。確認をお願いいたします。</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600; width: 140px;">パートナー</td>
            <td style="padding: 12px 8px; color: #111827;">${data.partnerName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">案件名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.projectTitle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">先方企業名</td>
            <td style="padding: 12px 8px; color: #111827; font-weight: 600;">${data.targetCompany}</td>
          </tr>
          ${data.contactPerson ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">先方担当者名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.contactPerson}</td>
          </tr>
          ` : ""}
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">商談日時</td>
            <td style="padding: 12px 8px; color: #111827;">${formattedDate}</td>
          </tr>
        </table>

        <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
          ※ このメールはCrafia アポ管理システムから自動送信されています。
        </p>
      </div>
    </div>
  `;

  const textBody = `
【Crafia】アポイント承認要求

パートナーからアポイントの承認が要求されています。確認をお願いいたします。

■ パートナー: ${data.partnerName}
■ 案件名: ${data.projectTitle}
■ 先方企業名: ${data.targetCompany}
${data.contactPerson ? `■ 先方担当者名: ${data.contactPerson}\n` : ""}■ 商談日時: ${formattedDate}

※ このメールはCrafia アポ管理システムから自動送信されています。
  `.trim();

  try {
    await transporter.sendMail({
      from: `"Crafia アポ管理" <${gmailUser}>`,
      to: adminEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`[Email] Approval request notification sent to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send approval request notification:", error);
    return false;
  }
}

export type AppointmentEditEmailData = {
  partnerName: string;
  projectTitle: string;
  targetCompany: string;
  contactPerson: string | null;
  meetingDatetime: string;
  notes: string | null;
  acquisitionDate: string | null;
  acquirerName: string | null;
  appointmentId: string;
  changes: string;
};

/**
 * アポ編集時に管理者へメール通知を送信する
 */
export async function sendAppointmentEditNotification(
  data: AppointmentEditEmailData
): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const gmailUser = process.env.GMAIL_USER;

  if (!adminEmail || !gmailUser) {
    console.warn("[Email] ADMIN_EMAIL or GMAIL_USER is not configured");
    return false;
  }

  const meetingDate = new Date(data.meetingDatetime);
  const formattedDate = meetingDate.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  const subject = `【Crafia】アポ修正通知: ${data.targetCompany} - ${data.projectTitle}`;

  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">✏️ アポイント修正通知</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #374151; margin-top: 0;">パートナーがアポイント情報を修正しました。確認をお願いいたします。</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600; width: 140px;">パートナー</td>
            <td style="padding: 12px 8px; color: #111827;">${data.partnerName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">案件名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.projectTitle}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">先方企業名</td>
            <td style="padding: 12px 8px; color: #111827; font-weight: 600;">${data.targetCompany}</td>
          </tr>
          ${data.contactPerson ? `
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">先方担当者名</td>
            <td style="padding: 12px 8px; color: #111827;">${data.contactPerson}</td>
          </tr>
          ` : ""}
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">商談日時</td>
            <td style="padding: 12px 8px; color: #111827;">${formattedDate}</td>
          </tr>
          <tr style="border-bottom: 1px solid #f3f4f6;">
            <td style="padding: 12px 8px; color: #6b7280; font-weight: 600;">変更内容</td>
            <td style="padding: 12px 8px; color: #3b82f6;">${data.changes}</td>
          </tr>
        </table>

        <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
          ※ このメールはCrafia アポ管理システムから自動送信されています。
        </p>
      </div>
    </div>
  `;

  const textBody = `
【Crafia】アポイント修正通知

パートナーがアポイント情報を修正しました。確認をお願いいたします。

■ パートナー: ${data.partnerName}
■ 案件名: ${data.projectTitle}
■ 先方企業名: ${data.targetCompany}
${data.contactPerson ? `■ 先方担当者名: ${data.contactPerson}\n` : ""}■ 商談日時: ${formattedDate}
■ 変更内容: ${data.changes}

※ このメールはCrafia アポ管理システムから自動送信されています。
  `.trim();

  try {
    await transporter.sendMail({
      from: `"Crafia アポ管理" <${gmailUser}>`,
      to: adminEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    console.log(`[Email] Appointment edit notification sent to ${adminEmail}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send appointment edit notification:", error);
    return false;
  }
}

/**
 * メール送信の接続テスト
 */
export async function verifyEmailConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    console.log("[Email] SMTP connection verified successfully");
    return true;
  } catch (error) {
    console.error("[Email] SMTP connection verification failed:", error);
    return false;
  }
}
