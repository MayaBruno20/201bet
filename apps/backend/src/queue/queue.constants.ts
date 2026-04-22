export const QUEUE_NAMES = {
  EMAIL: 'email',
} as const;

export const EMAIL_JOBS = {
  VERIFICATION: 'verification',
  PASSWORD_RESET: 'password-reset',
  PASSWORD_CHANGED: 'password-changed',
} as const;

export const EMAIL_JOB_PRIORITY = {
  [EMAIL_JOBS.PASSWORD_RESET]: 1,
  [EMAIL_JOBS.PASSWORD_CHANGED]: 2,
  [EMAIL_JOBS.VERIFICATION]: 3,
} as const;
