import path from 'node:path';
import { config as loadRootEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Monorepo: `.env` vive na raiz; o Next só carrega `apps/admin-frontend/.env*` por padrão.
// Hidratamos process.env antes do build pra ter NEXT_PUBLIC_API_URL etc.
const monorepoRoot = path.resolve(__dirname, '..', '..');
loadRootEnv({ path: path.join(monorepoRoot, '.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
