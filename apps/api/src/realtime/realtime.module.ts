import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, ConversationsModule, WorkspacesModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
