import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Regulamento Listas Brasil — 201bet',
  description: 'Regulamento oficial do Listas Brasil: TOP 10 e TOP 20, regra PAR/ÍMPAR, Rei, Shark Tank e homologação.',
};

export default function RegulamentoPage() {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-6 sm:p-8'>
          <div className='flex items-center gap-3 mb-3'>
            <span className='inline-flex items-center rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 px-3 py-1 text-[10px] font-bold tracking-widest text-[#d4a843]'>
              REGULAMENTO
            </span>
            <span className='text-xs text-white/40'>Listas Brasil · Temporada 2026</span>
          </div>
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Regulamento Listas Brasil</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            Este é o regulamento que rege a competição Listas Brasil — a disputa de titularidade das posições TOP 10 e
            TOP 20 das regiões (DDDs) em atividade. O conteúdo aqui reproduz, de forma resumida e orientativa, as
            regras vigentes que também guiam a geração de chaves e a operação de apostas do 201bet.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. Estrutura das Listas'>
            <p>
              Cada região homologada é representada por uma lista vinculada ao DDD (código de área). O formato da
              lista pode ser TOP 10 (10 titulares) ou TOP 20 (20 titulares), a critério do conselho da região e
              conforme o histórico de disputas.
            </p>
            <p>
              A lista é ordenada por posição, do 1º (Rei) ao último. A posição #1 é ocupada pelo atual Rei
              daquela região. As demais posições são defendidas sempre que desafiadas, respeitando a regra PAR/ÍMPAR.
            </p>
          </Section>

          <Section title='2. Como entrar na Lista — Shark Tank'>
            <p>
              Para assumir uma posição na lista, o piloto precisa passar pelo <strong>Shark Tank</strong> — fase
              classificatória em que o vencedor enfrenta o <strong>último colocado</strong> da lista em disputa (20º
              para TOP 20 ou 10º para TOP 10). Vencendo, o novo piloto assume a posição e o antigo titular deixa a
              lista.
            </p>
            <p>
              A inscrição do Shark Tank é coordenada pelo administrador/conselho da região e exige que o piloto
              atenda aos requisitos técnicos e regulamentares definidos pelo evento.
            </p>
          </Section>

          <Section title='3. Definição dos embates — PAR e ÍMPAR'>
            <p>
              Os confrontos de um evento (ex.: Lista 43, Lista 67) são determinados automaticamente a partir das
              posições ocupadas na lista, seguindo uma das duas grades:
            </p>

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <RoundCard
                title='Rodada ÍMPAR (ODD)'
                description='Os pilotos das posições ímpares desafiam as posições pares imediatamente abaixo. A posição #1 (Rei) e a última posição não entram nesta rodada.'
                rows={[
                  '19 × 18',
                  '17 × 16',
                  '15 × 14',
                  '13 × 12',
                  '11 × 10',
                  '9 × 8',
                  '7 × 6',
                  '5 × 4',
                  '3 × 2',
                ]}
              />
              <RoundCard
                title='Rodada PAR (EVEN)'
                description='Todas as posições competem: o 20º enfrenta o 19º, o 18º enfrenta o 17º e assim por diante até o embate 2 × 1, onde o Rei defende o título.'
                rows={[
                  '20 × 19',
                  '18 × 17',
                  '16 × 15',
                  '14 × 13',
                  '12 × 11',
                  '10 × 9',
                  '8 × 7',
                  '6 × 5',
                  '4 × 3',
                  '2 × 1',
                ]}
              />
            </div>

            <p className='text-xs text-white/50'>
              Para listas TOP 10, o mesmo princípio se aplica, reduzindo proporcionalmente (ÍMPAR: 9×8, 7×6, 5×4,
              3×2; PAR: 10×9, 8×7, 6×5, 4×3, 2×1).
            </p>
          </Section>

          <Section title='4. Substituições e ausências'>
            <p>
              Caso um piloto não compareça, esteja impedido de correr ou por qualquer outro motivo justificável, o
              administrador da região poderá, no painel administrativo, editar manualmente o embate — substituindo
              um dos lados por outro piloto da lista ou por um piloto convidado homologado.
            </p>
            <p>
              Toda substituição manual é auditada e o embate fica marcado como <em>ajuste administrativo</em> para
              transparência da casa e dos apostadores.
            </p>
          </Section>

          <Section title='5. Resultados e homologação'>
            <p>
              O resultado de cada embate é informado pelo administrador responsável pelo evento assim que a
              corrida é encerrada. O registro é <strong>imediato</strong> e dispara a liquidação automática dos
              mercados de apostas vinculados.
            </p>
            <p>
              Se o resultado for contestado, o administrador pode reverter o registro (com motivo registrado em
              auditoria), e a casa efetua os ajustes de estorno/correção dos bilhetes afetados.
            </p>
          </Section>

          <Section title='6. Apostas nas Listas'>
            <p>
              Os embates gerados a partir das Listas Brasil aparecem nesta plataforma assim que o evento é criado. A
              aposta, porém, só é liberada após o administrador <strong>abrir o mercado</strong> daquele embate —
              isto garante que o público e o piloto foram previamente homologados antes do início do booking.
            </p>
            <p>
              Odds, limites e regras específicas seguem as condições padrão da 201bet para corridas de arrancada:
              consulte o FAQ de apostas para detalhes.
            </p>
          </Section>

          <Section title='7. O título de Rei'>
            <p>
              O piloto que ocupa a posição #1 da lista é o Rei da região. Nas rodadas PAR, o Rei defende o título no
              último confronto (2 × 1). Nas rodadas ÍMPAR, o Rei não corre — mas a sua posição permanece em disputa
              caso um novo piloto venha a conquistar o direito ao embate pelo título em eventos especiais
              homologados.
            </p>
          </Section>

          <Section title='8. Disposições gerais'>
            <ul className='list-disc space-y-2 pl-5 text-sm text-white/70'>
              <li>A lista oficial de titulares é mantida por cada conselho/administrador regional.</li>
              <li>Alterações de titularidade são refletidas no sistema 201bet e ficam gravadas em auditoria.</li>
              <li>Qualquer divergência entre o regulamento da região e esta publicação deve ser comunicada ao suporte da 201bet.</li>
            </ul>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Este regulamento reproduz o conjunto de regras oficiais utilizadas pelo sistema de homologação da 201bet.
          Para consultar a versão integral em PDF, solicite ao suporte ou ao administrador da sua região.
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='rounded-2xl border border-white/10 bg-[#101525] p-6 sm:p-7'>
      <h2 className='text-xl font-semibold tracking-tight sm:text-2xl'>{title}</h2>
      <div className='mt-3 space-y-3 text-sm text-white/70 sm:text-base'>{children}</div>
    </section>
  );
}

function RoundCard({ title, description, rows }: { title: string; description: string; rows: string[] }) {
  return (
    <div className='rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4'>
      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>{title}</p>
      <p className='mt-1 text-sm text-white/60'>{description}</p>
      <ul className='mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-white/80 sm:text-sm'>
        {rows.map((r) => (
          <li key={r} className='rounded-lg border border-white/10 bg-white/5 px-2 py-1.5'>{r}</li>
        ))}
      </ul>
    </div>
  );
}
