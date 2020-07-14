import {
  Opcode,
  ProtocolNames,
  ProtocolParams,
  ProtocolRoles,
  TakeActionMiddlewareContext,
} from "@connext/types";
import { getSignerAddressFromPublicIdentifier, logTime, stringify } from "@connext/utils";

import { UNASSIGNED_SEQ_NO } from "../constants";
import { getSetStateCommitment } from "../ethereum";
import { Context, PersistAppType, ProtocolExecutionFlow } from "../types";

import {
  assertIsValidSignature,
  getPureBytecode,
  parseProtocolMessage,
  generateProtocolMessageData,
} from "./utils";

const protocol = ProtocolNames.takeAction;
const { OP_SIGN, OP_VALIDATE, IO_SEND, IO_SEND_AND_WAIT, PERSIST_APP_INSTANCE } = Opcode;
/**
 * @description This exchange is described at the following URL:
 *
 * TODO: write a todo message here
 *
 */
export const TAKE_ACTION_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function* (context: Context) {
    const { message, network, preProtocolStateChannel } = context;
    const log = context.log.newContext("CF-TakeActionProtocol");
    const start = Date.now();
    let substart = start;
    const { processID, params } = message;
    const loggerId = (params as ProtocolParams.TakeAction).appIdentityHash || processID;
    log.info(`[${loggerId}] Initiation started`);
    log.debug(`[${loggerId}] Protocol initiated with params: ${stringify(params)}`);

    const {
      appIdentityHash,
      responderIdentifier,
      action,
      stateTimeout,
    } = params as ProtocolParams.TakeAction;

    if (!preProtocolStateChannel) {
      throw new Error("No state channel found for takeAction");
    }

    // 8ms
    const preAppInstance = preProtocolStateChannel.getAppInstance(appIdentityHash);

    const error = yield [
      OP_VALIDATE,
      protocol,
      {
        params,
        appInstance: preAppInstance.toJson(),
        role: ProtocolRoles.initiator,
        stateChannel: preProtocolStateChannel.toJson(),
      } as TakeActionMiddlewareContext,
    ];
    if (!!error) {
      throw new Error(error);
    }
    logTime(log, substart, `[${loggerId}] Validated action`);
    substart = Date.now();

    // 40ms
    const postProtocolStateChannel = preProtocolStateChannel.setState(
      preAppInstance,
      await preAppInstance.computeStateTransition(
        action,
        network.provider,
        getPureBytecode(preAppInstance.appDefinition, network.contractAddresses),
      ),
      stateTimeout,
    );
    logTime(log, substart, `[${loggerId}] Updated channel with new app state`);
    substart = Date.now();

    // 0ms
    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    // 0ms
    const responderAddr = getSignerAddressFromPublicIdentifier(responderIdentifier);

    const setStateCommitment = getSetStateCommitment(context, appInstance);
    const setStateCommitmentHash = setStateCommitment.hashToSign();

    // 6ms
    const mySignature = yield [OP_SIGN, setStateCommitmentHash];

    // add singly signed set state commitment to store without overwriting
    // or removing previous set state commitment to allow watcher service
    // to dispute using the `progressState` or `setAndProgressState` paths
    // using only items in the store
    await setStateCommitment.addSignatures(mySignature);

    // also save the app instance with a `latestAction`
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.UpdateInstance,
      preProtocolStateChannel,
      preAppInstance.setAction(action),
      setStateCommitment,
    ];

    // 117ms
    const m2 = yield [
      IO_SEND_AND_WAIT,
      generateProtocolMessageData(responderIdentifier, protocol, processID, 1, {
        customData: {
          signature: mySignature,
        },
        prevMessageReceived: start,
      }),
    ];
    const {
      data: {
        customData: { signature: counterpartySig },
      },
    } = parseProtocolMessage(m2);

    // 10ms
    await assertIsValidSignature(
      responderAddr,
      setStateCommitmentHash,
      counterpartySig,
      `Failed to validate responder's signature on initial set state commitment in the take-action protocol. Our commitment: ${stringify(
        setStateCommitment.toJson(),
      )}`,
    );
    logTime(log, substart, `[${loggerId}] Verified responders signature`);
    substart = Date.now();

    // add signatures and write commitment to store
    await setStateCommitment.addSignatures(mySignature, counterpartySig);

    // add sigs to most recent set state
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.UpdateInstance,
      postProtocolStateChannel,
      appInstance,
      setStateCommitment,
    ];

    logTime(log, start, `[${loggerId}] Finished Initiating`);
  } as any,

  1 /* Responding */: async function* (context: Context) {
    const { preProtocolStateChannel, message, network } = context;
    const log = context.log.newContext("CF-TakeActionProtocol");
    const start = Date.now();
    let substart = start;
    const {
      processID,
      params,
      customData: { signature: counterpartySignature },
    } = message;
    const loggerId = (params as ProtocolParams.TakeAction).appIdentityHash || processID;
    log.info(`[${loggerId}] Response started`);
    log.debug(`[${loggerId}] Protocol response started with parameters ${stringify(params)}`);

    const {
      appIdentityHash,
      initiatorIdentifier,
      action,
      stateTimeout,
    } = params as ProtocolParams.TakeAction;

    if (!preProtocolStateChannel) {
      throw new Error("No state channel found for takeAction");
    }

    // 9ms
    const preAppInstance = preProtocolStateChannel.getAppInstance(appIdentityHash);

    const error = yield [
      OP_VALIDATE,
      protocol,
      {
        params,
        appInstance: preAppInstance.toJson(),
        role: ProtocolRoles.responder,
        stateChannel: preProtocolStateChannel.toJson(),
      } as TakeActionMiddlewareContext,
    ];
    if (!!error) {
      throw new Error(error);
    }
    logTime(log, substart, `[${loggerId}] Validated action`);
    substart = Date.now();

    // 48ms
    const postProtocolStateChannel = preProtocolStateChannel.setState(
      preAppInstance,
      await preAppInstance.computeStateTransition(
        action,
        network.provider,
        getPureBytecode(preAppInstance.appDefinition, network.contractAddresses),
      ),
      stateTimeout,
    );

    // 0ms
    const appInstance = postProtocolStateChannel.getAppInstance(appIdentityHash);

    // 0ms
    const initiatorAddr = getSignerAddressFromPublicIdentifier(initiatorIdentifier);

    const setStateCommitment = getSetStateCommitment(context, appInstance);
    const setStateCommitmentHash = setStateCommitment.hashToSign();

    // 9ms
    await assertIsValidSignature(
      initiatorAddr,
      setStateCommitmentHash,
      counterpartySignature,
      `Failed to validate initiator's signature on initial set state commitment in the take-action protocol. Our commitment: ${stringify(
        setStateCommitment.toJson(),
      )}`,
    );
    logTime(log, substart, `[${loggerId}] Verified initiators signature`);
    substart = Date.now();

    // 7ms
    const mySignature = yield [OP_SIGN, setStateCommitmentHash];

    // add signatures and write commitment to store
    await setStateCommitment.addSignatures(mySignature, counterpartySignature);

    // responder will not be able to call `progressState` or
    // `setAndProgressState` so only save double signed commitment
    yield [
      PERSIST_APP_INSTANCE,
      PersistAppType.UpdateInstance,
      postProtocolStateChannel,
      appInstance,
      setStateCommitment,
    ];

    // 0ms
    yield [
      IO_SEND,
      generateProtocolMessageData(initiatorIdentifier, protocol, processID, UNASSIGNED_SEQ_NO, {
        prevMessageReceived: start,
        customData: {
          signature: mySignature,
        },
      }),
      postProtocolStateChannel,
    ];

    // 149ms
    logTime(log, start, `[${loggerId}] Finished responding`);
  },
};
