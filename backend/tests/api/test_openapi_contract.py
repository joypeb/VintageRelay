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


def test_upload_photo_openapi_describes_multipart_and_responses(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/photos"]["post"]

    assert operation["operationId"] == "uploadPhoto"
    assert operation["requestBody"]["required"]
    schema = resolve(document, operation["requestBody"]["content"]["multipart/form-data"]["schema"])
    assert "file" in schema["required"]
    assert schema["properties"]["file"]["type"] == "string"
    assert schema["properties"]["file"]["format"] == "binary"
    assert {"201", "400", "401", "404", "409", "413", "415", "422", "500"} <= operation[
        "responses"
    ].keys()


def test_view_photo_openapi_describes_public_operation(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/photos/{photo_id}"]["get"]

    assert operation["operationId"] == "viewPhoto"
    assert not operation.get("security")
    assert {"200", "404", "500"} <= operation["responses"].keys()


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


def test_register_clothing_openapi_describes_request_and_responses(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/clothing"]["post"]
    assert operation["operationId"] == "registerClothing"
    assert "HTTPValidationError" not in json.dumps(operation)
    schema = resolve(document, operation["requestBody"]["content"]["application/json"]["schema"])
    assert set(schema["required"]) == {"photoIds", "description", "title", "category"}
    assert schema["additionalProperties"] is False
    assert "photoId" not in schema["properties"]
    photos = schema["properties"]["photoIds"]
    assert photos["type"] == "array" and photos["minItems"] == 1 and photos["maxItems"] == 10
    assert photos["items"]["type"] == "string"
    clothing = resolve(
        document, operation["responses"]["201"]["content"]["application/json"]["schema"]
    )
    assert "photo" not in clothing["properties"]
    assert "photos" in clothing["required"]
    assert clothing["properties"]["photos"]["type"] == "array"
    assert clothing["properties"]["photos"]["items"]["$ref"] == "#/components/schemas/ClothingPhoto"
    assert schema["properties"]["description"]["minLength"] == 1
    assert schema["properties"]["description"]["maxLength"] == 1000
    responses = operation["responses"]
    assert {"201", "400", "401", "404", "409", "422", "500"} <= responses.keys()
    for status in ("201", "400", "401", "404", "409", "422", "500"):
        assert "X-Request-ID" in responses[status]["headers"]
        if status != "201":
            assert responses[status]["content"]["application/json"]["schema"] == {
                "$ref": "#/components/schemas/ErrorResponse"
            }


def test_register_clothing_openapi_describes_category_and_measurements(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/clothing"]["post"]
    schema = resolve(document, operation["requestBody"]["content"]["application/json"]["schema"])

    category = resolve(document, schema["properties"]["category"])
    assert set(category["enum"]) == {"top", "outer", "bottom", "other"}
    assert "measurements" not in schema["required"]
    measurements = schema["properties"]["measurements"]
    if "anyOf" in measurements:
        measurements = next(
            option for option in measurements["anyOf"] if option.get("type") != "null"
        )
    measurements = resolve(document, measurements)
    assert measurements["type"] == "object"
    assert measurements["additionalProperties"] is False
    assert set(measurements["properties"]) == {
        "totalLength",
        "chest",
        "shoulder",
        "sleeve",
        "waist",
        "hem",
        "inseam",
        "thigh",
    }
    assert not measurements.get("required")
    for field in measurements["properties"].values():
        if "anyOf" in field:
            field = next(option for option in field["anyOf"] if option.get("type") != "null")
        assert resolve(document, field)["type"] == "number"


def test_register_clothing_openapi_response_requires_category_title_and_measurements(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/clothing"]["post"]
    clothing = resolve(
        document, operation["responses"]["201"]["content"]["application/json"]["schema"]
    )

    assert {"category", "title", "measurements"} <= set(clothing["required"])


def test_list_clothing_openapi_describes_filters_and_responses(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/events/{event_id}/clothing"]["get"]
    assert operation["operationId"] == "listClothing"
    assert {"200", "401", "404", "422", "500"} <= operation["responses"].keys()
    params = {parameter["name"]: parameter for parameter in operation["parameters"]}
    ownership = resolve(document, params["ownership"]["schema"])
    assert set(ownership["enum"]) == {"mine", "others", "all"}
    assert ownership["default"] == "all"
    status = resolve(document, params["status"]["schema"])
    if "anyOf" in status:
        status = next(option for option in status["anyOf"] if option.get("type") == "array")
    assert status["type"] == "array"
    assert set(resolve(document, status["items"])["enum"]) == {
        "available",
        "confirmed",
        "withdrawn",
    }


def test_get_clothing_openapi_describes_responses(client):
    document = client.get("/openapi.json").json()
    operation = document["paths"]["/api/v1/clothing/{clothing_id}"]["get"]
    assert operation["operationId"] == "getClothing"
    assert {"200", "401", "404", "500"} <= operation["responses"].keys()
