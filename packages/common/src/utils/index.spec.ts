import assert from "assert";
import { utils } from "ethers";
import { splitStrByBytes, isExpired, areAllSegmentsPresent } from "../utils";
import { createMockedFlow, RPC_REQ_LARGE } from "../fixtures";

describe("test utils / splitStrByBytes", function () {
  it("should return 1 string", function () {
    const str = "helloworld";
    assert.equal(utils.toUtf8Bytes(str).byteLength, 10);
    assert.equal(splitStrByBytes(str, 10).length, 1);
  });
  it("should return 3 strings", function () {
    const str = "helloworldhelloworldhelloworld";
    assert.equal(utils.toUtf8Bytes(str).byteLength, 30);
    assert.equal(splitStrByBytes(str, 10).length, 3);
  });
});

describe("test utils / isExpired", function () {
  const createdAt = new Date("2022-09-28T00:00:00.000Z");
  const timeout = 10e3;
  const inFiveSecs = new Date(createdAt.valueOf() + 5e3);
  const inTenSecs = new Date(createdAt.valueOf() + 15e3);

  it("should return false after 5 seconds", function () {
    assert(!isExpired(timeout, inFiveSecs, createdAt));
  });
  it("should return true after 15 seconds", function () {
    assert(isExpired(timeout, inTenSecs, createdAt));
  });
});

describe("test utils / areAllSegmentsPresent", function () {
  const completeSegments = createMockedFlow(RPC_REQ_LARGE)
    .next()
    .value.toMessage()
    .toSegments();
  const incompleteSegments = completeSegments.slice(1);

  it("should return true", function () {
    assert(areAllSegmentsPresent(completeSegments));
  });
  it("should return false", function () {
    assert(!areAllSegmentsPresent(incompleteSegments));
  });
});
