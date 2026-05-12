import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Política de Privacidade — 201bet',
  description: 'Como a 201bet coleta, usa, armazena e protege seus dados pessoais nos termos da LGPD (Lei 13.709/2018).',
};

export default function PrivacidadePage() {
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
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Política de Privacidade</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            A 201bet trata seus dados pessoais com transparência e segurança, em conformidade com a{' '}
            <strong>Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)</strong>. Esta política descreve
            quais dados coletamos, por que coletamos, como protegemos e quais são os seus direitos como titular.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. Quem é o controlador'>
            <p>
              <strong>201bet Brasil LTDA</strong> é a controladora dos dados pessoais
              tratados nesta plataforma. Você pode entrar em contato com o nosso Encarregado de Dados (DPO) pelo e-mail{' '}
              <a className='text-[#d4a843] hover:underline' href='mailto:dpo@201bet.com'>dpo@201bet.com</a>.
            </p>
          </Section>

          <Section title='2. Quais dados coletamos'>
            <p>Coletamos exclusivamente os dados necessários para operar a plataforma com segurança:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Identificação:</strong> nome completo, CPF, data de nascimento, RG ou CNH (quando exigido para KYC).</li>
              <li><strong>Contato:</strong> e-mail, telefone, endereço residencial.</li>
              <li><strong>Financeiros:</strong> chave PIX, histórico de depósitos, saques e apostas.</li>
              <li><strong>Técnicos:</strong> endereço IP, tipo de dispositivo, navegador, identificadores de sessão.</li>
              <li><strong>Comportamentais:</strong> páginas visitadas, eventos de aposta, preferências de uso.</li>
              <li><strong>Comunicações:</strong> mensagens trocadas com o suporte, conteúdo de tickets.</li>
            </ul>
          </Section>

          <Section title='3. Bases legais para o tratamento'>
            <p>Tratamos seus dados com fundamento nas seguintes bases legais (art. 7º da LGPD):</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Execução de contrato</strong> (art. 7º, V): operar sua conta, processar apostas, depósitos e saques.</li>
              <li><strong>Cumprimento de obrigação legal</strong> (art. 7º, II): atender exigências da SPA/SECAP, COAF, Receita Federal e Banco Central — incluindo KYC, prevenção à lavagem de dinheiro e retenção de tributos.</li>
              <li><strong>Legítimo interesse</strong> (art. 7º, IX): prevenção a fraudes, segurança da plataforma e analytics agregado.</li>
              <li><strong>Consentimento</strong> (art. 7º, I): comunicações de marketing, cookies não essenciais.</li>
            </ul>
          </Section>

          <Section title='4. Como usamos seus dados'>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Criar e manter sua conta, processar apostas e pagamentos.</li>
              <li>Verificar identidade (KYC) e prevenir fraude e lavagem de dinheiro.</li>
              <li>Cumprir obrigações regulatórias (SPA/SECAP, COAF, Receita Federal).</li>
              <li>Atender suporte e responder a solicitações.</li>
              <li>Melhorar a plataforma com analytics agregado e anônimo.</li>
              <li>Enviar comunicações operacionais (extratos, confirmações) — sempre permitidas.</li>
              <li>Enviar comunicações de marketing — apenas com seu consentimento, e revogável a qualquer momento.</li>
            </ul>
          </Section>

          <Section title='5. Compartilhamento com terceiros'>
            <p>Compartilhamos dados estritamente quando necessário, com terceiros que mantêm padrão equivalente de proteção:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Provedores de pagamento</strong> (gateways PIX, instituições financeiras).</li>
              <li><strong>Provedores de KYC</strong> (validação de CPF, RG, biometria).</li>
              <li><strong>Provedores de infraestrutura</strong> (hospedagem em nuvem, banco de dados, observabilidade).</li>
              <li><strong>Autoridades públicas</strong> quando exigido por lei (COAF, Receita Federal, ordem judicial).</li>
              <li><strong>Auditoria externa</strong> exigida pela SPA/SECAP, sob acordo de confidencialidade.</li>
            </ul>
            <p>
              <strong>Não vendemos seus dados.</strong> Não compartilhamos com anunciantes para perfilamento publicitário.
            </p>
          </Section>

          <Section title='6. Armazenamento e prazo de retenção'>
            <p>
              Seus dados são armazenados em servidores no Brasil e/ou em países que oferecem grau de proteção
              equivalente, com criptografia em trânsito (TLS) e em repouso.
            </p>
            <p>Prazos mínimos de retenção:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Cadastro e KYC:</strong> 5 anos após o encerramento da conta (exigência regulatória).</li>
              <li><strong>Histórico financeiro:</strong> 10 anos (Código Civil e legislação fiscal).</li>
              <li><strong>Logs de acesso e auditoria:</strong> 6 meses a 5 anos, conforme a finalidade.</li>
              <li><strong>Comunicações de suporte:</strong> 2 anos após a resolução do ticket.</li>
            </ul>
            <p>Após o prazo, os dados são anonimizados ou excluídos.</p>
          </Section>

          <Section title='7. Seus direitos como titular'>
            <p>Conforme o art. 18 da LGPD, você pode, a qualquer momento, solicitar:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>Confirmação</strong> da existência de tratamento.</li>
              <li><strong>Acesso</strong> aos seus dados.</li>
              <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados.</li>
              <li><strong>Anonimização, bloqueio ou eliminação</strong> de dados desnecessários ou tratados em desacordo com a LGPD.</li>
              <li><strong>Portabilidade</strong> a outro fornecedor de serviço.</li>
              <li><strong>Eliminação</strong> de dados tratados com base em consentimento.</li>
              <li><strong>Informação</strong> sobre as entidades públicas e privadas com as quais compartilhamos seus dados.</li>
              <li><strong>Revogação do consentimento</strong> a qualquer momento.</li>
              <li><strong>Oposição</strong> a tratamento realizado com fundamento em uma das hipóteses de dispensa de consentimento, em caso de descumprimento da LGPD.</li>
            </ul>
            <p>
              Para exercer seus direitos, envie um pedido para{' '}
              <a className='text-[#d4a843] hover:underline' href='mailto:dpo@201bet.com'>dpo@201bet.com</a>{' '}
              com o assunto "Solicitação LGPD". Respondemos em até <strong>15 dias úteis</strong>.
            </p>
          </Section>

          <Section title='8. Segurança da informação'>
            <p>Adotamos medidas técnicas e organizacionais proporcionais ao risco:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Criptografia TLS 1.3 para transmissão de dados.</li>
              <li>Senhas armazenadas com hash bcrypt (sem possibilidade de reversão).</li>
              <li>Autenticação em dois fatores (2FA) opcional para usuários e obrigatória para painel administrativo.</li>
              <li>Segregação de ambientes (produção, homologação, desenvolvimento).</li>
              <li>Auditoria de acesso aos dados (logs imutáveis).</li>
              <li>Treinamento contínuo da equipe sobre LGPD e segurança da informação.</li>
            </ul>
          </Section>

          <Section title='9. Cookies'>
            <p>
              Usamos cookies para funcionamento da plataforma, segurança e analytics. Consulte nossa{' '}
              <a className='text-[#d4a843] hover:underline' href='/cookies'>Política de Cookies</a> para detalhes
              completos e gerenciamento.
            </p>
          </Section>

          <Section title='10. Crianças e adolescentes'>
            <p>
              A 201bet é uma plataforma <strong>exclusivamente para maiores de 18 anos</strong>. Não coletamos
              intencionalmente dados de menores. Caso identifiquemos um cadastro de menor, a conta é encerrada e os
              dados eliminados.
            </p>
          </Section>

          <Section title='11. Alterações nesta política'>
            <p>
              Esta política pode ser atualizada para refletir mudanças regulatórias ou operacionais. Notificamos
              alterações relevantes por e-mail e/ou banner na plataforma. A data de "Última atualização" no topo desta
              página reflete a versão vigente.
            </p>
          </Section>

          <Section title='12. Reclamação à ANPD'>
            <p>
              Se entender que seus direitos não foram atendidos, você pode peticionar à Autoridade Nacional de
              Proteção de Dados (ANPD) em{' '}
              <a className='text-[#d4a843] hover:underline' href='https://www.gov.br/anpd' target='_blank' rel='noopener noreferrer'>
                www.gov.br/anpd
              </a>.
            </p>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Em caso de dúvidas, contate nosso Encarregado de Dados em{' '}
          <a className='text-[#d4a843] hover:underline' href='mailto:dpo@201bet.com'>dpo@201bet.com</a>.
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
