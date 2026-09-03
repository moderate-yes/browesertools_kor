function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers && request.headers.host && request.headers.host.value;

  if (host === "korean.browsertools.kr") {
    var location = "https://browsertools.kr" + uri;
    var querystring = request.querystring || {};
    var queryParts = [];

    for (var key in querystring) {
      if (!Object.prototype.hasOwnProperty.call(querystring, key)) {
        continue;
      }

      var parameter = querystring[key];
      var values = parameter.multiValue || [parameter];
      for (var index = 0; index < values.length; index += 1) {
        queryParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(values[index].value || ""));
      }
    }

    if (queryParts.length) {
      location += "?" + queryParts.join("&");
    }

    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: {
        location: {value: location},
        "cache-control": {value: "public, max-age=3600"},
      },
    };
  }

  if (uri.endsWith("/")) {
    request.uri += "index.html";
  } else if (!uri.includes(".")) {
    request.uri += "/index.html";
  }

  return request;
}
