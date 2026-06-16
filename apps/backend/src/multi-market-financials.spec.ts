import { computeMultiMarketFinancials, RunnerPoolInput } from './multi-market-financials';

const RAKE = 20;

const runners = (pools: Record<string, number>): RunnerPoolInput[] =>
  Object.entries(pools).map(([label, pool], i) => ({
    oddId: `odd-${i}`,
    label,
    pool,
    tickets: pool > 0 ? 1 : 0,
  }));

describe('computeMultiMarketFinancials (motor multi-mercado pari-mutuel)', () => {
  it('cenário normal: rake de 20% sai do topo e odds = pote líquido / pote da opção', () => {
    const f = computeMultiMarketFinancials(runners({ A: 100, B: 300, C: 600 }), RAKE);

    expect(f.totalPool).toBe(1000);
    expect(f.rakeNominal).toBe(200);
    expect(f.netPool).toBe(800);

    const [a, b, c] = f.runners;
    expect(a.projectedOdd).toBe(8);
    expect(b.projectedOdd).toBeCloseTo(800 / 300, 4);
    expect(c.projectedOdd).toBeCloseTo(800 / 600, 4);

    // Em QUALQUER cenário de vencedor, a casa fica com exatamente o rake.
    for (const r of f.runners) {
      expect(r.projectedPayout).toBeCloseTo(800, 1);
      expect(r.projectedHouseGross).toBeCloseTo(200, 1);
    }
  });

  it('esmagamento: piso 1.0 devolve o stake, margem da casa encolhe mas NUNCA fica negativa', () => {
    // 95% do pote num piloto só → odd crua 0.84, piso 1.0 aplicado.
    const f = computeMultiMarketFinancials(runners({ Favorito: 950, Azarão: 50 }), RAKE);

    const fav = f.runners[0];
    expect(fav.rawOdd).toBeCloseTo(800 / 950, 4);
    expect(fav.flooredAt1).toBe(true);
    expect(fav.projectedOdd).toBe(1);
    expect(fav.projectedPayout).toBe(950); // ganhadores recebem o stake de volta
    expect(fav.projectedHouseGross).toBe(50); // margem < 20%, porém >= 0

    const aza = f.runners[1];
    expect(aza.projectedOdd).toBe(16);
    expect(aza.projectedHouseGross).toBe(200);
  });

  it('100% num piloto: casa zera a margem mas não paga do próprio bolso (o piso 1.01 do protótipo pagaria)', () => {
    const f = computeMultiMarketFinancials(runners({ Unanimidade: 1000, Outro: 0 }), RAKE);

    const una = f.runners[0];
    expect(una.projectedOdd).toBe(1);
    expect(una.projectedPayout).toBe(1000);
    expect(una.projectedHouseGross).toBe(0); // com piso 1.01 seria -10 (casa custeando)

    // Ninguém apostou no vencedor → pote inteiro fica com a casa.
    const outro = f.runners[1];
    expect(outro.projectedOdd).toBe(0);
    expect(outro.projectedPayout).toBe(0);
    expect(outro.projectedHouseGross).toBe(1000);
  });

  it('mercado sem apostas: tudo zerado, sem divisão por zero', () => {
    const f = computeMultiMarketFinancials(runners({ A: 0, B: 0, C: 0 }), RAKE);
    expect(f.totalPool).toBe(0);
    expect(f.netPool).toBe(0);
    for (const r of f.runners) {
      expect(r.projectedOdd).toBe(0);
      expect(r.projectedPayout).toBe(0);
      expect(r.projectedHouseGross).toBe(0);
    }
  });

  it('invariante da casa: payout <= pote total e lucro bruto >= 0 em todos os cenários', () => {
    const cases: Array<Record<string, number>> = [
      { A: 10, B: 10 },
      { A: 1, B: 9999 },
      { A: 33.33, B: 66.67, C: 0.01 },
      { A: 500, B: 300, C: 150, D: 50 },
      { A: 0.01, B: 0.01, C: 0.01 },
      { A: 123456.78, B: 1 },
    ];
    for (const pools of cases) {
      const f = computeMultiMarketFinancials(runners(pools), RAKE);
      for (const r of f.runners) {
        expect(r.projectedPayout).toBeLessThanOrEqual(f.totalPool + 0.01);
        expect(r.projectedHouseGross).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('share dos potes soma ~100% quando há apostas', () => {
    const f = computeMultiMarketFinancials(runners({ A: 250, B: 250, C: 500 }), RAKE);
    const totalShare = f.runners.reduce((s, r) => s + r.poolShare, 0);
    expect(totalShare).toBeCloseTo(100, 0);
  });
});
