import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Política de Cookies — Palpite201',
  description: 'Como a Palpite201 usa cookies e tecnologias similares para operar a plataforma com segurança e melhorar sua experiência.',
};

export default function CookiesPage() {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-6 sm:p-8'>
          <div className='flex items-center gap-3 mb-3'>
            <span className='inline-flex items-center rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 px-3 py-1 text-[10px] font-bold tracking-widest text-[#d4a843]'>
              LEGAL
            </span>
            <span className='text-xs text-white/40'>Última atualização: 12/05/2026</span>
          </div>
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Política de Cookies</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            Esta política explica o que são cookies, como a Palpite201 os utiliza e como você pode gerenciá-los. Para
            entender o tratamento mais amplo dos seus dados pessoais, consulte também a{' '}
            <a className='text-[#d4a843] hover:underline' href='/privacidade'>Política de Privacidade</a>.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. O que são cookies'>
            <p>
              Cookies são pequenos arquivos de texto armazenados no seu navegador quando você visita um site. Eles
              permitem reconhecer o dispositivo entre sessões, manter você logado, lembrar preferências e medir o uso
              da plataforma. Tecnologias similares (localStorage, sessionStorage, pixels) seguem o mesmo princípio e
              estão incluídas nesta política.
            </p>
          </Section>

          <Section title='2. Tipos de cookies que usamos'>
            <div className='space-y-4'>
              <CookieGroup
                badge='ESSENCIAIS'
                badgeClass='bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                title='Estritamente necessários'
                description='Sem estes cookies a plataforma não funciona. Não exigem consentimento (art. 7º, V e VI da LGPD — execução de contrato e segurança).'
                examples={[
                  'Sessão de login (cookie httpOnly que mantém você autenticado).',
                  'Token CSRF para proteção contra cross-site request forgery.',
                  'Preferências de moeda e idioma.',
                  'Equilíbrio de carga e roteamento de servidor.',
                ]}
              />

              <CookieGroup
                badge='SEGURANÇA'
                badgeClass='bg-sky-500/15 text-sky-300 border-sky-500/30'
                title='Detecção de fraude e bot'
                description='Identificam dispositivos suspeitos, padrões de bot e tentativas de uso indevido. Base legal: legítimo interesse (art. 7º, IX da LGPD).'
                examples={[
                  'Fingerprint de dispositivo (identificador anônimo do hardware/browser).',
                  'Histórico de IPs e geolocalização aproximada.',
                  'Sinais comportamentais (cadência de cliques, anomalias).',
                ]}
              />

              <CookieGroup
                badge='ANALYTICS'
                badgeClass='bg-amber-500/15 text-amber-300 border-amber-500/30'
                title='Métricas de uso (agregadas)'
                description='Medem desempenho, páginas mais acessadas e funis. Os dados são agregados e anonimizados antes de qualquer análise. Pode ser desativado.'
                examples={[
                  'Contadores anônimos de eventos (clique em "Apostar", abertura de página).',
                  'Tempo de carregamento e erros de frontend.',
                ]}
              />

              <CookieGroup
                badge='MARKETING'
                badgeClass='bg-rose-500/15 text-rose-300 border-rose-500/30'
                title='Comunicação e remarketing'
                description='Apenas com seu consentimento explícito. Permitem personalizar comunicações e medir campanhas. Você pode revogar a qualquer momento.'
                examples={[
                  'Pixel de campanha (apenas se você consentir no banner inicial).',
                  'Identificação de origem da visita (UTM).',
                ]}
              />
            </div>
          </Section>

          <Section title='3. Cookies de terceiros'>
            <p>
              Alguns recursos da plataforma utilizam serviços de terceiros que podem definir seus próprios cookies:
            </p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Provedor de pagamento PIX</strong> — necessário para concluir depósitos e saques.</li>
              <li><strong>Provedor de KYC</strong> — para validação de identidade durante o cadastro.</li>
              <li><strong>Hospedagem em nuvem</strong> — cookies de balanceamento e cache.</li>
            </ul>
            <p>
              A Palpite201 contrata terceiros que aderem à LGPD e mantêm cláusulas contratuais de proteção de dados.
              Consulte a política de cada parceiro para detalhes do tratamento.
            </p>
          </Section>

          <Section title='4. Como gerenciar cookies'>
            <p>
              Você pode controlar cookies pelas configurações do seu navegador. Bloquear cookies essenciais, porém,
              torna o login e o uso da plataforma inviável.
            </p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>
                <strong>Chrome:</strong> Configurações → Privacidade e segurança → Cookies e outros dados do site.
              </li>
              <li>
                <strong>Firefox:</strong> Preferências → Privacidade e Segurança → Cookies e dados do site.
              </li>
              <li>
                <strong>Safari:</strong> Preferências → Privacidade → Cookies e dados de site.
              </li>
              <li>
                <strong>Edge:</strong> Configurações → Cookies e permissões de site.
              </li>
            </ul>
            <p>
              Para cookies de analytics e marketing, você também pode revogar o consentimento a qualquer momento em{' '}
              <strong>Meu Perfil → Privacidade</strong> dentro da plataforma.
            </p>
          </Section>

          <Section title='5. Quanto tempo os cookies permanecem'>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Cookies de sessão</strong> são apagados quando você fecha o navegador.</li>
              <li><strong>Cookies persistentes</strong> permanecem por períodos variáveis (de 1 dia a 12 meses) conforme a finalidade. Veja a duração exata no inspetor do seu navegador.</li>
              <li>Você pode apagar todos os cookies a qualquer momento — sua próxima visita criará novos cookies essenciais.</li>
            </ul>
          </Section>

          <Section title='6. Alterações nesta política'>
            <p>
              Esta política pode ser atualizada periodicamente. Notificamos alterações relevantes na plataforma. A
              data de "Última atualização" reflete a versão vigente.
            </p>
          </Section>

          <Section title='7. Contato'>
            <p>
              Dúvidas sobre cookies ou privacidade podem ser enviadas para{' '}
              <a className='text-[#d4a843] hover:underline' href='mailto:dpo@201bet.com'>dpo@201bet.com</a>.
            </p>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Esta política deve ser lida em conjunto com nossa{' '}
          <a className='text-[#d4a843] hover:underline' href='/privacidade'>Política de Privacidade</a> e{' '}
          <a className='text-[#d4a843] hover:underline' href='/termos'>Termos de Uso</a>.
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

function CookieGroup({
  badge,
  badgeClass,
  title,
  description,
  examples,
}: {
  badge: string;
  badgeClass: string;
  title: string;
  description: string;
  examples: string[];
}) {
  return (
    <div className='rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-4'>
      <div className='flex flex-wrap items-center gap-2 mb-2'>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-widest ${badgeClass}`}>
          {badge}
        </span>
        <p className='text-sm font-semibold text-white/90'>{title}</p>
      </div>
      <p className='text-sm text-white/60'>{description}</p>
      <ul className='mt-3 list-disc space-y-1 pl-5 text-xs text-white/60'>
        {examples.map((e) => <li key={e}>{e}</li>)}
      </ul>
    </div>
  );
}
