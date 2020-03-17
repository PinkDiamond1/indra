import { MinimalTransaction } from "@connext/types";
import {
  bigNumberify,
  Interface,
  keccak256,
  solidityPack,
  TransactionDescription,
  SigningKey,
} from "ethers/utils";

import { createAppInstanceForTest } from "../testing/utils";
import { getRandomHDNodes } from "../testing/random-signing-keys";
import { generateRandomNetworkContext } from "../testing/mocks";

import { ChallengeRegistry } from "../contracts";
import { Context } from "../types";
import { appIdentityToHash } from "../utils";

import { getSetStateCommitment, SetStateCommitment } from "./set-state-commitment";

/**
 * This test suite decodes a constructed SetState Commitment transaction object
 * to the specifications defined by Counterfactual as can be found here:
 * https://specs.counterfactual.com/06-update-protocol#commitments
 */
describe("Set State Commitment", () => {
  let commitment: SetStateCommitment;
  let tx: MinimalTransaction;

  const context = { network: generateRandomNetworkContext() } as Context;

  const appInstance = createAppInstanceForTest();

  const hdNodes = getRandomHDNodes(2);

  beforeAll(() => {
    commitment = getSetStateCommitment(
      context,
      appInstance,
    );
    commitment.signatures = [
      new SigningKey(hdNodes[0].privateKey).signDigest(commitment.hashToSign()),
      new SigningKey(hdNodes[1].privateKey).signDigest(commitment.hashToSign()),
    ];
    // TODO: (question) Should there be a way to retrieve the version
    //       of this transaction sent to the multisig vs sent
    //       directly to the app registry?
    tx = commitment.getSignedTransaction();
  });

  it("should be to ChallengeRegistry", () => {
    expect(tx.to).toBe(context.network.ChallengeRegistry);
  });

  it("should have no value", () => {
    expect(tx.value).toBe(0);
  });

  describe("the calldata", () => {
    const iface = new Interface(ChallengeRegistry.abi);
    let desc: TransactionDescription;

    beforeAll(() => {
      const { data } = tx;
      desc = iface.parseTransaction({ data });
    });

    it("should be to the setState method", () => {
      expect(desc.sighash).toBe(iface.functions.setState.sighash);
    });

    it("should contain expected AppIdentity argument", () => {
      const [channelNonce, participants, appDefinition, defaultTimeout] = desc.args[0];

      expect(channelNonce).toEqual(bigNumberify(appInstance.identity.channelNonce));
      expect(participants).toEqual(appInstance.identity.participants);
      expect(appDefinition).toBe(appInstance.identity.appDefinition);
      expect(defaultTimeout).toEqual(bigNumberify(appInstance.identity.defaultTimeout));
    });

    it("should contain expected SignedStateHashUpdate argument", () => {
      const [stateHash, versionNumber, timeout, []] = desc.args[1];
      expect(stateHash).toBe(appInstance.hashOfLatestState);
      expect(versionNumber).toEqual(bigNumberify(appInstance.versionNumber));
      expect(timeout).toEqual(bigNumberify(appInstance.timeout));
    });
  });

  it("should produce the correct hash to sign", () => {
    const hashToSign = commitment.hashToSign();

    // Based on MChallengeRegistryCore::computeStateHash
    // TODO: Probably should be able to compute this from some helper
    //       function ... maybe an ChallengeRegistry class or something
    const expectedHashToSign = keccak256(
      solidityPack(
        ["bytes1", "bytes32", "uint256", "uint256", "bytes32"],
        [
          "0x19",
          appIdentityToHash(appInstance.identity),
          appInstance.versionNumber,
          appInstance.timeout,
          appInstance.hashOfLatestState,
        ],
      ),
    );

    expect(hashToSign).toBe(expectedHashToSign);
  });
});
