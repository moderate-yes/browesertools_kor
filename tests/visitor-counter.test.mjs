import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadHandler(send) {
  class DynamoDBClient {
    send(command) { return send(command); }
  }
  class GetItemCommand {
    constructor(input) { this.kind = "get"; this.input = input; }
  }
  class UpdateItemCommand {
    constructor(input) { this.kind = "update"; this.input = input; }
  }

  const context = {
    exports: {},
    require(name) {
      assert.equal(name, "@aws-sdk/client-dynamodb");
      return {DynamoDBClient, GetItemCommand, UpdateItemCommand};
    },
    process: {env: {TABLE_NAME: "visitors", ALLOWED_ORIGIN: "https://korean.browsertools.kr"}},
    Intl,
    Date,
    JSON,
    Number,
    Error,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("aws/visitor-counter/index.js", "utf8"), context);
  return context.exports.handler;
}

test("visitor counter reads the current totals without incrementing", async () => {
  const handler = loadHandler(async command => {
    assert.equal(command.kind, "get");
    return {Item: {day: {S: "2099-01-01"}, todayCount: {N: "4"}, total: {N: "25"}}};
  });
  const result = await handler({requestContext: {http: {method: "GET"}}, headers: {}});
  assert.equal(result.statusCode, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.total, 25);
  assert.equal(body.today, 0);
});

test("visitor counter resets today and increments total atomically", async () => {
  let updates = 0;
  const handler = loadHandler(async command => {
    assert.equal(command.kind, "update");
    updates += 1;
    if (updates === 1) {
      const error = new Error("different day");
      error.name = "ConditionalCheckFailedException";
      throw error;
    }
    assert.match(command.input.ConditionExpression, /attribute_not_exists/);
    return {Attributes: {day: command.input.ExpressionAttributeValues[":today"], todayCount: {N: "1"}, total: {N: "26"}}};
  });
  const result = await handler({
    requestContext: {http: {method: "POST"}},
    headers: {origin: "https://korean.browsertools.kr"},
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body), {today: 1, total: 26, date: JSON.parse(result.body).date});
  assert.equal(updates, 2);
});

test("visitor counter rejects increment requests from another origin", async () => {
  let called = false;
  const handler = loadHandler(async () => { called = true; });
  const result = await handler({
    requestContext: {http: {method: "POST"}},
    headers: {origin: "https://example.com"},
  });
  assert.equal(result.statusCode, 403);
  assert.equal(called, false);
});
