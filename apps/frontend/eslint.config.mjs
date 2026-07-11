import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Ajuste de severidade para o build/deploy não travar em regras cosméticas
    // ou nas regras novas/agressivas do React Compiler (violações pré-existentes
    // no site/animações/admin). Continuam visíveis como aviso.
    rules: {
      // Cosmética: aspas/apóstrofos em texto JSX não precisam ser escapados.
      'react/no-unescaped-entities': 'off',
      // React Compiler (novas, agressivas) → aviso.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      // Pré-existentes → aviso (não bloqueiam o deploy).
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
