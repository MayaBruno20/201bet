import path from 'node:path';
import { config as loadRootEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Monorepo: variáveis como NEXT_PUBLIC_* ficam no `.env` da raiz; o Next só carrega
// `apps/frontend/.env*` por padrão (cwd do processo). Hidrata process.env antes do build.
const monorepoRoot = path.resolve(__dirname, '..', '..');
loadRootEnv({ path: path.join(monorepoRoot, '.env') });

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
