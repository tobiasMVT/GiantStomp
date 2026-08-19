import SegmentFlowRunner from "../flow/SegmentFlowRunner";
import { buildSegmentFlow } from "./buildSegmentFlow";
import { createClientHeavenHellMethods } from "./client/clientHeavenHellMethods";
import { createClientMergeGunMethods } from "./client/clientMergeGunMethods";
import { createClientBonusMysteryMethods } from "./client/clientBonusMysteryMethods";
import { createClientLightningBeeMethods } from "./client/clientLightningBeeMethods";
import { createClientActionMethods } from "./client/clientActionMethods";
import { createClientFlowMethods } from "./client/clientFlowMethods";

const DEFAULT_FLOW_TIMING = {
  breathDelay: 200
};
const ACTION_BANANA_HUNT = "bananaHunt";
const ACTION_FREESPIN_BANANA_HUNT = "freespinbananaHunt";
const LEGACY_ACTION_BANANA_HUNT = "bananaHunt";
const LEGACY_ACTION_FREESPIN_BANANA_HUNT = "freespinbananaHunt";

export class Client {
  constructor(phaserScene, { setUiState, setClientState } = {}) {
    this.scene = phaserScene;
    this.setUiState = setUiState || setClientState;
    this.segmentFlowRunner = new SegmentFlowRunner();
  }
}

Object.assign(
  Client.prototype,
  createClientHeavenHellMethods(),
  createClientMergeGunMethods(),
  createClientBonusMysteryMethods(),
  createClientLightningBeeMethods(),
  createClientActionMethods({
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    LEGACY_ACTION_BANANA_HUNT,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT
  }),
  createClientFlowMethods({
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    LEGACY_ACTION_BANANA_HUNT,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT,
    DEFAULT_FLOW_TIMING,
    buildSegmentFlow
  })
);

export default Client;
