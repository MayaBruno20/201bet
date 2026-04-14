import { OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MarketService } from './market.service';
import { MultiRunnerMarketService } from './multi-runner-market.service';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? [
      'http://localhost:3501',
      'http://localhost:3511',
      'http://localhost:3503',
    ],
    credentials: true,
  },
})
export class MarketGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private interval?: NodeJS.Timeout;

  constructor(
    private readonly marketService: MarketService,
    private readonly multiRunnerService: MultiRunnerMarketService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      // Duel snapshots
      const duelSnapshots = this.marketService.getAllSnapshots();
      for (const snapshot of duelSnapshots) {
        this.server?.emit('market:update', snapshot);
      }

      // Multi-runner snapshots
      const mrSnapshots = this.multiRunnerService.getAllSnapshots();
      for (const snapshot of mrSnapshots) {
        this.server?.emit('market:multi-runner:update', snapshot);
      }
    }, 4000);
  }

  handleConnection(client: Socket) {
    // Send duel snapshots
    const duelSnapshots = this.marketService.getAllSnapshots();
    for (const snapshot of duelSnapshots) {
      client.emit('market:update', snapshot);
    }

    // Send multi-runner snapshots
    const mrSnapshots = this.multiRunnerService.getAllSnapshots();
    for (const snapshot of mrSnapshots) {
      client.emit('market:multi-runner:update', snapshot);
    }
  }

  @SubscribeMessage('market:sync')
  async handleSyncRequest(@ConnectedSocket() client: Socket, @MessageBody() payload: { duelId?: string } | undefined) {
    if (payload?.duelId) {
      const snapshot = this.marketService.getMarketSnapshot(payload.duelId);
      if (snapshot) client.emit('market:update', snapshot);
      return;
    }

    const snapshots = this.marketService.getAllSnapshots();
    for (const snapshot of snapshots) {
      client.emit('market:update', snapshot);
    }
  }

  @SubscribeMessage('market:multi-runner:sync')
  async handleMultiRunnerSync(@ConnectedSocket() client: Socket, @MessageBody() payload: { marketId?: string } | undefined) {
    if (payload?.marketId) {
      const snapshot = this.multiRunnerService.getSnapshot(payload.marketId);
      if (snapshot) client.emit('market:multi-runner:update', snapshot);
      return;
    }

    const snapshots = this.multiRunnerService.getAllSnapshots();
    for (const snapshot of snapshots) {
      client.emit('market:multi-runner:update', snapshot);
    }
  }

  @SubscribeMessage('market:bet')
  handleBetAttempt(@ConnectedSocket() client: Socket) {
    client.emit('market:error', {
      message: 'Para segurança, a confirmação da aposta é feita pela API autenticada.',
    });
  }

  /** Broadcast settlement result to all clients */
  emitSettlement(data: { marketId: string; winnerOddId: string; winnerLabel: string }) {
    this.server?.emit('market:settled', data);
  }
}
