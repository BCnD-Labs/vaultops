import { describeHostContract } from "./host-contract";
import { MemoryHost } from "./memory-host";

describeHostContract("MemoryHost", () => new MemoryHost());
