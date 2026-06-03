import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';

/** Global para que market/multi-runner/lifecycle/gateway injetem sem importar. */
@Global()
@Module({
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
