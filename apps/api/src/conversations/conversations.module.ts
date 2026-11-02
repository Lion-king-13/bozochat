import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationManagementService } from './conversation-management.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationManagementService, MessagesService],
  exports: [ConversationsService, ConversationManagementService, MessagesService],
})
export class ConversationsModule {}
