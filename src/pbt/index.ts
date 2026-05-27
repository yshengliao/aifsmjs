export {
  commandsFromMachine,
  initialModel,
  type EventArbitraries,
  type FsmCommand,
  type FsmModel,
} from "./commands.js";

export {
  assertAll,
  assignDoesNotMutate,
  guardsFalseNoTransition,
  reachableStatesSubsetDeclared,
  replayEqualsFold,
  snapshotAlwaysFrozen,
  unknownEventNoOp,
  type AssertOpts,
} from "./properties.js";

// Convenience namespace mirroring the README:
//   import { properties } from "aifsmjs/pbt"
//   properties.snapshotAlwaysFrozen(...)
import * as propertiesModule from "./properties.js";
export const properties = propertiesModule;
