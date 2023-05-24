import http from "http";
import WS from "isomorphic-ws";
import WebSocketHelper from "./ws-helper";
import * as fixtures from "./fixtures";

describe("test ws class", function () {
  const url = "ws://localhost:1234";
  let server: WS.Server;
  let httpServer: http.Server;

  beforeEach(function () {
    httpServer = http.createServer();
    server = new WS.Server({ server: httpServer });
    httpServer.listen(1234);
  });

  afterEach(() => {
    server.close();
    httpServer.close();
    jest.clearAllMocks();
  });

  it("gets a successful connection", (done) => {
    let connection: WebSocketHelper;
    const onMessageSpy = jest.fn((_data) => {
      // on message listener works

      connection.close();
      done();
    });

    server.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(fixtures.ENCODED_HOPRD_MESSAGE);
      });
    });

    connection = new WebSocketHelper(url, onMessageSpy);
    connection.setUpEventHandlers();
    connection.waitUntilSocketOpen().then((conn) => {
      conn.send("i am connected");
    });
  });
  it("connection is lost and re established", (done) => {
    const reconnectDelay = 10;
    const setUpEventHandlersSpy = jest.spyOn(
      WebSocketHelper.prototype,
      "setUpEventHandlers"
    );
    let helper: WebSocketHelper;

    helper = new WebSocketHelper(url, () => {}, { reconnectDelay });
    helper.setUpEventHandlers();
    // @ts-ignore
    helper.socket.on("error", () => {
      // should have been called twice
      expect(setUpEventHandlersSpy.mock.calls.length).toEqual(2);
      helper.close();
      done();
    });
    helper.waitUntilSocketOpen().then(() => {
      // @ts-ignore
      helper.socket.emit("error", "error from tests");
    });
  });
  it("on error is emitted when ping is not received", (done) => {
    const reconnectDelay = 100000;
    const maxTimeWithoutPing = 1000;
    const setUpEventHandlersSpy = jest.spyOn(
      WebSocketHelper.prototype,
      "setUpEventHandlers"
    );
    let helper: WebSocketHelper;

    helper = new WebSocketHelper(url, () => {}, {
      reconnectDelay,
      maxTimeWithoutPing,
    });
    helper.setUpEventHandlers();
    // @ts-ignore
    helper.socket.on("error", () => {
      // should have been called twice because ping was not received
      expect(setUpEventHandlersSpy.mock.calls.length).toBeGreaterThan(1);
      helper.close();
      done();
    });
  });
  it("on error is not emitted when ping is received", (done) => {
    const maxTimeWithoutPing = 100;

    server.on("connection", (ws) => {
      const pingInterval = setInterval(() => {
        ws.ping();
      }, maxTimeWithoutPing / 4);

      ws.on("close", () => {
        clearInterval(pingInterval);
      });
    });

    const reconnectDelay = 100000;
    const waitUntilSocketOpenSpy = jest.spyOn(
      WebSocketHelper.prototype,
      "waitUntilSocketOpen"
    );
    let helper: WebSocketHelper;

    helper = new WebSocketHelper(url, () => {}, {
      reconnectDelay,
      maxTimeWithoutPing,
    });
    helper.setUpEventHandlers();
    helper.waitUntilSocketOpen();

    // wait for 2 heartbeats
    setTimeout(() => {
      helper.close();
      expect(waitUntilSocketOpenSpy.mock.calls.length).toEqual(1);
      done();
    }, maxTimeWithoutPing * 2);
  });
});
