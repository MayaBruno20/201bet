'use client';

import { I } from '@admin/components/ui/icons';
import { Page, Card } from '@admin/components/ui/primitives';

/**
 * "Eventos personalizados" não existe no backend atual da 201Bet.
 * Os tipos suportados hoje são:
 *   - Copa Categorias (em /eventos)
 *   - Listas Brasil (em /listas)
 *   - Armageddon (em /armageddon)
 *   - Mercados Multi-Runner (em /market-control para acompanhamento)
 *
 * Esta página fica como placeholder até o produto definir o que "personalizado"
 * significa pra 201Bet.
 */
export default function PersonalizadosPage() {
  return (
    <Page eyebrow="Operação" title="Eventos personalizados"
      sub="Tipos especiais fora dos formatos padrão.">
      <Card className="p-12 text-center max-w-2xl mx-auto">
        <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
          <I.Sparkles size={22} style={{ color: 'var(--accent)' }}/>
        </div>
        <div className="font-display text-[18px] font-semibold mt-4">Em breve</div>
        <div className="text-[13px] text-[color:var(--text-2)] mt-2 max-w-md mx-auto leading-relaxed">
          Eventos com formato customizado — fora de Copa Categorias, Listas Brasil e Armageddon — ainda
          não estão implementados no backend. Quando você quiser tipos novos (ex.: torneio convite,
          desafio direto), me chame que eu desenho a feature ponta-a-ponta.
        </div>
      </Card>
    </Page>
  );
}
