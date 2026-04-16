import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { MarketService } from './market.service';

describe('AppController', () => {
  let appController: AppController;
  const marketServiceMock = {
    getMarketSnapshot: jest.fn().mockReturnValue(null),
    getBettingBoard: jest.fn(),
    placeBet: jest.fn(),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: MarketService, useValue: marketServiceMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return backend status payload', () => {
      const payload = appController.getHealth();
      expect(payload.status).toBe('ok');
      expect(payload.service).toBe('201bet-backend');
    });
  });

  describe('market', () => {
    it('should return market snapshot', () => {
      const snapshot = appController.getSnapshot();
      expect(snapshot).toEqual(marketServiceMock.getMarketSnapshot());
    });
  });
});
