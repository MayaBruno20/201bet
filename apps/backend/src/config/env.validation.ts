import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3502),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  JWT_SECRET: Joi.string().min(1).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),

  CORS_ORIGIN: Joi.string().optional(),

  FRONTEND_URL: Joi.string().uri().required(),

  UPSTASH_REDIS_REST_URL: Joi.string().allow('').optional(),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().allow('').optional(),

  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),

  VALUT_API_KEY: Joi.string().allow('').optional(),
  VALUT_API_SECRET: Joi.string().allow('').optional(),
  VALUT_USERNAME: Joi.string().allow('').optional(),
  VALUT_PASSWORD: Joi.string().allow('').optional(),
  VALUT_WEBHOOK_SECRET: Joi.string().allow('').optional(),
  QUOTAGUARDSTATIC_URL: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').optional(),

  MARKET_SIMULATION_LEADER: Joi.string().valid('true', 'false').optional(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(3505),
  REDIS_USERNAME: Joi.string().allow('').optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TLS: Joi.string().valid('true', 'false').default('false'),

  EMAIL_PROVIDER: Joi.string()
    .valid('brevo', 'mailtrap', 'noop')
    .default('noop'),
  EMAIL_FROM_ADDRESS: Joi.string().email().required(),
  EMAIL_FROM_NAME: Joi.string().default('201Bet'),
  EMAIL_REPLY_TO: Joi.string().email().optional(),
  EMAIL_DAILY_LIMIT: Joi.number().integer().min(1).max(300).default(295),
  EMAIL_VERIFICATION_TTL_HOURS: Joi.number().integer().min(1).max(168).default(24),
  PASSWORD_RESET_TTL_MINUTES: Joi.number().integer().min(5).max(120).default(30),
  EMAIL_LOGO_URL: Joi.string().uri().allow('').optional(),

  BREVO_API_KEY: Joi.alternatives().conditional('EMAIL_PROVIDER', {
    is: 'brevo',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),

  MAILTRAP_SMTP_HOST: Joi.alternatives().conditional('EMAIL_PROVIDER', {
    is: 'mailtrap',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAILTRAP_SMTP_PORT: Joi.number().default(2525),
  MAILTRAP_SMTP_USER: Joi.alternatives().conditional('EMAIL_PROVIDER', {
    is: 'mailtrap',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  MAILTRAP_SMTP_PASS: Joi.alternatives().conditional('EMAIL_PROVIDER', {
    is: 'mailtrap',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
}).unknown(true);

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  CORS_ORIGIN?: string;
  FRONTEND_URL: string;

  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;

  GOOGLE_CLIENT_ID?: string;

  VALUT_API_KEY?: string;
  VALUT_API_SECRET?: string;
  VALUT_USERNAME?: string;
  VALUT_PASSWORD?: string;
  VALUT_WEBHOOK_SECRET?: string;
  QUOTAGUARDSTATIC_URL?: string;

  MARKET_SIMULATION_LEADER?: 'true' | 'false';

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_USERNAME?: string;
  REDIS_PASSWORD?: string;
  REDIS_TLS: 'true' | 'false';

  EMAIL_PROVIDER: 'brevo' | 'mailtrap' | 'noop';
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_DAILY_LIMIT: number;
  EMAIL_VERIFICATION_TTL_HOURS: number;
  PASSWORD_RESET_TTL_MINUTES: number;
  EMAIL_LOGO_URL?: string;

  BREVO_API_KEY?: string;

  MAILTRAP_SMTP_HOST?: string;
  MAILTRAP_SMTP_PORT: number;
  MAILTRAP_SMTP_USER?: string;
  MAILTRAP_SMTP_PASS?: string;
}
