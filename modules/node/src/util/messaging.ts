import { IMessagingService } from "@connext/messaging";
import { RpcException } from "@nestjs/microservices";

import { isXpub } from "../validator";

import { CLogger } from "./logger";

const logger = new CLogger("MessagingProvider");

export interface IMessagingProvider {
  setupSubscriptions(): void;
}

export abstract class AbstractMessagingProvider implements IMessagingProvider {
  constructor(protected readonly messaging: IMessagingService) {}

  getPublicIdentifierFromSubject(subject: string): string {
    const pubId = subject.split(".").pop(); // last item of subscription is pubId
    if (!pubId || !isXpub(pubId)) {
      throw new RpcException("Invalid public identifier in message subject");
    }
    return pubId;
  }

  async connectRequestReponse(
    pattern: string,
    processor: (subject: string, data: any) => any,
  ): Promise<void> {
    // TODO: timeout
    await this.messaging.subscribe(pattern, async (msg: any) => {
      if (msg.reply) {
        try {
          const response = await processor(msg.subject, msg.data);
          this.messaging.publish(msg.reply, {
            err: null,
            response,
          });
        } catch (e) {
          this.messaging.publish(msg.reply, {
            err: e.toString(),
            message: `Error during processor function: ${processor.name}`,
          });
          console.error(e);
        }
      }
    });
    logger.log(`Connected message pattern "${pattern}" to function ${processor.name}`);
  }

  abstract setupSubscriptions(): void;
}
