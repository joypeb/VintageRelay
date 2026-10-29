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


def test_read_event_openapi_describes_success_and_errors(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}"]["get"]
    responses = operation["responses"]
    assert {"200", "401", "404", "500"} <= responses.keys()
    assert "422" not in responses
    assert "HTTPValidationError" not in json.dumps(operation)
    assert "HTTPValidationError" not in document["components"]["schemas"]
    for status in ("200", "401", "404", "500"):
        assert "X-Request-ID" in responses[status]["headers"]
    success = resolve(document, responses["200"]["content"]["application/json"]["schema"])
    assert success["type"] == "object"
    assert {
        "id",
        "name",
        "status",
        "entryCode",
        "entryUrl",
        "organizerParticipantId",
        "createdAt",
        "closedAt",
        "me",
        "stats",
    } <= set(success["required"])
    assert "participantToken" not in success["properties"]
    for status in ("401", "404", "500"):
        assert responses[status]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"
        }
    assert operation["security"]
    scheme_name = next(iter(operation["security"][0]))
    scheme = document["components"]["securitySchemes"][scheme_name]
    assert scheme["type"] == "http"
    assert scheme["scheme"].lower() == "bearer"
    post = document["paths"]["/api/v1/events"]["post"]
    assert set(post["responses"]) == {"201", "400", "422", "500"}
    assert post["responses"]["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ErrorResponse"
    }


def test_close_event_openapi_describes_bodyless_secure_operation(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/close"]["post"]
    assert operation["operationId"] == "closeEvent"
    assert "requestBody" not in operation
    parameter = next(p for p in operation["parameters"] if p["name"] == "event_id")
    assert parameter["in"] == "path" and parameter["required"]
    assert resolve(document, parameter["schema"])["type"] == "string"
    assert operation["security"]
    scheme = document["components"]["securitySchemes"][next(iter(operation["security"][0]))]
    assert scheme["type"] == "http" and scheme["scheme"].lower() == "bearer"
    responses = operation["responses"]
    assert set(responses) == {"200", "401", "403", "404", "500"}
    assert "HTTPValidationError" not in json.dumps(operation)
    for response in responses.values():
        assert "X-Request-ID" in response["headers"]
    event = resolve(document, responses["200"]["content"]["application/json"]["schema"])
    assert {
        "id",
        "name",
        "status",
        "entryCode",
        "entryUrl",
        "organizerParticipantId",
        "createdAt",
        "closedAt",
        "me",
        "stats",
    } <= set(event["required"])
    assert "participantToken" not in event["properties"]
    for status in ("401", "403", "404", "500"):
        schema = responses[status]["content"]["application/json"]["schema"]
        error_response = resolve(document, schema)
        assert "error" in error_response["required"]
        error = resolve(document, error_response["properties"]["error"])
        assert {"code", "message", "details", "requestId"} <= set(error["required"])
    create = document["paths"]["/api/v1/events"]["post"]
    assert {"400", "422"} <= create["responses"].keys()


def test_lookup_entry_code_openapi_describes_public_operation(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/entry-codes/{entry_code}"]["get"]

    assert operation["operationId"] == "lookupEntryCode"
    assert not operation.get("security")
    assert {"200", "404", "500"} <= operation["responses"].keys()
    assert "422" not in operation["responses"]
    assert "HTTPValidationError" not in json.dumps(operation)


def test_join_event_openapi_describes_public_operation(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/participants"]["post"]
    assert operation["operationId"] == "joinEvent"
    assert not operation.get("security")
    responses = operation["responses"]
    assert {"201", "400", "404", "409", "422", "500"} <= responses.keys()
    assert responses["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/EventSession"
    }
