import json


def resolve(document, schema):
    while "$ref" in schema:
        reference = schema["$ref"]
        assert reference.startswith("#/")
        value = document
        for part in reference[2:].split("/"):
            value = value[part.replace("~1", "/").replace("~0", "~")]
        schema = value
    return schema


def test_create_event_openapi_describes_success_and_errors(client):
    document = client.get("/openapi.json").json()

    operation = document["paths"]["/api/v1/events"]["post"]
    responses = operation["responses"]
    assert {"201", "400", "422", "500"} <= responses.keys()
    assert "HTTPValidationError" not in json.dumps(operation)
    assert not operation.get("security")
    for status in ("201", "400", "422", "500"):
        assert "X-Request-ID" in responses[status]["headers"]
    success = resolve(document, responses["201"]["content"]["application/json"]["schema"])
    assert success["type"] == "object"
    assert {"event", "participantToken"} <= set(success["required"])
    for status in ("400", "422", "500"):
        schema = responses[status]["content"]["application/json"]["schema"]
        assert schema.get("$ref") == "#/components/schemas/ErrorResponse"
        error_response = resolve(document, schema)
        assert "error" in error_response["required"]
        error = resolve(document, error_response["properties"]["error"])
        assert {"code", "message", "details", "requestId"} <= set(error["required"])


def test_create_event_openapi_request_describes_validation_constraints(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events"]["post"]
    schema = resolve(document, operation["requestBody"]["content"]["application/json"]["schema"])

    assert {"name", "organizerDisplayName"} <= set(schema["required"])
    assert schema["additionalProperties"] is False
    assert schema["properties"]["name"]["minLength"] == 1
    assert schema["properties"]["name"]["maxLength"] == 60
    assert schema["properties"]["organizerDisplayName"]["minLength"] == 1
    assert schema["properties"]["organizerDisplayName"]["maxLength"] == 30
