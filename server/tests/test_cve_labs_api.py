import importlib
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def client():
    try:
        module = importlib.import_module('server.routers.cve_labs')
    except ModuleNotFoundError:
        pytest.fail('CVE lab API has not been implemented')
    app = FastAPI()
    app.include_router(module.router)
    store = module.CveSessionStore()
    app.dependency_overrides[module.get_store] = lambda: store
    with TestClient(app) as client:
        yield client


def create(client, lab='kuksa', preset='vulnerable', **extra):
    response = client.post(f'/labs/cve/{lab}/sessions', json={'preset': preset, **extra})
    assert response.status_code == 201, response.text
    data = response.json()
    return f"/labs/cve/{lab}/sessions/{data['sessionId']}", data


def act(client, path, action, generation=0, **extra):
    return client.post(path+'/actions', json={'generation': generation, 'action': action, **extra})


def test_kuksa_http_chain_patch_and_session_isolation(client):
    path, initial = create(client)
    other, _ = create(client)
    assert (initial['generation'], initial['revision'], initial['evidenceKind']) == (0, 0, 'simulation')
    assert initial['lastResult'] is None
    assert act(client, path, 'read').json()['state']['readerObservedDoorOpen'] is False
    assert act(client, path, 'register_provider').json()['state']['readerObservedDoorOpen'] is False
    observed = act(client, path, 'read').json()
    assert observed['state']['readerObservedDoorOpen'] is True
    assert observed['state']['groundTruthDoorOpen'] is False
    assert client.get(other).json()['state']['providerRegistrations'] == {}
    reset = client.post(path+'/reset', json={'generation': 0, 'preset': 'patched'}).json()
    assert (reset['generation'], reset['revision'], reset['events']) == (1, 0, [])
    assert act(client, path, 'register_provider').status_code == 409
    denied = act(client, path, 'register_provider', 1).json()
    assert denied['lastResult']['code'] == 'PERMISSION_DENIED'
    assert act(client, path, 'read', 1).json()['state']['readerObservedDoorOpen'] is False
    normal = client.post(path+'/reset', json={'generation': 1, 'preset': 'normal'}).json()
    assert normal['state']['readerObservedDoorOpen'] is None
    assert act(client, path, 'register_provider', 2).json()['lastResult']['code'] == 'PROVIDER_REGISTERED'


def test_swupdate_http_fault_reset_and_upload_not_install(client):
    path, _ = create(client, 'swupdate')
    value = {'boundaryLength': 10, 'bufferLength': 16, 'parserStageReached': True, 'boundaryFound': True}
    broken = act(client, path, 'evaluate', input=value).json()
    assert broken['state']['calculatedLength'] == '18446744073709551614'
    assert broken['state']['simulatedServiceStatus'] == 'faulted'
    assert client.get(path).status_code == 200
    assert act(client, path, 'finish_upload').json()['lastResult']['code'] == 'SERVICE_UNAVAILABLE'
    client.post(path+'/reset', json={'generation': 0, 'preset': 'patched'})
    assert act(client, path, 'evaluate', 1, input=value).json()['state']['calculatedLength'] == '0'
    assert act(client, path, 'finish_upload', 1).json()['lastResult']['code'] == 'UPLOAD_NOT_READY'
    value['bufferLength'] = 20
    act(client, path, 'evaluate', 1, input=value)
    result = act(client, path, 'finish_upload', 1).json()
    assert result['state']['uploadStatus'] == 'completed'
    assert result['state']['installStatus'] == 'not_simulated'


@pytest.mark.parametrize('field,value', [
    ('bufferLength', -1), ('bufferLength', 257), ('bufferLength', 16.5),
    ('bufferLength', True), ('bufferLength', '16'), ('boundaryLength', 0), ('boundaryLength', 65),
    ('parserStageReached', 1), ('boundaryFound', 'true'),
])
def test_invalid_input_is_not_coerced_or_recorded(client, field, value):
    path, _ = create(client, 'swupdate')
    data = {'boundaryLength': 10, 'bufferLength': 16, 'parserStageReached': True, 'boundaryFound': True}
    data[field] = value
    assert act(client, path, 'evaluate', input=data).status_code == 422
    assert client.get(path).json()['revision'] == 0


@pytest.mark.parametrize('body', [
    {'generation': 0, 'action': 'evaluate'},
    {'generation': 0, 'action': 'read'},
    {'generation': True, 'action': 'finish_upload'},
    {'generation': 0, 'action': 'finish_upload', 'success': True},
    {'generation': 0, 'action': 'finish_upload', 'input': None},
    {'generation': 0, 'action': 'not-real'},
])
def test_wrong_action_shapes_preserve_state(client, body):
    path, _ = create(client, 'swupdate')
    assert client.post(path+'/actions', json=body).status_code == 422
    assert client.get(path).json()['revision'] == 0


@pytest.mark.parametrize('settings', [
    {'patched': False, 'sizeTBits': 8}, {'patched': False, 'sizeTBits': '64'},
    {'patched': False, 'sizeTBits': True}, {'patched': 1, 'sizeTBits': 64},
    {'patched': False, 'credentialRole': 'read', 'responseOpen': True, 'existingProvider': False},
])
def test_invalid_and_wrong_lab_settings_rejected(client, settings):
    assert client.post('/labs/cve/swupdate/sessions', json={'preset': 'normal', 'settings': settings}).status_code == 422


def test_custom_kuksa_extension_and_invalid_role(client):
    settings = {'patched': True, 'credentialRole': 'provide_primary', 'responseOpen': True, 'existingProvider': False}
    path, _ = create(client, settings=settings)
    act(client, path, 'register_provider')
    assert act(client, path, 'extend_provider').json()['lastResult']['code'] == 'PERMISSION_DENIED'
    settings['credentialRole'] = 'invalid'
    client.post(path+'/reset', json={'generation': 0, 'preset': 'normal', 'settings': settings})
    assert act(client, path, 'read', 1).json()['lastResult']['code'] == 'AUTHENTICATION_FAILED'


def test_session_and_event_limits_are_lab_local(client):
    path, session = create(client)
    other, _ = create(client, 'swupdate')
    for _ in range(101):
        assert act(client, path, 'read').status_code == 200
    events = client.get(path).json()['events']
    assert len(events) == 100
    assert (events[0]['sequence'], events[-1]['sequence']) == (2, 101)
    for _ in range(128):
        create(client)
    assert client.get(path).status_code == 404
    assert client.get(other).status_code == 200
    assert client.get('/labs/cve/swupdate/sessions/'+session['sessionId']).status_code == 404
    assert client.post('/labs/cve/nope/sessions', json={'preset': 'normal'}).status_code == 404


def test_racing_reset_leaves_fresh_model_and_rejects_late_action(client):
    path, _ = create(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        attempted = pool.submit(act, client, path, 'register_provider')
        reset = pool.submit(client.post, path+'/reset', json={'generation': 0, 'preset': 'patched'})
        assert attempted.result().status_code in (200, 409)
        assert reset.result().status_code == 200
    current = client.get(path).json()
    assert current['generation'] == 1
    assert current['state']['providerRegistrations'] == {}
    assert act(client, path, 'register_provider').status_code == 409
