import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Política Antifraude — Palpite201',
  description: 'Como a Palpite201 detecta, previne e age sobre fraudes, lavagem de dinheiro, combinação de resultados e abuso de plataforma.',
};

export default function AntifraudePage() {
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
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Política Antifraude</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            A Palpite201 adota uma postura de <strong>tolerância zero</strong> com fraude, manipulação de resultados,
            lavagem de dinheiro e qualquer comportamento que comprometa a integridade da plataforma ou prejudique
            outros apostadores. Esta política descreve o que monitoramos, como agimos e o que esperamos do
            usuário.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. Tipos de conduta monitorada'>
            <p>Consideramos fraude (não exaustivamente):</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Identidade falsa:</strong> cadastro com CPF de terceiro, documentos adulterados, biometria divergente.</li>
              <li><strong>Múltiplas contas:</strong> mesmo titular com duas ou mais contas, ou contas operadas em conluio.</li>
              <li><strong>Combinação de resultados (match-fixing):</strong> apostas com base em arranjo prévio entre piloto, equipe ou organização.</li>
              <li><strong>Insider betting:</strong> apostas feitas com informação privilegiada sobre o evento.</li>
              <li><strong>Bots e automação:</strong> uso de scripts para apostar, capturar odds ou explorar latência.</li>
              <li><strong>Lavagem de dinheiro:</strong> depósitos seguidos de saques sem padrão real de aposta (smurfing, layering).</li>
              <li><strong>Chargeback fraudulento:</strong> disputar depósito legítimo após uso do saldo.</li>
              <li><strong>Phishing/engenharia social</strong> contra outros usuários ou contra a equipe da Palpite201.</li>
              <li><strong>Abuso de bônus</strong> ou de campanhas promocionais.</li>
            </ul>
          </Section>

          <Section title='2. Sistema de detecção'>
            <p>Combinamos múltiplas camadas:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Validação cadastral</strong> com Receita Federal e bases públicas (veja a Política de KYC).</li>
              <li><strong>Fingerprinting de dispositivo</strong> para identificar reutilização de hardware em múltiplas contas.</li>
              <li><strong>Análise de IP, geolocalização e ASN</strong> — incluindo bloqueio de VPNs e proxies de risco.</li>
              <li><strong>Modelo de risco comportamental:</strong> velocidade, volume, distribuição de stake e padrões de cliques.</li>
              <li><strong>Monitoramento de mercados:</strong> volume atípico em embates de baixa liquidez, mudanças bruscas em odds.</li>
              <li><strong>Cruzamento financeiro:</strong> CPF do PIX × CPF do cadastro × CPF da chave de saída.</li>
              <li><strong>Listas restritivas:</strong> autoexclusão, sanções nacionais e internacionais, PEP.</li>
              <li><strong>Equipe de revisão humana</strong> para casos sinalizados pelos modelos.</li>
            </ul>
          </Section>

          <Section title='3. Ações tomadas'>
            <p>Conforme a gravidade e a evidência:</p>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
              <ActionCard
                level='BAIXO'
                color='emerald'
                description='Sinal isolado, requer apenas verificação adicional.'
                actions={['Solicitação de documento extra', 'Limitação temporária de saque', 'Notificação ao titular']}
              />
              <ActionCard
                level='MÉDIO'
                color='amber'
                description='Padrão suspeito persistente ou evidência circunstancial.'
                actions={['Bloqueio preventivo da conta', 'Suspensão de saques até auditoria', 'Solicitação de comprovação de origem dos recursos']}
              />
              <ActionCard
                level='ALTO'
                color='rose'
                description='Fraude confirmada ou exigência regulatória.'
                actions={['Encerramento da conta', 'Retenção do saldo para apuração', 'Comunicação ao COAF e SPA/SECAP', 'Cooperação com autoridades policiais']}
              />
            </div>
          </Section>

          <Section title='4. Estorno e retenção de saldo'>
            <p>
              Quando fraude é confirmada, a Palpite201 pode reter o saldo da conta para apuração e, conforme o caso,
              estornar apostas, bloquear saques e aplicar as medidas previstas nos{' '}
              <a className='text-[#d4a843] hover:underline' href='/termos'>Termos de Uso</a>.
            </p>
            <p>
              Em casos de lavagem de dinheiro ou financiamento ao terrorismo, os recursos podem ser retidos
              indefinidamente até decisão judicial ou administrativa competente, conforme a Lei nº 9.613/1998.
            </p>
          </Section>

          <Section title='5. Comunicação obrigatória às autoridades'>
            <p>
              A Palpite201 é obrigada por lei a comunicar operações suspeitas ao <strong>COAF</strong> (Conselho de
              Controle de Atividades Financeiras), à <strong>SPA/SECAP</strong> (Secretaria de Prêmios e Apostas
              do Ministério da Fazenda) e a outras autoridades quando exigido — inclusive sem aviso prévio ao
              titular, nos termos da legislação.
            </p>
            <p>
              Sigilo bancário e proteção de dados não impedem a colaboração com autoridades nos limites da lei.
            </p>
          </Section>

          <Section title='6. Combinação de resultados (match-fixing)'>
            <p>
              A Palpite201 trabalha em parceria com organizadores de corridas, conselhos regionais e administradores de
              Listas Brasil para identificar tentativas de manipulação. Apostas suspeitas em embates de baixa
              liquidez são sinalizadas em tempo real e podem ser <strong>suspensas, anuladas e estornadas</strong>{' '}
              antes da liquidação.
            </p>
            <p>
              Pilotos, equipes técnicas, organizadores e seus familiares próximos não podem apostar em eventos dos
              quais participem direta ou indiretamente. Violações resultam em encerramento e comunicação ao
              regulador.
            </p>
          </Section>

          <Section title='7. Bônus e promoções'>
            <p>
              Bônus oferecidos pela Palpite201 têm regras de rollover e elegibilidade descritas no momento da
              concessão. É proibido:
            </p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Criar contas para resgatar bônus de cadastro repetidamente.</li>
              <li>Apostar em mercados opostos do mesmo embate para concluir rollover sem risco.</li>
              <li>Compartilhar contas em conluio para acumular benefícios promocionais.</li>
            </ul>
            <p>Bônus obtidos com violação são confiscados e a conta pode ser encerrada.</p>
          </Section>

          <Section title='8. Como denunciar'>
            <p>
              Se você suspeita de fraude, manipulação de resultados ou uso indevido da sua conta, comunique
              imediatamente:
            </p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>
                <strong>E-mail:</strong>{' '}
                <a className='text-[#d4a843] hover:underline' href='mailto:antifraude@201bet.com'>antifraude@201bet.com</a>
              </li>
              <li>
                <strong>Canal anônimo:</strong> formulário em Meu Perfil → Segurança → Reportar incidente.
              </li>
            </ul>
            <p>
              Denúncias são tratadas com confidencialidade e podem ser feitas anonimamente. A Palpite201 não retalia
              denunciantes de boa-fé.
            </p>
          </Section>

          <Section title='9. Boas práticas para o usuário'>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Use uma senha forte e única, ative o 2FA.</li>
              <li>Não compartilhe credenciais nem deixe a conta logada em dispositivos públicos.</li>
              <li>Cadastre a chave PIX no seu próprio CPF.</li>
              <li>Desconfie de mensagens pedindo seus dados de login ou códigos 2FA — a Palpite201 nunca solicita esses dados por e-mail, WhatsApp ou telefone.</li>
              <li>Acesse a plataforma apenas pelos domínios oficiais.</li>
              <li>Em caso de e-mail estranho de "suporte Palpite201", confirme em{' '}
                <a className='text-[#d4a843] hover:underline' href='mailto:suporte@201bet.com'>suporte@201bet.com</a>{' '}
                antes de agir.
              </li>
            </ul>
          </Section>

          <Section title='10. Atualização desta política'>
            <p>
              A política antifraude evolui com a operação e com a regulação. Atualizações relevantes são
              comunicadas na plataforma. A data de "Última atualização" reflete a versão vigente.
            </p>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Esta política se aplica a todos os usuários e parceiros operacionais. Em caso de divergência com os{' '}
          <a className='text-[#d4a843] hover:underline' href='/termos'>Termos de Uso</a>, prevalece o disposto na
          legislação brasileira aplicável.
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

function ActionCard({
  level,
  color,
  description,
  actions,
}: {
  level: string;
  color: 'emerald' | 'amber' | 'rose';
  description: string;
  actions: string[];
}) {
  const tones: Record<typeof color, { border: string; bg: string; text: string; dot: string }> = {
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-300', dot: 'bg-emerald-300' },
    amber: { border: 'border-amber-400/30', bg: 'bg-amber-500/10', text: 'text-amber-300', dot: 'bg-amber-300' },
    rose: { border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-300', dot: 'bg-rose-300' },
  };
  const tone = tones[color];
  return (
    <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${tone.text}`}>Risco {level}</p>
      <p className='mt-2 text-sm text-white/80'>{description}</p>
      <ul className='mt-3 space-y-1.5 text-xs text-white/70'>
        {actions.map((a) => (
          <li key={a} className='flex gap-2'>
            <span className={`mt-1 inline-block h-1 w-1 shrink-0 rounded-full ${tone.dot}`} />
            <span>{a}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
