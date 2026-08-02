const {DynamoDBClient, GetItemCommand, UpdateItemCommand} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME;
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const counterKey = {id: {S: "site-visits"}};

function todayInKorea() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
    body: JSON.stringify(body),
  };
}

function parseCounts(item, today) {
  return {
    today: item?.day?.S === today ? Number(item?.todayCount?.N || 0) : 0,
    total: Number(item?.total?.N || 0),
    date: today,
  };
}

async function readCounts(today) {
  const result = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: counterKey,
    ConsistentRead: true,
  }));
  return parseCounts(result.Item, today);
}

async function updateForSameDay(today) {
  const result = await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: counterKey,
    UpdateExpression: "SET #total = if_not_exists(#total, :zero) + :one, #todayCount = if_not_exists(#todayCount, :zero) + :one",
    ConditionExpression: "#day = :today",
    ExpressionAttributeNames: {
      "#total": "total",
      "#todayCount": "todayCount",
      "#day": "day",
    },
    ExpressionAttributeValues: {
      ":zero": {N: "0"},
      ":one": {N: "1"},
      ":today": {S: today},
    },
    ReturnValues: "ALL_NEW",
  }));
  return parseCounts(result.Attributes, today);
}

async function resetForNewDay(today) {
  const result = await client.send(new UpdateItemCommand({
    TableName: tableName,
    Key: counterKey,
    UpdateExpression: "SET #total = if_not_exists(#total, :zero) + :one, #todayCount = :one, #day = :today",
    ConditionExpression: "attribute_not_exists(#day) OR #day <> :today",
    ExpressionAttributeNames: {
      "#total": "total",
      "#todayCount": "todayCount",
      "#day": "day",
    },
    ExpressionAttributeValues: {
      ":zero": {N: "0"},
      ":one": {N: "1"},
      ":today": {S: today},
    },
    ReturnValues: "ALL_NEW",
  }));
  return parseCounts(result.Attributes, today);
}

async function incrementCounts(today) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await updateForSameDay(today);
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    }

    try {
      return await resetForNewDay(today);
    } catch (error) {
      if (error.name !== "ConditionalCheckFailedException") throw error;
    }
  }
  throw new Error("Counter update contention exceeded retry limit");
}

exports.handler = async event => {
  const method = event?.requestContext?.http?.method || "GET";
  const origin = event?.headers?.origin || event?.headers?.Origin || "";
  const today = todayInKorea();

  if (method === "GET") {
    return response(200, await readCounts(today));
  }

  if (method === "POST") {
    if (origin !== allowedOrigin) {
      return response(403, {error: "Origin not allowed"});
    }
    return response(200, await incrementCounts(today));
  }

  return response(405, {error: "Method not allowed"});
};
