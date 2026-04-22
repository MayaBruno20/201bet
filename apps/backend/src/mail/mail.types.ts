export interface VerificationJobData {
  userId: string;
  email: string;
  userName: string;
  verificationUrl: string;
  expiresInHours: number;
}

export interface PasswordResetJobData {
  userId: string;
  email: string;
  userName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordChangedJobData {
  userId: string;
  email: string;
  userName: string;
  changedAtIso: string;
  ipAddress?: string;
}

export type AnyEmailJobData =
  | VerificationJobData
  | PasswordResetJobData
  | PasswordChangedJobData;

export interface SendVerificationArgs {
  userId: string;
  email: string;
  userName?: string | null;
  rawToken: string;
}

export interface SendPasswordResetArgs {
  userId: string;
  email: string;
  userName?: string | null;
  rawToken: string;
}

export interface SendPasswordChangedArgs {
  userId: string;
  email: string;
  userName?: string | null;
  ipAddress?: string;
}
