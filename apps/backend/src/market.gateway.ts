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

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) =>
      origin.trim(),
    ) ?? [
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

  constructor(private readonly marketService: MarketService) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      const snapshots = this.marketService.getAllSnapshots();
      for (const snapshot of snapshots) {
        this.server?.emit('market:update', snapshot);
      }
    }, 4000);
  }

  handleConnection(client: Socket) {
    const snapshots = this.marketService.getAllSnapshots();
    for (const snapshot of snapshots) {
      client.emit('market:update', snapshot);
    }
  }

  @SubscribeMessage('market:sync')
  async handleSyncRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { duelId?: string } | undefined,
  ) {
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

  @SubscribeMessage('market:bet')
  handleBetAttempt(@ConnectedSocket() client: Socket) {
    client.emit('market:error', {
      message:
        'Para segurança, a confirmação da aposta é feita pela API autenticada.',
    });
  }
}
