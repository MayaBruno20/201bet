import { MainNav } from '@/components/site/main-nav';

export const metadata = {
  title: 'Termos de Uso — 201bet',
  description: 'Termos de uso da plataforma 201bet: elegibilidade, conta, apostas, pagamentos, responsabilidades e foro.',
};

export default function TermosPage() {
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
          <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Termos de Uso</h1>
          <p className='mt-3 text-sm text-white/60 sm:text-base'>
            Estes Termos regulam o acesso e o uso da plataforma 201bet, operada por <strong>201bet Brasil LTDA</strong>.
            Ao se cadastrar, depositar ou apostar, você declara que leu, entendeu e aceita integralmente o disposto abaixo.
          </p>
        </section>

        <article className='mt-6 space-y-6'>
          <Section title='1. Aceitação dos Termos'>
            <p>
              O cadastro na 201bet implica aceite expresso destes Termos, da{' '}
              <a className='text-[#d4a843] hover:underline' href='/privacidade'>Política de Privacidade</a>, da{' '}
              <a className='text-[#d4a843] hover:underline' href='/cookies'>Política de Cookies</a>, da{' '}
              <a className='text-[#d4a843] hover:underline' href='/kyc'>Política de KYC</a> e da{' '}
              <a className='text-[#d4a843] hover:underline' href='/antifraude'>Política Antifraude</a>.
            </p>
            <p>
              A 201bet pode modificar estes Termos a qualquer momento mediante aviso na plataforma. O uso continuado
              após a atualização caracteriza concordância com a nova versão.
            </p>
          </Section>

          <Section title='2. Elegibilidade'>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Ter no mínimo <strong>18 anos completos</strong> na data do cadastro.</li>
              <li>Possuir CPF válido, em situação regular junto à Receita Federal.</li>
              <li>Ser residente no Brasil e fornecer endereço, telefone e e-mail verificáveis.</li>
              <li>Não ser servidor público vedado pela legislação de apostas (Lei nº 14.790/2023).</li>
              <li>Não constar em lista de autoexclusão da própria 201bet ou de órgão público competente.</li>
            </ul>
            <p>
              A 201bet pode, a qualquer tempo, solicitar documentação adicional para confirmar a elegibilidade.
              A recusa em apresentar os documentos resulta em suspensão da conta.
            </p>
          </Section>

          <Section title='3. Conta de usuário'>
            <p>
              Cada CPF pode manter <strong>uma única conta</strong> ativa na 201bet. Duplicidade resulta em encerramento
              de todas as contas vinculadas e retenção de saldo até averiguação.
            </p>
            <p>
              O usuário é o único responsável pela guarda de suas credenciais (e-mail e senha). Toda atividade registrada
              na conta presume-se realizada pelo titular. Em caso de suspeita de acesso indevido, comunique imediatamente
              o suporte e altere a senha.
            </p>
            <p>
              A 201bet recomenda o uso de autenticação em dois fatores (2FA) e o cadastro de chave PIX vinculada ao CPF
              do titular para depósitos e saques.
            </p>
          </Section>

          <Section title='4. Apostas, mercados e liquidação'>
            <p>
              As apostas operam em modelo <strong>pari-mutuel</strong>: o retorno depende da composição do pote no
              fechamento do mercado. A cotação exibida antes do fechamento é estimativa e pode variar. Consulte o{' '}
              <a className='text-[#d4a843] hover:underline' href='/regulamento'>Regulamento</a> para detalhes técnicos
              do cálculo de odds e para regras específicas do Listas Brasil e do Armageddon.
            </p>
            <p>
              Em caso de cancelamento do evento, ausência ou quebra do veículo conforme regulamento, o resultado
              segue as regras de homologação descritas no Regulamento. Mercados anulados resultam em estorno integral
              das stakes.
            </p>
            <p>
              A 201bet pode <strong>recusar, limitar ou cancelar</strong> apostas em casos de evidência de erro de
              cotação, falha técnica, suspeita de combinação ou violação destes Termos.
            </p>
          </Section>

          <Section title='5. Depósitos e saques'>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Depósitos e saques são exclusivamente via PIX vinculado ao CPF do titular.</li>
              <li>Saques podem ficar retidos para verificação manual quando excederem limites pré-definidos ou quando houver divergência cadastral.</li>
              <li>Não realizamos saques em favor de terceiros sob nenhuma hipótese.</li>
              <li>Tributação de prêmios segue a legislação brasileira vigente; quando aplicável, o valor é retido na fonte antes do crédito ao titular.</li>
            </ul>
          </Section>

          <Section title='6. Condutas proibidas'>
            <p>É vedado ao usuário:</p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Utilizar bots, scripts ou qualquer automação para apostar ou navegar.</li>
              <li>Manipular cotações, criar múltiplas contas ou agir em conluio com outros usuários.</li>
              <li>Apostar em eventos sobre os quais detenha informação privilegiada (ex.: piloto, equipe técnica, organização).</li>
              <li>Utilizar valores oriundos de atividade ilícita (lavagem de dinheiro) — todos os depósitos são monitorados.</li>
              <li>Cadastrar informações falsas ou usar identidade de terceiros.</li>
            </ul>
            <p>
              Violações resultam em <strong>suspensão imediata</strong>, retenção de saldo e comunicação às autoridades
              competentes quando exigido por lei.
            </p>
          </Section>

          <Section title='7. Suspensão e encerramento'>
            <p>
              A 201bet pode suspender ou encerrar a conta unilateralmente em casos de violação destes Termos, fraude,
              inadimplência, ordem judicial, autoexclusão ou inatividade prolongada (acima de 24 meses).
            </p>
            <p>
              O usuário pode encerrar a própria conta a qualquer momento pelo painel ou por solicitação ao suporte. O
              saldo disponível é creditado via PIX no CPF do titular após validação KYC.
            </p>
          </Section>

          <Section title='8. Limitação de responsabilidade'>
            <p>
              A 201bet não se responsabiliza por:
            </p>
            <ul className='list-disc space-y-2 pl-5'>
              <li>Falhas de conectividade do usuário ou de provedores terceiros (banco, gateway PIX).</li>
              <li>Perdas decorrentes do próprio comportamento de apostas — apostar é atividade de risco.</li>
              <li>Eventos de força maior (caso fortuito, indisponibilidade de infraestrutura, ordem governamental).</li>
            </ul>
            <p>
              A responsabilidade total da 201bet, em qualquer hipótese, limita-se ao saldo disponível na conta do
              usuário no momento do evento que originou a disputa.
            </p>
          </Section>

          <Section title='9. Propriedade intelectual'>
            <p>
              Todo o conteúdo da plataforma (marcas, layout, software, regulamentos, banners) é de propriedade da
              201bet ou de seus licenciantes. É proibida a reprodução, cópia ou distribuição sem autorização expressa.
            </p>
          </Section>

          <Section title='10. Jogo responsável'>
            <p>
              A 201bet oferece ferramentas de autocontrole: limites de depósito, limites de aposta, pausa temporária e
              autoexclusão. Apostas devem ser entretenimento, não fonte de renda. Em caso de sinais de ludopatia, busque
              ajuda — <strong>CVV: 188</strong> (24h, gratuito).
            </p>
          </Section>

          <Section title='11. Lei aplicável e foro'>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial pela Lei nº
              14.790/2023 e pelas normativas da Secretaria de Prêmios e Apostas (SPA/SECAP) do Ministério da Fazenda.
            </p>
            <p>
              Fica eleito o foro da Comarca da sede da 201bet Brasil LTDA para dirimir quaisquer controvérsias
              decorrentes destes Termos, salvo direito de o consumidor optar pelo seu domicílio.
            </p>
          </Section>

          <Section title='12. Contato'>
            <p>
              Dúvidas, reclamações ou solicitações relacionadas a estes Termos podem ser enviadas para{' '}
              <a className='text-[#d4a843] hover:underline' href='mailto:suporte@201bet.com'>suporte@201bet.com</a>.
            </p>
          </Section>
        </article>

        <div className='mt-8 rounded-2xl border border-white/10 bg-[#101525] p-5 text-xs text-white/40'>
          Documento mantido pela 201bet Brasil LTDA. Em caso de divergência entre versões em diferentes idiomas, a
          versão em português prevalece.
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
