import { MessagingService } from "@connext/messaging";
import {
  ResolveLinkedTransferResponse,
  GetLinkedTransferResponse,
  replaceBN,
  SimpleLinkedTransferAppState,
  LinkedTransferStatus,
  GetPendingAsyncTransfersResponse,
} from "@connext/types";
import { FactoryProvider } from "@nestjs/common/interfaces";
import { RpcException } from "@nestjs/microservices";

import { AuthService } from "../auth/auth.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId, LinkedTransferProviderId } from "../constants";
import { AbstractMessagingProvider } from "../util";
import { TransferRepository } from "../transfer/transfer.repository";
import { AppInstanceRepository } from "../appInstance/appInstance.repository";

import { LinkedTransferService } from "./linkedTransfer.service";
import { AppType } from "../appInstance/appInstance.entity";
import { CFCoreService } from "../cfCore/cfCore.service";
import { convertLinkedTransferAppState } from "@connext/apps";

export class LinkedTransferMessaging extends AbstractMessagingProvider {
  constructor(
    private readonly authService: AuthService,
    log: LoggerService,
    messaging: MessagingService,
    private readonly cfCoreService: CFCoreService,
    private readonly linkedTransferService: LinkedTransferService,
    private readonly appInstanceRepository: AppInstanceRepository,
  ) {
    super(log, messaging);
    log.setContext("LinkedTransferMessaging");
  }

  async getLinkedTransferByPaymentId(
    pubId: string,
    data: { paymentId: string },
  ): Promise<GetLinkedTransferResponse | undefined> {
    if (!data.paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(data)}`);
    }
    this.log.info(`Got fetch link request for: ${data.paymentId}`);
    // should really only ever be 1 active at a time
    // TODO: is this always true?
    // might need to check for duplicate paymentIds when we create a transfer
    const transferApps = await this.appInstanceRepository.findLinkedTransferAppsByPaymentId(
      data.paymentId,
    );
    console.log("transferApps: ", transferApps);
    console.log(
      "transferApps: ",
      transferApps.map(app => app.latestState["coinTransfers"]),
    );

    if (transferApps.length === 0) {
      return undefined;
    }

    // determine status
    let status: LinkedTransferStatus;
    // node receives transfer in sender app
    const senderApp = transferApps.find(
      app =>
        convertLinkedTransferAppState("bignumber", app.latestState as SimpleLinkedTransferAppState)
          .coinTransfers[1].to === this.cfCoreService.cfCore.freeBalanceAddress,
    );
    console.log("senderApp: ", senderApp);
    const receiverApp = transferApps.find(
      app =>
        convertLinkedTransferAppState("bignumber", app.latestState as SimpleLinkedTransferAppState)
          .coinTransfers[0].to === this.cfCoreService.cfCore.freeBalanceAddress,
    );
    console.log("receiverApp: ", receiverApp);

    if (!senderApp) {
      return undefined;
    }
    console.log(LinkedTransferStatus);

    // if sender app is uninstalled, transfer has been unlocked by node
    if (senderApp.type === AppType.UNINSTALLED) {
      status = "UNLOCKED" as LinkedTransferStatus;
      // if receiver app is uninstalled, sender may have been offline when receiver redeemed
    } else if (!receiverApp) {
      status = "PENDING" as LinkedTransferStatus;
    } else if (receiverApp?.type === AppType.UNINSTALLED) {
      status = "REDEEMED" as LinkedTransferStatus;
    } else if (receiverApp?.type === AppType.REJECTED) {
      status = "FAILED" as LinkedTransferStatus;
    }

    // TODO: get meta and return recipient
    const latestState = convertLinkedTransferAppState(
      "bignumber",
      senderApp.latestState as SimpleLinkedTransferAppState,
    );
    return {
      amount: latestState.amount.toString(),
      meta: { todo: "fixme" },
      assetId: latestState.assetId,
      createdAt: senderApp.createdAt,
      paymentId: latestState.paymentId,
      senderPublicIdentifier: senderApp.channel.userPublicIdentifier,
      status,
      encryptedPreImage: "blah",
      receiverPublicIdentifier: "blah",
    };
  }

  async resolveLinkedTransfer(
    pubId: string,
    { paymentId }: { paymentId: string },
  ): Promise<ResolveLinkedTransferResponse> {
    this.log.debug(
      `Got resolve link request with data: ${JSON.stringify(paymentId, replaceBN, 2)}`,
    );
    if (!paymentId) {
      throw new RpcException(`Incorrect data received. Data: ${JSON.stringify(paymentId)}`);
    }
    const response = await this.linkedTransferService.resolveLinkedTransfer(pubId, paymentId);
    return {
      ...response,
      amount: response.amount.toString(),
    };
  }

  async getPendingTransfers(pubId: string): Promise<GetPendingAsyncTransfersResponse[]> {
    throw new Error("Not implemented");
  }

  async setupSubscriptions(): Promise<void> {
    await super.connectRequestReponse(
      "*.transfer.fetch-linked",
      this.authService.parseXpub(this.getLinkedTransferByPaymentId.bind(this)),
    );
    await super.connectRequestReponse(
      "*.transfer.resolve-linked",
      this.authService.parseXpub(this.resolveLinkedTransfer.bind(this)),
    );
    await super.connectRequestReponse(
      "*.transfer.get-pending",
      this.authService.parseXpub(this.getPendingTransfers.bind(this)),
    );
  }
}

export const linkedTransferProviderFactory: FactoryProvider<Promise<void>> = {
  inject: [
    AuthService,
    LoggerService,
    MessagingProviderId,
    CFCoreService,
    LinkedTransferService,
    AppInstanceRepository,
  ],
  provide: LinkedTransferProviderId,
  useFactory: async (
    authService: AuthService,
    logging: LoggerService,
    messaging: MessagingService,
    cfCoreService: CFCoreService,
    linkedTransferService: LinkedTransferService,
    appInstanceRepository: AppInstanceRepository,
  ): Promise<void> => {
    const transfer = new LinkedTransferMessaging(
      authService,
      logging,
      messaging,
      cfCoreService,
      linkedTransferService,
      appInstanceRepository,
    );
    await transfer.setupSubscriptions();
  },
};
