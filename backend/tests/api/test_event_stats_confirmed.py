import pytest

from tests.api.test_intents_register_list import auth
from tests.api.test_proposals_consent_conflicts import proposal_action

pytest_plugins = ("tests.api.test_proposals_consent_conflicts",)


@pytest.mark.parametrize("closed", [False, True])
def test_organizer_event_stats_count_confirmed_exchanges(client, accepted, closed):
    (event, _, token, _, _, _), proposal = accepted
    assert proposal_action(client, proposal, token).json()["status"] == "confirmed"
    url = f"/api/v1/events/{event['event']['id']}"
    headers = auth(event["participantToken"])
    if closed:
        response = client.post(f"{url}/close", headers=headers)
        assert response.status_code == 200
        assert response.json()["stats"]["confirmedExchangeCount"] == 1
    response = client.get(url, headers=headers)
    assert response.status_code == 200
    assert response.json()["stats"]["confirmedExchangeCount"] == 1
