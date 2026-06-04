import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Política de KYC — Palpite201',
  description: 'Como a Palpite201 verifica identidade (Know Your Customer) para cumprir a Lei 14.790/2023, prevenir lavagem de dinheiro e proteger sua conta.',
};

export default function KycPage() {
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
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Política de KYC</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            A Palpite201 adota procedimentos de <strong>Know Your Customer (KYC)</strong> para identificar e verificar
            cada apostador antes de movimentar saldo. A política cumpre a <strong>Lei nº 14.790/2023</strong>
            (regulamentação das apostas de quota fixa), a <strong>Lei nº 9.613/1998</strong> (prevenção à lavagem
            de dinheiro) e as normativas da SPA/SECAP do Ministério da Fazenda e do COAF.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. Por que fazemos KYC'>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Cumprir exigência legal — operadoras autorizadas pela SPA/SECAP só podem aceitar apostadores identificados.</li>
              <li>Garantir que cada conta pertence a um titular real, maior de idade e elegível.</li>
              <li>Prevenir lavagem de dinheiro, financiamento ao terrorismo e fraude com identidade.</li>
              <li>Proteger o usuário contra acesso indevido à sua própria conta.</li>
              <li>Permitir saques ao mesmo CPF do titular, sem desvios para terceiros.</li>
            </ul>
          </Section>

          <Section title='2. Quando o KYC é solicitado'>
            <p>O KYC é aplicado em três momentos:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>
                <strong>Cadastro inicial:</strong> validação automática de CPF na Receita Federal e cruzamento de
                nome, data de nascimento e endereço.
              </li>
              <li>
                <strong>Primeiro saque ou saque acima de R$ 5.000:</strong> envio de selfie com documento e prova
                de residência atualizada (últimos 3 meses).
              </li>
              <li>
                <strong>Sinais de risco</strong> (apostas atípicas, divergência cadastral, suspeita de identidade de
                terceiros): re-verificação obrigatória, com bloqueio preventivo até a conclusão.
              </li>
            </ul>
          </Section>

          <Section title='3. Documentos aceitos'>
            <p>Em ordem de preferência:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>RG</strong> (frente e verso, dentro da validade ou sem prazo de validade).</li>
              <li><strong>CNH</strong> (dentro da validade).</li>
              <li><strong>Passaporte</strong> (apenas para brasileiros residentes no exterior em casos específicos).</li>
              <li><strong>CTPS digital</strong> (válida quando contém foto, nome, CPF e RG).</li>
            </ul>
            <p>Para comprovação de residência:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Conta de luz, água, gás, telefone ou internet (últimos 3 meses).</li>
              <li>Fatura de cartão de crédito ou extrato bancário com endereço.</li>
              <li>Contrato de aluguel registrado em cartório.</li>
              <li>Declaração de imposto de renda do exercício corrente.</li>
            </ul>
          </Section>

          <Section title='4. Verificações realizadas'>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>CPF na Receita Federal:</strong> situação cadastral regular.</li>
              <li><strong>Nome × CPF:</strong> conferência cruzada com bases oficiais.</li>
              <li><strong>Idade:</strong> idade ≥ 18 anos na data do cadastro.</li>
              <li><strong>Liveness e biometria facial:</strong> selfie com prova de vida, comparada com a foto do documento.</li>
              <li><strong>Listas restritivas:</strong> PEP (Pessoa Politicamente Exposta), sanções, autoexclusão, listas de fraude.</li>
              <li><strong>Chave PIX:</strong> precisa ser do CPF do titular para depósitos e saques.</li>
            </ul>
          </Section>

          <Section title='5. Pessoa Politicamente Exposta (PEP)'>
            <p>
              Conforme a Resolução COAF nº 50/2022, identificamos apostadores que se enquadrem na definição de PEP
              e aplicamos diligência reforçada — incluindo limites de aposta diferenciados, monitoramento aprimorado
              e aprovação adicional para movimentações relevantes.
            </p>
            <p>
              O enquadramento como PEP <strong>não impede o uso da plataforma</strong>; apenas exige controles
              extras conforme a legislação.
            </p>
          </Section>

          <Section title='6. Recusa ou inconsistência'>
            <p>Se a verificação retornar inconsistência, a Palpite201 pode:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Solicitar documentação adicional.</li>
              <li>Suspender temporariamente saques até a conclusão da análise.</li>
              <li>Encerrar a conta nos casos de fraude confirmada (com estorno apenas do valor depositado pelo CPF de origem, descontados eventuais valores já liquidados em apostas).</li>
              <li>Comunicar ao COAF e/ou à SPA/SECAP nos termos da lei.</li>
            </ul>
            <p>
              Você é notificado por e-mail em cada etapa e pode acompanhar o status do KYC pelo painel{' '}
              <strong>Meu Perfil → Verificação</strong>.
            </p>
          </Section>

          <Section title='7. Atualização de dados'>
            <p>
              Você é responsável por manter seu cadastro atualizado. Alterações de nome, endereço, telefone ou chave
              PIX podem disparar uma nova verificação. Em caso de alteração de CPF (não permitida via app — solicitar
              ao suporte), todo o histórico é preservado vinculado à identidade verificada.
            </p>
          </Section>

          <Section title='8. Armazenamento dos documentos'>
            <p>
              Os documentos enviados são armazenados de forma criptografada, em ambiente segregado, com acesso
              restrito a equipe de KYC e auditoria. O prazo mínimo de retenção é de <strong>5 anos</strong> após o
              encerramento da conta, conforme exigência regulatória (Lei nº 9.613/1998, art. 10).
            </p>
            <p>
              Decorrido o prazo, os documentos são eliminados de forma segura. Veja a{' '}
              <a className='text-[#d4a843] hover:underline' href='/privacidade'>Política de Privacidade</a> para os
              direitos do titular sobre esses dados.
            </p>
          </Section>

          <Section title='9. Tempo de análise'>
            <ul className='list-disc space-y-2 pl-5'>
              <li><strong>KYC automático no cadastro:</strong> alguns segundos a poucos minutos.</li>
              <li><strong>KYC com revisão manual:</strong> até <strong>48 horas úteis</strong> após o envio completo dos documentos.</li>
              <li><strong>Casos de alta complexidade</strong> (divergência grave, suspeita de fraude): até 7 dias úteis, com retorno ao titular.</li>
            </ul>
          </Section>

          <Section title='10. Contato'>
            <p>
              Dúvidas sobre verificação ou status do KYC podem ser enviadas para{' '}
              <a className='text-[#d4a843] hover:underline' href='mailto:kyc@201bet.com'>kyc@201bet.com</a>.
            </p>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Esta política se aplica a todos os apostadores da Palpite201, em conformidade com a regulação brasileira de
          apostas de quota fixa.
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
