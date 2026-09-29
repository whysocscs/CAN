import importlib

import pytest


@pytest.fixture
def model():
    try:
        module = importlib.import_module('server.labs.kuksa_authorization')
    except ModuleNotFoundError:
        pytest.fail('KUKSA education model is not implemented')
    return lambda patched=False, role='read', response=True, existing=False: module.KuksaModel(
        module.KuksaConfig(patched, role, response, existing)
    )


def test_registration_does_not_change_display_until_reader_requests(model):
    lab = model()
    assert lab.snapshot()['readerObservedDoorOpen'] is None
    assert lab.apply('read').state['readerObservedDoorOpen'] is False
    assert lab.apply('register_provider').code == 'PROVIDER_REGISTERED'
    assert lab.snapshot()['readerObservedDoorOpen'] is False
    result = lab.apply('read')
    assert result.state['readerObservedDoorOpen'] is True
    assert result.state['groundTruthDoorOpen'] is False
    assert result.state['cachedDoorOpen'] is False
    assert result.state['responseSource'] == 'session_provider'


@pytest.mark.parametrize('patched,role,expected', [
    (False, 'read', 'PROVIDER_REGISTERED'),
    (True, 'read', 'PERMISSION_DENIED'),
    (True, 'provide_primary', 'PROVIDER_REGISTERED'),
    (True, 'provide_all', 'PROVIDER_REGISTERED'),
])
def test_registration_requires_provide_only_in_patched_model(model, patched, role, expected):
    lab = model(patched, role)
    before = lab.snapshot()
    assert lab.apply('register_provider').code == expected
    if expected == 'PERMISSION_DENIED':
        assert lab.snapshot() == before
        assert lab.apply('read').state['readerObservedDoorOpen'] is False


@pytest.mark.parametrize('patched', [False, True])
@pytest.mark.parametrize('action', ['read', 'register_provider', 'extend_provider'])
def test_invalid_credential_is_rejected_before_state_changes(model, patched, action):
    lab = model(patched, 'invalid')
    before = lab.snapshot()
    assert lab.apply(action).code == 'AUTHENTICATION_FAILED'
    assert lab.snapshot() == before


@pytest.mark.parametrize('patched', [False, True])
def test_existing_provider_cannot_be_overwritten(model, patched):
    lab = model(patched, 'provide_all', existing=True)
    before = lab.snapshot()
    assert lab.apply('register_provider').code == 'ALREADY_REGISTERED'
    assert lab.snapshot() == before
    result = lab.apply('read')
    assert result.state['readerObservedDoorOpen'] is False
    assert result.state['responseSource'] == 'legitimate_provider'


@pytest.mark.parametrize('patched,role,expected', [
    (False, 'provide_primary', 'PROVIDER_EXTENDED'),
    (True, 'provide_primary', 'PERMISSION_DENIED'),
    (True, 'provide_all', 'PROVIDER_EXTENDED'),
])
def test_extension_checks_secondary_signal_permission(model, patched, role, expected):
    lab = model(patched, role)
    lab.apply('register_provider')
    before = lab.snapshot()
    assert lab.apply('extend_provider').code == expected
    if expected == 'PERMISSION_DENIED':
        assert lab.snapshot() == before
    else:
        assert len(lab.snapshot()['providerRegistrations']) == 2
        assert lab.apply('extend_provider').code == 'ALREADY_REGISTERED'


def test_extension_requires_this_sessions_registered_provider(model):
    assert model(True, 'provide_all').apply('extend_provider').code == 'PROVIDER_REQUIRED'
    assert model(True, 'provide_all', existing=True).apply('extend_provider').code == 'PROVIDER_REQUIRED'


def test_snapshots_and_sessions_do_not_share_mutable_state(model):
    first, second = model(), model()
    first.apply('register_provider')
    copy = first.snapshot()
    copy['providerRegistrations'].clear()
    assert len(first.snapshot()['providerRegistrations']) == 1
    assert second.snapshot()['providerRegistrations'] == {}


def test_legitimate_provide_false_response_remains_closed(model):
    lab = model(True, 'provide_primary', response=False)
    lab.apply('register_provider')
    assert lab.apply('read').state['readerObservedDoorOpen'] is False
